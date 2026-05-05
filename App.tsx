
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppStep, AppState, DiagnosisResult, SupportedLanguage, UI_TRANSLATIONS, API_BASE, getLocalizedDisease, getBestPractices } from './types';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const severityColor = (conf: number, healthy: boolean) => {
  if (healthy) return 'text-emerald-600';
  if (conf > 0.8) return 'text-red-500';
  if (conf > 0.5) return 'text-amber-500';
  return 'text-yellow-400';
};

const confBar = (conf: number, healthy: boolean) => {
  const pct = Math.round(conf * 100);
  const bg = healthy ? 'bg-emerald-400' : conf > 0.7 ? 'bg-red-400' : 'bg-amber-400';
  return { pct, bg };
};

/* ─── component ───────────────────────────────────────────────────────────── */
const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const savedLang = localStorage.getItem('agroscan_lang');
    const savedHistory = localStorage.getItem('agroscan_history');
    let history: DiagnosisResult[] = [];
    try {
      const parsed = savedHistory ? JSON.parse(savedHistory) : [];
      history = Array.isArray(parsed) ? parsed : [];
    } catch {
      history = [];
    }
    return {
      step: AppStep.WELCOME,
      selectedImage: null,
      selectedFile: null,
      diagnosis: null,
      error: null,
      history,
      language: (savedLang as SupportedLanguage) || 'en',
    };
  });

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = UI_TRANSLATIONS[state.language];

  /* persist language + history */
  useEffect(() => { localStorage.setItem('agroscan_lang', state.language); }, [state.language]);
  useEffect(() => {
    try {
      // Don't save raw base64 images to local storage to prevent QuotaExceededError!
      // We strip the imageUrl from the persisted history to keep it under 5MB limit.
      const historyToSave = state.history.map(h => ({ ...h, imageUrl: '' }));
      localStorage.setItem('agroscan_history', JSON.stringify(historyToSave));
    } catch (e) {
      console.warn("Could not save history to localStorage. Limit possibly exceeded.");
    }
  }, [state.history]);

  /* ── navigation helpers ── */
  const resetApp = useCallback(() => setState(p => ({ ...p, step: AppStep.WELCOME, selectedImage: null, selectedFile: null, diagnosis: null, error: null })), []);
  const goToUpload = useCallback(() => setState(p => ({ ...p, step: AppStep.UPLOAD })), []);
  const goToHistory = useCallback(() => setState(p => ({ ...p, step: AppStep.HISTORY })), []);
  const goToLibrary = useCallback(() => setState(p => ({ ...p, step: AppStep.LIBRARY })), []);
  const changeLanguage = (lang: SupportedLanguage) => { setState(p => ({ ...p, language: lang })); setShowLangMenu(false); };

  /* ── file selection ── */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () =>
      setState(p => ({ ...p, selectedImage: reader.result as string, selectedFile: file, error: null }));
    reader.readAsDataURL(file);
  };

  /* ── camera ── */
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setState(p => ({ ...p, step: AppStep.CAMERA }));
    } catch {
      setCameraError('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setState(p => ({ ...p, step: AppStep.UPLOAD }));
  };

  const captureImage = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      const url = canvas.toDataURL('image/jpeg');
      setState(p => ({ ...p, selectedImage: url, selectedFile: file, step: AppStep.UPLOAD, error: null }));
      stopCamera();
    }, 'image/jpeg');
  };

  useEffect(() => {
    if (state.step === AppStep.CAMERA && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [state.step]);

  /* ── MAIN ANALYSIS ── */
  const analyzeImage = async () => {
    if (!state.selectedFile) return;

    setState(p => ({ ...p, step: AppStep.PROCESSING, error: null }));

    try {
      // client-side compression to 512px max to save bandwidth/memory
      const compressedFile = await new Promise<File>((resolve, reject) => {
        const img = new Image();
        img.src = state.selectedImage!;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width;
          let h = img.height;
          const max = 512;
          if (w > h && w > max) { h *= max / w; w = max; }
          else if (h > max) { w *= max / h; h = max; }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
          canvas.toBlob(blob => {
            if (blob) resolve(new File([blob], 'image.jpg', { type: 'image/jpeg' }));
            else reject(new Error('Compression failed'));
          }, 'image/jpeg', 0.85);
        };
        img.onerror = () => reject(new Error('Image load failed'));
      });

      const form = new FormData();
      form.append('file', compressedFile);

      const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();

      const result: DiagnosisResult = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        timestamp: Date.now(),
        imageUrl: state.selectedImage!,
        plant: data.plant,
        disease: data.disease,
        diagnosis: data.diagnosis,
        confidence: data.confidence,
        is_healthy: data.is_healthy,
        description: data.description,
        prevention: data.prevention,
        top_predictions: data.top_predictions,
      };

      setState(p => ({
        ...p,
        step: AppStep.RESULT,
        diagnosis: result,
        history: [result, ...(Array.isArray(p.history) ? p.history : [])].slice(0, 20),  // keep last 20
      }));
    } catch (err: any) {
      const isNetwork = err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
      setState(p => ({
        ...p,
        step: AppStep.UPLOAD,
        error: isNetwork ? `Analysis failed: ${err.message}. Is the backend running?` : err.message,
      }));
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     SUB-COMPONENTS
  ═══════════════════════════════════════════════════════════════════════════ */

  const NavigationBar = () => (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-xl border-t border-slate-100 px-6 py-4 pb-8 flex justify-around items-center max-w-md mx-auto">
      {[
        { icon: 'home', label: t.navHome, action: resetApp, active: state.step === AppStep.WELCOME },
        { icon: 'center_focus_strong', label: t.navScan, action: goToUpload, active: [AppStep.UPLOAD, AppStep.RESULT, AppStep.PROCESSING].includes(state.step) },
        { icon: 'history', label: t.navHistory, action: goToHistory, active: state.step === AppStep.HISTORY },
      ].map(({ icon, label, action, active }) => (
        <button key={icon} onClick={action} className={`flex flex-col items-center gap-1 transition-colors ${active ? 'text-primary' : 'text-slate-400'}`}>
          <span className="material-icons">{icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
        </button>
      ))}
      <button onClick={goToLibrary} className={`flex flex-col items-center gap-1 transition-colors ${state.step === AppStep.LIBRARY ? 'text-primary' : 'text-slate-400'}`}>
        <span className="material-icons">school</span>
        <span className="text-[10px] font-bold uppercase tracking-tighter">{t.navLibrary}</span>
      </button>
    </nav>
  );

  const LanguageSelector = () => {
    const labels: Record<SupportedLanguage, string> = {
      en: 'English', hi: 'हिन्दी', mr: 'मराठी', te: 'తెలుగు',
      ta: 'தமிழ்', bn: 'বাংলা', gu: 'ગુજરાતી', kn: 'ಕನ್ನಡ', pa: 'ਪੰਜਾਬੀ'
    };
    return (
      <div className="relative">
        <button onClick={() => setShowLangMenu(!showLangMenu)}
          className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 hover:bg-slate-100 transition-colors">
          <span className="material-icons text-sm text-slate-400">translate</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{state.language}</span>
        </button>
        {showLangMenu && (
          <div className="absolute right-0 mt-2 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[200] max-h-64 overflow-y-auto custom-scrollbar">
            {(Object.keys(labels) as SupportedLanguage[]).map(lang => (
              <button key={lang} onClick={() => changeLanguage(lang)}
                className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-primary/10 flex items-center justify-between ${state.language === lang ? 'text-primary' : 'text-slate-600'}`}>
                <span>{labels[lang]}</span>
                {state.language === lang && <span className="material-icons text-xs">check_circle</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     WELCOME
  ═══════════════════════════════════════════════════════════════════════════ */
  if (state.step === AppStep.WELCOME) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white max-w-md mx-auto relative overflow-hidden px-10">
      <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-10 right-10 z-20"><LanguageSelector /></div>

      <div className="relative mb-14 group">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl scale-125" />
        <div className="relative w-40 h-40 bg-primary/10 rounded-full flex items-center justify-center border border-primary/30">
          <div className="w-28 h-28 bg-primary rounded-full flex items-center justify-center shadow-xl shadow-primary/30">
            <span className="material-icons text-white text-6xl">eco</span>
          </div>
        </div>
      </div>

      <div className="text-center space-y-5 mb-20 relative z-10">
        <h1 className="text-4xl font-bold tracking-tight text-slate-800 leading-tight">
          {t.welcomeTitle} <br /><span className="text-primary">{t.welcomeTitleAccent}</span>
        </h1>
        <p className="text-slate-500 text-lg leading-relaxed font-medium">{t.welcomeSub}</p>
      </div>

      <div className="w-full space-y-4 mb-12 relative z-10">
        <button onClick={goToUpload}
          className="w-full bg-primary hover:brightness-105 active:scale-95 text-background-dark font-black text-lg py-5 rounded-full shadow-2xl shadow-primary/40 transition-all flex items-center justify-center space-x-3">
          <span>{t.getStarted}</span>
          <span className="material-icons">arrow_forward</span>
        </button>
      </div>

      <div className="flex flex-col items-center space-y-3 mt-auto pb-10">
        <div className="h-1.5 w-10 bg-slate-100 rounded-full" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">AgroScan Pro v2.3</p>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════
     SHELL (header + nav wraps UPLOAD / PROCESSING / RESULT / HISTORY / CAMERA)
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto relative">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <span className="material-icons text-white">psychology</span>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">AgroScan Pro</h1>
            <p className="text-[10px] uppercase tracking-widest text-primary font-bold">CNN Powered</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <button onClick={resetApp} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
            <span className="material-icons">close</span>
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 pt-6 pb-28 overflow-y-auto custom-scrollbar">

        {/* ───── CAMERA ───── */}
        {state.step === AppStep.CAMERA && (
          <div className="fixed inset-0 z-[200] bg-black flex flex-col">
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-[30px] border-black/50 pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-white/50 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary" />
                </div>
              </div>
            </div>
            <div className="bg-black/90 p-6 pb-12 flex items-center justify-around">
              <button onClick={stopCamera} className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-white">
                <span className="material-icons">close</span>
              </button>
              <button onClick={captureImage} className="w-20 h-20 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
                <div className="w-16 h-16 rounded-full bg-primary border-2 border-white" />
              </button>
              <div className="w-12" />
            </div>
          </div>
        )}

        {/* ───── UPLOAD ───── */}
        {state.step === AppStep.UPLOAD && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {(cameraError || state.error) && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold flex items-start gap-2 border border-red-100">
                <span className="material-icons flex-shrink-0">error_outline</span>
                <span>{cameraError || state.error}</span>
              </div>
            )}

            <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 flex gap-4">
              <span className="material-icons text-primary flex-shrink-0">info</span>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">{t.captureTip}</p>
            </div>

            {/* upload buttons */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: 'photo_camera', label: t.camera, action: startCamera },
                { icon: 'collections', label: t.gallery, action: () => fileInputRef.current?.click() },
              ].map(({ icon, label, action }) => (
                <button key={icon} onClick={action}
                  className="flex flex-col items-center justify-center gap-3 py-8 bg-white border-2 border-dashed border-primary/20 rounded-2xl hover:border-primary hover:bg-primary/5 active:scale-95 transition-all group">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-all">
                    <span className="material-icons text-primary group-hover:text-white text-3xl">{icon}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                </button>
              ))}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

            {/* preview */}
            <div className="relative aspect-square w-full bg-slate-50 rounded-3xl border-2 border-slate-100 flex flex-col items-center justify-center overflow-hidden shadow-inner group">
              {state.selectedImage ? (
                <>
                  <img src={state.selectedImage} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button onClick={() => fileInputRef.current?.click()} className="bg-white text-slate-900 px-4 py-2 rounded-full font-bold text-sm">Replace Photo</button>
                  </div>
                </>
              ) : (
                <div className="relative z-10 flex flex-col items-center text-center px-8 opacity-40">
                  <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                    <span className="material-icons text-slate-400 text-5xl">image_not_supported</span>
                  </div>
                  <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">{t.awaitingInput}</h3>
                </div>
              )}
              {/* corner brackets */}
              {['top-6 left-6 border-t-4 border-l-4 rounded-tl-xl', 'top-6 right-6 border-t-4 border-r-4 rounded-tr-xl',
                'bottom-6 left-6 border-b-4 border-l-4 rounded-bl-xl', 'bottom-6 right-6 border-b-4 border-r-4 rounded-br-xl'].map((cls, i) => (
                  <div key={i} className={`absolute w-10 h-10 border-primary/50 ${cls}`} />
                ))}
            </div>

            {/* analyze button */}
            <button
              onClick={analyzeImage}
              disabled={!state.selectedFile}
              className={`w-full font-black py-5 rounded-2xl flex items-center justify-center gap-3 mt-4 uppercase tracking-wider transition-all ${state.selectedFile
                  ? 'bg-primary text-background-dark hover:brightness-105 active:scale-95 shadow-lg shadow-primary/30'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}>
              <span className="material-icons">biotech</span>
              <span>{t.analyzeBtn}</span>
            </button>
          </div>
        )}

        {/* ───── PROCESSING ───── */}
        {state.step === AppStep.PROCESSING && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 text-center">
            {/* pulse ring */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
              <div className="absolute inset-4 rounded-full border-4 border-primary/40 animate-ping [animation-delay:0.3s]" />
              <div className="w-28 h-28 bg-primary rounded-full flex items-center justify-center shadow-2xl shadow-primary/40 animate-pulse">
                <span className="material-icons text-white text-5xl">biotech</span>
              </div>
            </div>

            {state.selectedImage && (
              <div className="w-48 h-48 rounded-2xl border-4 border-primary/30 overflow-hidden shadow-xl">
                <img src={state.selectedImage} alt="Processing" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="space-y-3">
              <h2 className="text-2xl font-black text-slate-800">{t.processingTitle}</h2>
              <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xs">{t.processingSub}</p>
            </div>

            {/* animated progress bar */}
            <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-[progress_2s_ease-in-out_infinite]"
                style={{ animation: 'slideRight 1.8s ease-in-out infinite' }} />
            </div>
            <style>{`
              @keyframes slideRight {
                0%   { width: 5%;  margin-left: 0; }
                50%  { width: 60%; margin-left: 20%; }
                100% { width: 5%;  margin-left: 95%; }
              }
            `}</style>
          </div>
        )}

        {/* ───── RESULT ───── */}
        {state.step === AppStep.RESULT && state.diagnosis && (() => {
          const d = state.diagnosis;
          const localized = getLocalizedDisease(d.disease, d.is_healthy, d.confidence, state.language);
          const { pct, bg } = confBar(d.confidence, d.is_healthy);

          return (
            <div className="space-y-5 animate-in fade-in duration-500">
              {/* header card */}
              <div className={`rounded-3xl p-6 ${d.is_healthy ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${d.is_healthy ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <span className={`material-icons text-3xl ${d.is_healthy ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d.is_healthy ? 'check_circle' : 'warning'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-black uppercase tracking-widest mb-1 ${d.is_healthy ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d.is_healthy ? t.healthy : t.diseased}
                    </p>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">{d.plant}</h2>
                    <p className="text-base font-bold text-slate-600">{d.disease}</p>
                  </div>
                </div>

                {/* confidence bar */}
                <div className="mt-5 space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>{t.confidence}</span>
                    <span className={severityColor(d.confidence, d.is_healthy)}>{pct}%</span>
                  </div>
                  <div className="h-2.5 bg-white/60 rounded-full overflow-hidden">
                    <div className={`h-full ${bg} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>

              {/* image thumbnail */}
              {d.imageUrl && (
                <div className="w-full aspect-video rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm">
                  <img src={d.imageUrl} alt="Scanned leaf" className="w-full h-full object-cover" />
                </div>
              )}

              {/* description */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                  <span className="material-icons text-sm">info</span>{t.observation}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">{localized?.description ?? d.description}</p>
              </div>

              {/* prevention */}
              {d.prevention && (
                <div className={`rounded-2xl p-5 border ${d.is_healthy ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2 ${d.is_healthy ? 'text-emerald-600' : 'text-amber-600'}`}>
                    <span className="material-icons text-sm">{d.is_healthy ? 'eco' : 'healing'}</span>
                    {d.is_healthy ? t.healthy : t.prevention}
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">{localized?.prevention ?? d.prevention}</p>
                </div>
              )}

              {/* top predictions */}
              {d.top_predictions?.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <span className="material-icons text-sm">bar_chart</span>{t.topPredictions}
                  </h3>
                  <div className="space-y-3">
                    {d.top_predictions.map((p, i) => {
                      const [plant, disease] = p.label.includes('___') ? p.label.split('___') : [p.label, ''];
                      const pPct = Math.round(p.confidence * 100);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-slate-700 truncate flex-1 mr-2">{plant.replace(/_/g, ' ')} {disease && <span className="text-slate-400">– {disease.replace(/_/g, ' ')}</span>}</span>
                            <span className="text-slate-500 flex-shrink-0">{pPct}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${i === 0 ? 'bg-primary' : 'bg-slate-300'}`} style={{ width: `${pPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* disclaimer */}
              <p className="text-[10px] text-slate-400 font-medium text-center px-4">{t.expertDisclaimer}</p>

              {/* action buttons */}
              <div className="grid grid-cols-2 gap-3 pb-2">
                <button onClick={goToUpload} className="py-4 rounded-2xl bg-slate-100 text-slate-700 font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
                  <span className="material-icons text-base">arrow_back</span>{t.scanAgain}
                </button>
                <button onClick={goToHistory} className="py-4 rounded-2xl bg-primary text-background-dark font-black text-sm flex items-center justify-center gap-2 hover:brightness-105 transition-all">
                  <span className="material-icons text-base">history</span>{t.navHistory}
                </button>
              </div>
            </div>
          );
        })()}

        {/* ───── HISTORY ───── */}
        {state.step === AppStep.HISTORY && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h2 className="text-xl font-black text-slate-900">{t.historyTitle}</h2>

            {state.history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-50">
                <span className="material-icons text-6xl text-slate-300">history</span>
                <p className="font-medium text-slate-400">{t.noHistory}</p>
              </div>
            ) : (
              state.history.map(item => (
                <button
                  key={item.id}
                  onClick={() => setState(p => ({ ...p, step: AppStep.RESULT, diagnosis: item }))}
                  className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all overflow-hidden flex gap-0">
                  {/* thumbnail */}
                  <div className="w-24 h-24 bg-slate-100 flex-shrink-0 overflow-hidden">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.plant} className="w-full h-full object-cover" />
                      : <span className="material-icons text-slate-300 text-4xl m-auto flex items-center justify-center h-full">eco</span>
                    }
                  </div>
                  {/* info */}
                  <div className="flex-1 p-4 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${item.is_healthy ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                        {item.is_healthy ? t.healthy : t.diseased}
                      </span>
                    </div>
                    <p className="font-black text-slate-900 text-sm truncate">{item.plant}</p>
                    <p className="text-xs text-slate-500 font-medium truncate">{item.disease}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(item.timestamp).toLocaleString()}</p>
                  </div>
                  {/* confidence badge */}
                  <div className="flex items-center pr-4">
                    <span className={`text-sm font-black ${severityColor(item.confidence, item.is_healthy)}`}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* ───── LIBRARY ───── */}
        {state.step === AppStep.LIBRARY && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-primary/10 p-6 rounded-3xl border border-primary/20 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 mb-4">
                <span className="material-icons text-white text-3xl">school</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Farmer's Library</h2>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">Learn about common crop diseases and how to prevent them. Best practices for a healthy harvest.</p>
            </div>
            
            <div className="space-y-4 pb-4">
              <h3 className="text-lg font-black text-slate-800 px-2 flex items-center gap-2">
                <span className="material-icons text-primary">tips_and_updates</span> Farming Tips
              </h3>
              <div className="flex overflow-x-auto gap-4 pb-4 px-2 snap-x -mx-2 px-2" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
                {getBestPractices(state.language).map((practice, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-100 rounded-3xl p-5 min-w-[260px] max-w-[260px] snap-center flex-shrink-0 relative overflow-hidden group hover:bg-primary/5 transition-colors">
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                      <span className="material-icons" style={{fontSize: '120px'}}>{practice.icon}</span>
                    </div>
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4 border border-slate-100 group-hover:border-primary/20">
                      <span className="material-icons text-primary text-2xl">{practice.icon}</span>
                    </div>
                    <h4 className="font-black text-slate-800 text-base mb-2">{practice.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{practice.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 pb-4">
              <h3 className="text-lg font-black text-slate-800 px-2 flex items-center gap-2 mt-2">
                <span className="material-icons text-red-500">coronavirus</span> Disease Directory
              </h3>
              {['Bacterial Spot', 'Cercospora Leaf Spot', 'Curl Virus', 'Nutrition Deficiency', 'White Spot'].map((diseaseName) => {
                const localized = getLocalizedDisease(diseaseName, false, 0, state.language);
                if (!localized) return null;
                
                // Clean description (remove the "detected with X confidence" sentence)
                let cleanDesc = localized.description;
                const splitDesc = cleanDesc.split(/[।.]\s+/);
                if (splitDesc.length > 1) {
                  cleanDesc = splitDesc.slice(1).join('. ').trim();
                } else {
                  cleanDesc = "General information about " + diseaseName.replace(/_/g, ' ') + ".";
                }
                
                return (
                  <div key={diseaseName} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:border-primary/30 transition-all">
                    <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                        <span className="material-icons text-red-500 text-lg">coronavirus</span>
                      </div>
                      <h3 className="font-black text-lg text-slate-800">{diseaseName.replace(/_/g, ' ')}</h3>
                    </div>
                    <div className="p-5 space-y-4">
                       <div className="space-y-1.5">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                            <span className="material-icons text-xs">info</span> {t.observation || 'Description'}
                          </h4>
                          <p className="text-sm text-slate-700 leading-relaxed font-medium">{cleanDesc}</p>
                       </div>
                       <div className="space-y-1.5">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                            <span className="material-icons text-xs">healing</span> {t.prevention || 'Prevention'}
                          </h4>
                          <p className="text-sm text-slate-700 leading-relaxed font-medium">{localized.prevention}</p>
                       </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>

      <NavigationBar />
    </div>
  );
};

export default App;
