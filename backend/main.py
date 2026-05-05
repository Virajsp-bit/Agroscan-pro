from pathlib import Path
_HERE = Path(__file__).resolve().parent
_EXPORTS_DIR = _HERE / "exports"
_MODEL_PATH = _EXPORTS_DIR / "final_model_densenet.pkl"

import os
os.environ["KERAS_BACKEND"] = "torch"

import asyncio
import hashlib
import io
import json
import logging
import pickle
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
warnings.filterwarnings("ignore", message="Skipping variable loading for optimizer")

from contextlib import asynccontextmanager
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import pipeline

import keras

from schemas import DiagnosisResponse, ModelInfoResponse

# ─── Globals ──────────────────────────────────────────────────────────────────
logger = logging.getLogger("agroscan")
model = None
clip_classifier = None
_thread_pool = ThreadPoolExecutor(max_workers=2)

# Simple in-process result cache: md5(image_bytes) → DiagnosisResponse dict
_result_cache: Dict[str, dict] = {}
_CACHE_MAX_SIZE = 50  # keep last 50 unique images

# ─── Paths ────────────────────────────────────────────────────────────────────
# _HERE = Path(__file__).resolve().parent
# _EXPORTS_DIR = _HERE.parent / "exports"
# _MODEL_PATH = _EXPORTS_DIR / "final_model_densenet.pkl"

# ─── Class names ──────────────────────────────────────────────────────────────
CLASS_NAMES = [
    "Bacterial Spot",
    "Cercospora Leaf Spot",
    "Curl Virus",
    "Healthy Leaf",
    "Nutrition Deficiency",
    "White Spot"
]

# ─── Model input config ──────────────────────────────────────────────────────
# The deployed model (final_model_densenet.pkl) has input_layer shape (None, 256, 256, 3).
# Normalization (/255.0) is applied to match the Rescaling(1/255) layer in training.
_IMG_SIZE = 256   # confirmed by model input_layer_1 shape
_NORMALIZE = False # Do NOT normalize here; model now handles it internally


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, clip_classifier
    print("Loading DenseNet model...", flush=True)
    with open(str(_MODEL_PATH), "rb") as f:
        raw_model = pickle.load(f)

    # REPAIR: The exported model is missing a Rescaling(1/255) layer 
    # between the augmentation block (layer 1) and the DenseNet backbone (layer 2).
    # We reconstruct the model functional graph to insert it.
    print("Repairing DenseNet model graph...", flush=True)
    inputs = keras.Input(shape=raw_model.input_shape[1:])
    x = raw_model.layers[1](inputs)
    x = keras.layers.Rescaling(1.0 / 255.0)(x)  # Diminish pixels to [0, 1]
    for layer in raw_model.layers[2:]:
        x = layer(x)
    model = keras.Model(inputs, x)

    # Warm up DenseNet with correct 256×256 input
    print("Warming up DenseNet model...", flush=True)
    dummy = np.zeros((1, _IMG_SIZE, _IMG_SIZE, 3), dtype=np.float32)  # _IMG_SIZE=256
    model.predict(dummy, verbose=0)

    print("Loading CLIP classifier...", flush=True)
    clip_classifier = pipeline(
        "zero-shot-image-classification",
        model="openai/clip-vit-base-patch32",
        device=-1  # CPU; change to 0 for GPU
    )

    # Warm up CLIP with a dummy PIL image so first real request isn't slow
    print("Warming up CLIP...", flush=True)
    dummy_img = Image.fromarray(np.zeros((64, 64, 3), dtype=np.uint8))
    _run_clip_sync(dummy_img)

    print("All models ready.", flush=True)
    yield
    model = None
    clip_classifier = None
    _thread_pool.shutdown(wait=False)


# ─── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Chilli Disease Detection API",
    description="Backend for AgroScan Pro.",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION — 3-TIER GATE
# ═══════════════════════════════════════════════════════════════════════════════

def _tier1_heuristic(image: Image.Image) -> Tuple[bool, str]:
    """
    Fast color-space heuristic (~1ms).
    Checks if the image contains enough plant-like hues (green/yellow/brown).
    Returns (passes, reason).
    """
    try:
        small = image.resize((128, 128))  # small thumbnail just for color sampling
        hsv = np.array(small.convert("HSV"), dtype=np.float32)
        h = hsv[:, :, 0]
        s = hsv[:, :, 1]
        v = hsv[:, :, 2]

        # PIL HSV hue: 0–255. Green ≈ 60–120, Yellow ≈ 30–60, Brown ≈ 10–30
        plant_mask = (h >= 10) & (h <= 130) & (s >= 25) & (v >= 25)
        plant_ratio = float(np.mean(plant_mask))

        print(f"DEBUG [Tier1-HSV]: plant_ratio = {plant_ratio:.4f}", flush=True)

        # Very strict: if < 8% plant pixels, definitely not a leaf
        if plant_ratio < 0.08:
            return False, f"Only {plant_ratio:.1%} plant-like pixels (too low)"
        return True, f"Plant pixel ratio OK ({plant_ratio:.1%})"
    except Exception as e:
        logger.warning(f"Tier1 heuristic error: {e}")
        return True, "Heuristic skipped (error)"


# Improved CLIP labels — separate chilli from tomato more clearly
_CLIP_LABELS = [
    "a green chilli pepper leaf (capsicum)",
    "a tomato, potato, or other non-chilli plant leaf",
    "a computer screenshot, chart, or digital interface",
    "a random object, food item, animal, or person",
]
_CHILLI_LABEL = _CLIP_LABELS[0]
_OTHER_LEAF_LABEL = _CLIP_LABELS[1]

# Score thresholds
_CLIP_CHILLI_THRESHOLD = 0.15   # accept if chilli label meets this minimum
_CLIP_NONLEAF_THRESHOLD = 0.45  # reject if a non-leaf label scores >= 45%


def _run_clip_sync(image: Image.Image) -> list:
    """Synchronous CLIP call — run via thread pool to avoid blocking."""
    if clip_classifier is None:
        return []
    return clip_classifier(image, candidate_labels=_CLIP_LABELS)


async def _tier2_clip(image: Image.Image) -> Tuple[bool, str]:
    """
    Async CLIP zero-shot check (~1–3s on CPU, non-blocking via executor).
    Uses improved labels + score thresholds instead of raw top-1.
    Returns (passes, reason).
    """
    if clip_classifier is None:
        return True, "CLIP not loaded (skipped)"

    loop = asyncio.get_event_loop()
    try:
        res = await loop.run_in_executor(_thread_pool, _run_clip_sync, image)
    except Exception as e:
        logger.warning(f"CLIP inference error: {e}")
        return True, "CLIP error (skipped)"

    scores: Dict[str, float] = {r["label"]: r["score"] for r in res}
    chilli_score = scores.get(_CHILLI_LABEL, 0.0)
    other_leaf_score = scores.get(_OTHER_LEAF_LABEL, 0.0)

    # Non-leaf labels
    nonleaf_labels = _CLIP_LABELS[2:]
    nonleaf_max = max(scores.get(l, 0.0) for l in nonleaf_labels)

    print(
        f"DEBUG [Tier2-CLIP]: chilli={chilli_score:.4f}, "
        f"other_leaf={other_leaf_score:.4f}, "
        f"nonleaf_max={nonleaf_max:.4f}",
        flush=True
    )

    # 1. Hard reject: a non-leaf label (screenshot/object) dominates
    if nonleaf_max >= _CLIP_NONLEAF_THRESHOLD:
        return False, f"The image appears to be a digital screenshot or non-plant object (score={nonleaf_max:.2f})"

    # Note: We rely on DenseNet (Tier 3) to differentiate between chilli leaves and other plant leaves,
    # as zero-shot CLIP struggles to differentiate species of green leaves reliably.
    
    # 2. If it's confidently a different plant leaf AND chilli score is extremely low
    if other_leaf_score > 0.85 and chilli_score < 0.05:
        return False, "This appears to be a different type of plant leaf, not a chilli leaf."

    return True, "Leaf confirmed by CLIP — performing diagnostic sanity check"


def _tier3_densenet_sanity(probs: np.ndarray) -> Tuple[bool, str]:
    """
    Post-inference sanity check.
    If the model is uncertain across all classes, the image
    likely does not belong to the training distribution (e.g., a tomato leaf).
    Returns (passes, reason).
    """
    max_conf = float(np.max(probs))
    print(f"DEBUG [Tier3-DenseNet]: max_conf = {max_conf:.4f}", flush=True)

    # Softmax on DenseNet usually yields high confidence for in-distribution data.
    # If the highest confidence is below 65%, it's very likely an out-of-distribution leaf.
    if max_conf < 0.65:
        return False, f"The AI is not confident ({max_conf:.1%}). This may be a different plant species or an unrecognized condition."
    return True, f"DenseNet confidence OK ({max_conf:.1%})"


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _build_description(plant: str, disease: str, is_healthy: bool, conf: float) -> str:
    if is_healthy:
        return f"The {plant} leaf appears healthy with no visible signs of disease (confidence: {conf:.1%})."
    return f"{disease} detected on {plant} leaf with {conf:.1%} confidence. Prompt action is recommended."


def _build_prevention(plant: str, disease: str, is_healthy: bool) -> str:
    if is_healthy:
        return (
            "To keep the plant healthy, ensure proper spacing for air circulation, "
            "avoid overhead watering to reduce leaf wetness, apply balanced fertilizers, "
            "and routinely inspect for early signs of pests or disease."
        )
    return (
        f"For {disease} on {plant}: remove and destroy infected material, "
        "apply an appropriate treatment per local agricultural recommendations."
    )


def _cache_key(image_bytes: bytes) -> str:
    return hashlib.md5(image_bytes).hexdigest()


def _cache_store(key: str, value: dict):
    if len(_result_cache) >= _CACHE_MAX_SIZE:
        oldest = next(iter(_result_cache))
        del _result_cache[oldest]
    _result_cache[key] = value


def _preprocess_image(image: Image.Image) -> np.ndarray:
    """Resize to training dimensions (using high-quality LANCZOS) and normalize."""
    # Use LANCZOS to preserve fine details (disease spots) which are lost with BILINEAR
    img = image.resize((_IMG_SIZE, _IMG_SIZE), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)
    if _NORMALIZE:
        arr = arr / 255.0
    return np.expand_dims(arr, axis=0)


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/", tags=["Health"])
async def root():
    return {
        "message": "AgroScan Pro Backend is running",
        "model_ready": model is not None,
        "clip_ready": clip_classifier is not None,
        "backend": "Keras 3",
        "version": "2.0.0",
    }


@app.get("/model-info", response_model=ModelInfoResponse, tags=["Model"])
async def model_info():
    return ModelInfoResponse(
        model_type="keras_functional",
        num_classes=len(CLASS_NAMES),
        input_shape=[_IMG_SIZE, _IMG_SIZE, 3],
        class_names=CLASS_NAMES,
        framework="Keras 3 (PyTorch backend)",
        framework_version="3",
        exported_at="unknown",
    )


@app.post("/analyze", response_model=DiagnosisResponse, tags=["Inference"])
async def analyze_crop(file: UploadFile = File(...)):
    # ── Basic validation ──────────────────────────────────────────────────────
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

    # ── Cache lookup ──────────────────────────────────────────────────────────
    cache_key = _cache_key(image_bytes)
    if cache_key in _result_cache:
        print("DEBUG [Cache]: Returning cached result", flush=True)
        return DiagnosisResponse(**_result_cache[cache_key])

    # ── Decode image ──────────────────────────────────────────────────────────
    try:
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image decoding failed: {e}")

    # ── TIER 1: Fast HSV heuristic ────────────────────────────────────────────
    t1_pass, t1_reason = _tier1_heuristic(image)
    print(f"DEBUG [Tier1]: pass={t1_pass}, reason={t1_reason}", flush=True)
    if not t1_pass:
        raise HTTPException(
            status_code=400,
            detail=f"Image rejected: not a leaf image ({t1_reason}). Please upload a clear chilli leaf photo."
        )

    # ── TIER 2: CLIP zero-shot (async, non-blocking) ──────────────────────────
    t2_pass, t2_reason = await _tier2_clip(image)
    print(f"DEBUG [Tier2]: pass={t2_pass}, reason={t2_reason}", flush=True)
    if not t2_pass:
        raise HTTPException(
            status_code=400,
            detail=f"The uploaded image does not appear to be a chilli leaf ({t2_reason}). Please upload a valid chilli leaf image."
        )

    # ── Preprocess for DenseNet ───────────────────────────────────────────────
    try:
        input_batch = _preprocess_image(image)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image preprocessing failed: {e}")

    # ── DenseNet inference ────────────────────────────────────────────────────
    try:
        if model is None:
            raise HTTPException(status_code=503, detail="Model not initialized.")
        preds = model.predict(input_batch, verbose=0)
        probs = np.array(preds[0], dtype=np.float64)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model inference failed: {exc}")

    # ── TIER 3: DenseNet confidence sanity ───────────────────────────────────
    t3_pass, t3_reason = _tier3_densenet_sanity(probs)
    print(f"DEBUG [Tier3]: pass={t3_pass}, reason={t3_reason}", flush=True)
    if not t3_pass:
        raise HTTPException(
            status_code=400,
            detail=f"The image could not be confidently classified as a chilli leaf ({t3_reason}). Please upload a clearer photo."
        )

    # ── Build response ────────────────────────────────────────────────────────
    top3_idx = np.argsort(probs)[::-1][:3]
    pred_idx = int(top3_idx[0])
    top_label = CLASS_NAMES[pred_idx]
    top_conf = float(probs[pred_idx])

    # Detailed debug log for the user to analyze bias
    print(f"DEBUG [Inference]: Top predictions:", flush=True)
    for i, idx in enumerate(top3_idx):
        print(f"  {i+1}. {CLASS_NAMES[idx]}: {probs[idx]:.4f}", flush=True)

    plant = "Chilli"
    disease = "Healthy" if top_label == "Healthy Leaf" else top_label
    is_healthy = (top_label == "Healthy Leaf")
    diagnosis = f"{plant}___{disease.replace(' ', '_')}"

    top_predictions = [
        {"label": f"Chilli___{CLASS_NAMES[i].replace(' ', '_')}", "confidence": float(probs[i])}
        for i in top3_idx
    ]

    response_dict = dict(
        diagnosis=diagnosis,
        plant=plant,
        disease=disease,
        confidence=top_conf,
        is_healthy=is_healthy,
        description=_build_description(plant, disease, is_healthy, top_conf),
        prevention=_build_prevention(plant, disease, is_healthy),
        top_predictions=top_predictions,
    )

    # Store in cache
    _cache_store(cache_key, response_dict)

    return DiagnosisResponse(**response_dict)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
