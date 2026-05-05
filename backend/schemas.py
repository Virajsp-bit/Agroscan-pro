from pydantic import BaseModel
from typing import List, Optional

class DiagnosisResponse(BaseModel):
    diagnosis: str          # Full class label, e.g. "Tomato___Early_blight"
    plant: str              # Parsed plant name, e.g. "Tomato"
    disease: str            # Parsed disease name, e.g. "Early blight" or "Healthy"
    confidence: float       # Top-1 confidence in [0, 1]
    is_healthy: bool        # True when the predicted class contains "healthy"
    description: str        # Human-readable summary
    prevention: str         # Actionable advice
    top_predictions: List[dict]  # Top-3 [{label, confidence}] for transparency

class ModelInfoResponse(BaseModel):
    model_type: str
    num_classes: int
    input_shape: List[int]
    class_names: List[str]
    framework: str
    framework_version: str
    exported_at: str
