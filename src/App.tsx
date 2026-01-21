import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, SkipForward, RotateCcw, Upload, Scissors, RefreshCcw, Volume2, Target, Music, X, ChevronDown, VolumeX, ChevronUp, Plus, Minus, Info, Download, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import * as BeatDetector from 'web-audio-beat-detector';
// @ts-ignore  
import { SoundTouch, SimpleFilter } from 'soundtouchjs';

// IndexedDB Setup
const DB_NAME = 'ABCDAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audioFiles';

interface IndexedDBFile {
  id: string;
  name: string;
  blob: Blob;
  duration: number;
  loopStart: number;
  loopEnd: number;
  waveform: number[];
  timestamp: number;
}

// SOSTITUISCI la funzione openDB (righe ~23-37) con questa:
let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    // ✅ Se il database è già aperto, riutilizzalo
    if (dbInstance && dbInstance.objectStoreNames.contains(STORE_NAME)) {
      resolve(dbInstance);
      return;
    }
    
    // ✅ Chiudi solo se era in uno stato invalido
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch (e) {
        console.warn('Errore chiusura DB precedente:', e);
      }
      dbInstance = null;
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      
      // ✅ Gestisci chiusura inaspettata
      dbInstance.onclose = () => {
        console.warn('⚠️ Database chiuso inaspettatamente');
        dbInstance = null;
      };
      
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};


// SOSTITUISCI saveFileToIndexedDB (righe ~38-57) con questo:
const saveFileToIndexedDB = async (fileData: IndexedDBFile): Promise<void> => {
  console.log('💾 saveFileToIndexedDB chiamata con:', fileData.name, 'ID:', fileData.id);
  const db = await openDB();
  console.log('✅ Database aperto');
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // ✅ VERIFICA che il blob sia valido
      if (!fileData.blob || fileData.blob.size === 0) {
        console.error('❌ Blob invalido:', fileData.blob);
        reject(new Error('Blob invalido'));
        return;
      }
      
      console.log('📝 Provo a salvare:', {
        id: fileData.id,
        name: fileData.name,
        blobSize: (fileData.blob.size / 1024 / 1024).toFixed(2) + 'MB'
      });
      
      const request = store.put(fileData);
      
      request.onsuccess = () => {
        console.log('✅ File EFFETTIVAMENTE salvato in IndexedDB!', fileData.name, 'ID:', fileData.id);
        
        // ✅ VERIFICA che sia stato salvato
        const verifyRequest = store.get(fileData.id);
        verifyRequest.onsuccess = () => {
          if (verifyRequest.result) {
            console.log('✅ VERIFICA OK: File trovato in IndexedDB');
            resolve();
          } else {
            console.error('❌ VERIFICA FALLITA: File non trovato dopo put()!');
            reject(new Error('Verifica fallita'));
          }
        };
        verifyRequest.onerror = () => {
          console.error('❌ Errore verifica:', verifyRequest.error);
          reject(verifyRequest.error);
        };
      };
      
      request.onerror = () => {
        console.error('❌ Errore salvataggio:', request.error);
        reject(request.error);
      };
      
      transaction.onerror = () => {
        console.error('❌ Errore transazione:', transaction.error);
        reject(transaction.error);
      };
      
    } catch (error) {
      console.error('❌ Eccezione in saveFileToIndexedDB:', error);
      reject(error);
    }
  });
};

const getFileFromIndexedDB = async (id: string): Promise<IndexedDBFile | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

// SOSTITUISCI getAllFilesFromIndexedDB (righe ~103-116):
const getAllFilesFromIndexedDB = async (): Promise<IndexedDBFile[]> => {
  console.log('🔍 getAllFilesFromIndexedDB: apertura database...');
  
  // ✅ ASPETTA 100ms per assicurarsi che le transazioni di scrittura siano finite
  
  const db = await openDB();
  console.log('✅ Database aperto per lettura');
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const files = request.result || [];
      console.log('📦 getAllFilesFromIndexedDB trovati:', files.map(f => ({ id: f.id, name: f.name })));
      console.log('📊 Totale file:', files.length);
      resolve(files);
    };
    
    request.onerror = () => {
      console.error('❌ Errore getAll:', request.error);
      reject(request.error);
    };
  });
};

const deleteFileFromIndexedDB = async (id: string): Promise<void> => {

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const clearAllIndexedDB = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getStorageEstimate = async (): Promise<{ usage: number; quota: number }> => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  return { usage: 0, quota: 0 };
};

type PhaseKey = 'A' | 'B' | 'C' | 'D';

type PhaseStyle = {
  name: string;
  color: string;
  textColor: string;
  accent: string;
  globalBarColor: string;
};

type PhaseDurations = Record<PhaseKey, number>;
type PhasePercentages = Record<PhaseKey, number>;

const phaseOrder: PhaseKey[] = ['A', 'B', 'C', 'D'];
const INTER_PHASE_PAUSE_SECONDS = 5;

const phaseStyles: Record<PhaseKey, PhaseStyle> = {
  A: { name: 'Attenzione', color: 'from-[#4d6bb3] to-[#345997]', textColor: 'text-[#98b5f5]', accent: '#5f8dff', globalBarColor: '#537abf' },
  B: { name: 'Base', color: 'from-[#d8a343] to-[#b9852c]', textColor: 'text-[#f4d48a]', accent: '#f1b54f', globalBarColor: '#d6a855' },
  C: { name: 'Challenge', color: 'from-[#d46c4a] to-[#b55133]', textColor: 'text-[#ffb08a]', accent: '#ff865c', globalBarColor: '#e07659' },
  D: { name: 'Destinazione', color: 'from-[#3a9d7a] to-[#2a7c5f]', textColor: 'text-[#9de7c6]', accent: '#5dda9d', globalBarColor: '#47b089' }
};

const defaultPhaseDurations: PhaseDurations = { A: 3, B: 3, C: 3, D: 3 };
const defaultPhasePercentages: PhasePercentages = { A: 70, B: 85, C: 105, D: 100 };

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const value = sanitized.length === 3
    ? sanitized.split('').map(ch => ch + ch).join('')
    : sanitized;
  const numeric = parseInt(value, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeInOut' } }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeInOut' } }
};

function App() {
  const [phaseRepetitions, setPhaseRepetitions] = useState<PhaseDurations>({ A: 3, B: 3, C: 3, D: 3 });
  const [phasePercentages, setPhasePercentages] = useState<PhasePercentages>({ ...defaultPhasePercentages });
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<PhaseKey>('A');
  const [currentRepetition, setCurrentRepetition] = useState(0);
  const [totalTimeRemaining, setTotalTimeRemaining] = useState(0);
  const [isInBreak, setIsInBreak] = useState(false);
  const [countdownBeat, setCountdownBeat] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [audioVolume, setAudioVolume] = useState(0.85);
  const [clickVolume, setClickVolume] = useState(0.0);
  const [detectedBPM, setDetectedBPM] = useState<number | null>(null);
  
  type AudioFileData = {
  id: string;
  url: string;
  name: string;
  duration: number;
  loopStart: number;
  loopEnd: number;
  waveform: number[];
  bpm: number | null;
  fileHash?: string; // Per smart matching
  timestamp: number;
};

const [isEasyMode, setIsEasyMode] = useState(false);

const [audioFiles, setAudioFiles] = useState<AudioFileData[]>([]);
const [currentFileId, setCurrentFileId] = useState<string | null>(null);
const [audioFile, setAudioFile] = useState<string | null>(null);
const [audioFileName, setAudioFileName] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);
const [storageQuota, setStorageQuota] = useState(0);
const [showStorageModal, setShowStorageModal] = useState(false);
const [importPendingFiles, setImportPendingFiles] = useState<any[]>([]);
const [showImportModal, setShowImportModal] = useState(false);
const [importMatchedFiles, setImportMatchedFiles] = useState<Record<string, AudioFileData>>({});
const [sessionName, setSessionName] = useState('');
const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

const visualClickRef = useRef<HTMLDivElement>(null);
  
const [manualSyncOffset, setManualSyncOffset] = useState(0); // in millisecondi

const [audioOffset, setAudioOffset] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const globalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextPhaseOnBreakEndRef = useRef<PhaseKey>('A');
  const breakStartedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const clickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextClickTimeRef = useRef<number>(0);
  const metronomeLookaheadRef = useRef<number | null>(null);

const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Trova gli altri useRef e aggiungi questo sotto:

const originalFileUrlRef = useRef<string | null>(null);

const [pitchShift, setPitchShift] = useState(0); // semitoni: -12 a +12

const clickVolumeRef = useRef(0); // Inizializza a 0 coerentemente con lo stato

const audioVolumeRef = useRef(audioVolume);

const [isAudioMuted, setIsAudioMuted] = useState(false);
const [isClickMuted, setIsClickMuted] = useState(false); // NON è in mute

// menu a tendina brani in DB
const [allDBFiles, setAllDBFiles] = useState<IndexedDBFile[]>([]);
const [showDBFilesModal, setShowDBFilesModal] = useState(false);

const pitchShifterRef = useRef<PitchShifter | null>(null);
const processedAudioRef = useRef<AudioBuffer | null>(null);

const [pitch, setPitch] = useState(0); // Quello attualmente applicato
const [pendingPitch, setPendingPitch] = useState(0); // Quello che l'utente sta scegliendo

//icone per ridurre ogni finestra
const [collapsedSections, setCollapsedSections] = useState({
  player: false,
  waveform: false,
  controls: false,
  playlist: false,
  currentPhase: false,
  overview: false,
  bpmDetector: false
});

const toggleSection = (section: keyof typeof collapsedSections) => {
  setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
};

const SectionHeader = ({ 
  title, 
  sectionKey, 
  children 
}: { 
  title: string; 
  sectionKey: keyof typeof collapsedSections;
  children?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between mb-4">
    <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">{title}</span>
    <div className="flex items-center gap-2">
      {children}
      <button
        onClick={() => toggleSection(sectionKey)}
        className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-white/10"
        title={collapsedSections[sectionKey] ? "Espandi" : "Riduci"}
      >
        {collapsedSections[sectionKey] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  </div>
);

const isMetronomeActiveRef = useRef(false);

// Stati per il Tap Tempo
const [originalBPM, setOriginalBPM] = useState<number | null>(null);
const [tapTimes, setTapTimes] = useState<number[]>([]);

// Funzione Tap Tempo
const handleTap = () => {
  const now = performance.now();
  setTapTimes(prev => {
    const lastTap = prev[prev.length - 1];
    const isNewSequence = lastTap && (now - lastTap > 2000);
    const newTaps = isNewSequence ? [now] : [...prev, now].slice(-8);

    if (newTaps.length >= 4) {
      const recentTaps = newTaps.slice(-5);
      const intervals = [];
      for (let i = 1; i < recentTaps.length; i++) {
        intervals.push(recentTaps[i] - recentTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
      let tappedBpm = Math.round(60000 / avgInterval);
      
      // 🎯 Se sta suonando, scala il BPM per ottenere il 100%
      if (isRunning && !isPaused && !isInBreak) {
        const currentRate = getCurrentPlaybackRate();
        tappedBpm = Math.round(tappedBpm / currentRate);
      }
      
      setDetectedBPM(tappedBpm);
      setOriginalBPM(tappedBpm);
    }
    return newTaps;
  });
};

// Funzione Reset BPM

  const resetToOriginalBPM = () => {
  if (originalBPM) {
    setDetectedBPM(originalBPM);
    setManualSyncOffset(0);
    // NON fare nulla con il metronomo qui - lascia che continui
  }
};

// Funzioni per l'Offset
const adjustOffset = (amount: number) => {
  setManualSyncOffset(prev => prev + amount);
};

// Tieni il Ref aggiornato quando lo stato cambia
useEffect(() => {
  audioVolumeRef.current = audioVolume;
  if (audioRef.current) {
    audioRef.current.volume = audioVolume;
  }
}, [audioVolume]);


// --- 1. AGGIUNGI QUESTO SOPRA startMetronome ---
const workerRef = useRef<Worker | null>(null);

useEffect(() => {
  // Creiamo un "mini-worker" inline per gestire il tempo in un thread separato
  const workerCode = `
    let timerID = null;
    let interval = 25;
    self.onmessage = (e) => {
      if (e.data === "start") {
        timerID = setInterval(() => postMessage("tick"), interval);
      } else if (e.data === "stop") {
        clearInterval(timerID);
        timerID = null;
      }
    };
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  workerRef.current = new Worker(URL.createObjectURL(blob));
  
  return () => workerRef.current?.terminate();
}, []);

// Questo useEffect gestisce il ricalcolo del metronomo in tempo reale

const [isProcessing, setIsProcessing] = useState(false);

// Aggiungi questi nei useRef in alto se mancano
const nextNoteTimeRef = useRef(0);
const timerIDRef = useRef<number | null>(null);




// Aggiungi anche questo useEffect subito sotto per tenere sincronizzato il Ref
useEffect(() => {
  clickVolumeRef.current = isClickMuted ? 0 : clickVolume;
}, [clickVolume, isClickMuted]);

useEffect(() => {
  if (audioRef.current && isPreviewPlaying) {
    audioRef.current.volume = isAudioMuted ? 0 : audioVolume;
  }
}, [isAudioMuted, audioVolume, isPreviewPlaying]);

  const playCountSound = (count: number) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    const frequencies: Record<number, number> = { 1: 880, 2: 1046, 3: 1174, 4: 1318 };
    osc.frequency.value = frequencies[count] || 880;
    osc.type = 'sine';
    
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    osc.start(now);
    osc.stop(now + 0.2);
  };

// Aggiorna metronomo quando cambia BPM/offset durante preview
useEffect(() => {
  // Riavvia metronomo quando cambia BPM o offset
  if (!audioRef.current || !audioContextRef.current || !detectedBPM) return;
  
  // Durante PREVIEW
  if (isPreviewPlaying) {
    startMetronome(
      detectedBPM,
      phasePercentages.D / 100,  // <-- USA LA VELOCITÀ EASY MODE
      audioContextRef.current.currentTime,
      audioRef.current.currentTime
    );
  }
  
  // Durante ALLENAMENTO (running e non in pausa/break)
  if (isRunning && !isPaused && !isInBreak) {
    startMetronome(
      detectedBPM,
      getCurrentPlaybackRate(),
      audioContextRef.current.currentTime,
      audioRef.current.currentTime
    );
  }
}, [detectedBPM, manualSyncOffset, phasePercentages]); // IMPORTANTE: Rimuovi isPreviewPlaying dalle dipendenze per evitare loop

// Gestione barra spaziatrice per Play/Pausa
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.code === 'Space' && audioFile) {
      e.preventDefault();
      
      // In Easy Mode usa solo la preview
      if (isEasyMode) {
        handlePreview();
      } else {
        handleStartStop();
      }
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [audioFile, isRunning, isPaused, isInBreak, isEasyMode, isPreviewPlaying]);


 const playClickSound = (time: number) => {
  if (!isMetronomeActiveRef.current) return;
  
  const ctx = audioContextRef.current;
  if (!ctx) return;

  const now = ctx.currentTime;
  const delay = time - now;
  
  // 🔥 Visual LED - SYNC IMMEDIATO per mobile
  const el = visualClickRef.current;
  if (el && delay >= -0.05 && delay < 0.1) {
    // Flash immediato senza setTimeout (evita throttling mobile)
    el.style.transform = 'scale(1.2)';
    el.style.opacity = '1';
    el.style.backgroundColor = '#5dda9d';
    el.style.boxShadow = '0 0 25px #5dda9d, 0 0 45px #5dda9d';
    el.style.transition = 'none';
    
    // Forza repaint
    void el.offsetWidth;
    
    // Fade out
    requestAnimationFrame(() => {
      el.style.transition = 'all 0.12s ease-out';
      el.style.opacity = '0.1';
      el.style.transform = 'scale(1)';
      el.style.boxShadow = '0 0 5px #5dda9d';
    });
  }



  // ... resto del codice audio rimane identico
  // ... (tutto il resto del codice audio rimane invariato)
  // Audio: Controllo Mute e Volume
  const currentVol = isClickMuted ? 0 : clickVolumeRef.current;
  if (currentVol === 0) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  // Ritorno al suono Sine (più morbido/tonale)
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, time); // Frequenza meno "trapanante"

  gain.gain.setValueAtTime(0, time);
  // Attacco più dolce (5ms invece di 2ms)
  gain.gain.linearRampToValueAtTime(currentVol, time + 0.005);
  // Rilascio più naturale (decay più lungo)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

  osc.start(time);
  osc.stop(time + 0.12);
};



  const startMetronome = async (bpm: number, playbackRate: number, startTime: number, audioCurrentTime: number) => {
  // Ferma SOLO il worker, NON l'audio
  workerRef.current?.postMessage("stop");
  isMetronomeActiveRef.current = true; // <-- AGGIUNGI QUESTA RIGA
  
  if (!audioContextRef.current) {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  const ctx = audioContextRef.current;
  if (ctx.state === 'suspended') await ctx.resume();

  const secondsPerBeat = 60.0 / (bpm * playbackRate);
  const offsetCorrection = manualSyncOffset / 1000;

  const timeRelativeToFirstBeat = audioCurrentTime - audioOffset;
  const timeInCurrentBeat = ((timeRelativeToFirstBeat % secondsPerBeat) + secondsPerBeat) % secondsPerBeat;
  let timeToNextBeat = secondsPerBeat - timeInCurrentBeat;

  nextNoteTimeRef.current = ctx.currentTime + timeToNextBeat + offsetCorrection;

  workerRef.current!.onmessage = (e) => {
    if (e.data === "tick") {
      // Usa i parametri passati, non ricalcolare
      const currentSecondsPerBeat = 60.0 / (bpm * playbackRate);
      
      while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
        playClickSound(nextNoteTimeRef.current);
        nextNoteTimeRef.current += currentSecondsPerBeat;
      }
    }
  };

  workerRef.current?.postMessage("start");
};

const stopMetronome = () => {
  isMetronomeActiveRef.current = false; // <-- AGGIUNGI QUESTA RIGA
  workerRef.current?.postMessage("stop");
};

// Questa funzione ora restituisce sia il BPM che l'Offset del primo battito
const analyzeAudioMetadata = async (audioBuffer: AudioBuffer) => {
  try {
    console.log('🎯 Analisi audio profonda in corso...');
    
    // 1. Rilevamento BPM
    const result = await BeatDetector.analyze(audioBuffer);
    let bpm = typeof result === 'number' ? result : result.tempo;
    // Rimuovi l'arrotondamento per avere precisione professionale
bpm = parseFloat(bpm.toFixed(2)); 

// Correzione range (standard DJ)
while (bpm < 75) bpm *= 2; 
while (bpm > 165) bpm /= 2;

    // Logica DJ (correzione raddoppio/metà)
    if (bpm < 68) bpm *= 2; 
    if (bpm > 185) bpm /= 2;

    // 2. Rilevamento Offset (Primo Transiente)
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    let firstBeatOffset = 0;
    
    // Cerchiamo il primo picco che superi una soglia di volume (0.08)
    for (let i = 0; i < Math.min(channelData.length, sampleRate * 2); i++) {
      if (Math.abs(channelData[i]) > 0.08) {
        firstBeatOffset = i / sampleRate;
        break;
      }
    }

    if (!bpm || isNaN(bpm)) bpm = 120;

    console.log(`✅ Risultati: ${bpm} BPM, Start Offset: ${firstBeatOffset.toFixed(3)}s`);
    return { bpm, offset: firstBeatOffset };
  } catch (error) {
    console.error('❌ Errore analisi:', error);
    return { bpm: 120, offset: 0 };
  }
};

  const getPhasePercentage = (phase: PhaseKey) => phasePercentages[phase] / 100;
  
  const getCurrentPlaybackRate = () => {
    const phase = isInBreak ? nextPhaseOnBreakEndRef.current : currentPhase;
    return getPhasePercentage(phase);
  };

  const calculateTotalTime = (durations: PhaseDurations) =>
    phaseOrder.reduce((acc, phase) => acc + durations[phase] * 60, 0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(Math.max(seconds % 60, 0));
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generateWaveform = async (file: File) => {
    setIsLoadingWaveform(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
const rawData = audioBuffer.getChannelData(0);
// Salva buffer originale per pitch shifting
processedAudioRef.current = audioBuffer;
      const samples = 64; // Meno barre per stile equalizer
      const blockSize = Math.floor(rawData.length / samples);
      const filteredData: number[] = [];
      
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[i * blockSize + j]);
        }
        filteredData.push(sum / blockSize);
      }
      
      const max = Math.max(...filteredData);
      const normalized = filteredData.map(n => n / max);
      
      setWaveformData(normalized);
    } catch (error) {
      console.error('Error generating waveform:', error);
    } finally {
      setIsLoadingWaveform(false);
    }
  };
const bufferToWave = (buffer: AudioBuffer, len: number): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const data = new ArrayBuffer(44 + len * blockAlign);
  const view = new DataView(data);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  // WAV header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + len * blockAlign, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, len * blockAlign, true);
  
  // Audio data
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([data], { type: 'audio/wav' });
};

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith('audio/')) return;

setIsLoadingFile(true); // <-- AGGIUNGI QUESTA
  
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const url = URL.createObjectURL(file);
  
  setIsLoadingWaveform(true);
  
  try {
    // Genera waveform
    let waveformData: number[] = [];
    const arrayBuffer = await file.arrayBuffer();
    
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);
    const samples = 64;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData: number[] = [];
    
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j]);
      }
      filteredData.push(sum / blockSize);
    }
    
    const max = Math.max(...filteredData);
    waveformData = filteredData.map(n => n / max);
    
    // Analisi BPM e Offset
const { bpm, offset } = await analyzeAudioMetadata(audioBuffer);
setDetectedBPM(bpm);
setOriginalBPM(bpm); // <--- Salva qui il valore originale
setAudioOffset(offset); // Assicurati di avere const [audioOffset, setAudioOffset] = useState(0); nei tuoi stati
    
    // Ottieni duration
    const tempAudio = new Audio(url);
    await new Promise((resolve) => {
      tempAudio.addEventListener('loadedmetadata', resolve, { once: true });
    });
    
    const newFile: AudioFileData = {
      id,
      url,
      name: file.name,
      duration: tempAudio.duration,
      loopStart: 0,
      loopEnd: tempAudio.duration,
      waveform: waveformData,
      bpm: bpm,
      timestamp: Date.now()
    };
    console.log('🔵 Tentativo salvataggio in IndexedDB...');
    console.log('💾 File salvato con ID:', id); // ← AGGIUNGI QUESTA RIGA
    // Salva in IndexedDB
    await saveFileToIndexedDB({
      id,
      name: file.name,
      blob: file,
      duration: tempAudio.duration,
      loopStart: 0,
      loopEnd: tempAudio.duration,
      waveform: waveformData,
      timestamp: Date.now()
    });
    console.log('✅ File salvato in IndexedDB!', file.name);
    setAudioFiles(prev => [...prev, newFile]);
    loadFile(newFile);
    await updateStorageInfo();
    
  } catch (error) {
    console.error('Error uploading file:', error);
    alert('Errore nel caricamento del file');
setIsLoadingFile(false);
  } finally {
    setIsLoadingWaveform(false);
setIsLoadingFile(false);
  }
  
  event.target.value = '';
};

const applyPitchShift = async (semitones: number) => {
  if (!audioFile || !audioContextRef.current) return;

// 1. Attiva il caricamento
  setIsProcessing(true); 
  console.log('🎵 Applicando pitch shift...');

// 🎯 SALVA i valori di loop PRIMA del pitch shift
const savedLoopStart = loopStart;
const savedLoopEnd = loopEnd;
const savedDuration = audioDuration;


  
  console.log('🎵 Applicando pitch shift:', semitones, 'semitoni');
  
  try {
    const currentFileData = audioFiles.find(f => f.id === currentFileId);
    if (!currentFileData) return;
    
    const response = await fetch(currentFileData.url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    
    if (semitones === 0) {
      setAudioFile(currentFileData.url);
      return;
    }

    const nChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const pitchRatio = Math.pow(2, semitones / 12);

    // 1. Inizializzazione SoundTouch corretta
    const soundtouch = new SoundTouch();
    soundtouch.pitch = pitchRatio;

    // 2. CORREZIONE ESTRAZIONE: Gestione multicanale sicura
    const source = {
      extract: (target: Float32Array, numFrames: number, position: number) => {
        // SoundTouch richiede campioni interleaved: [L, R, L, R...]
        for (let i = 0; i < numFrames; i++) {
          for (let ch = 0; ch < nChannels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            const sampleIdx = position + i;
            if (sampleIdx < channelData.length) {
              target[i * nChannels + ch] = channelData[sampleIdx];
            } else {
              return i; // Fine del file raggiunta
            }
          }
        }
        return numFrames;
      }
    };

    const filter = new SimpleFilter(source, soundtouch);
    
    // 3. Processamento con buffer pre-allocato per performance
    // Stimiamo la lunghezza finale in base al pitch ratio
    const expectedLength = Math.ceil(audioBuffer.length / pitchRatio) * nChannels;
    const processedSamples = new Float32Array(expectedLength + 1024); 
    
    let totalExtractedSamples = 0;
    const bufferSize = 4096;
    const tempBuffer = new Float32Array(bufferSize * nChannels);

    while (true) {
      const framesExtracted = filter.extract(tempBuffer, bufferSize);
      if (framesExtracted === 0) break;
      
      const samplesToCopy = framesExtracted * nChannels;
      if (totalExtractedSamples + samplesToCopy <= processedSamples.length) {
        processedSamples.set(tempBuffer.subarray(0, samplesToCopy), totalExtractedSamples);
        totalExtractedSamples += samplesToCopy;
      } else {
        break;
      }
    }

    // 4. Creazione nuovo AudioBuffer
    const finalFrames = totalExtractedSamples / nChannels;
    const processedBuffer = audioContextRef.current.createBuffer(nChannels, finalFrames, sampleRate);

    for (let ch = 0; ch < nChannels; ch++) {
      const chData = processedBuffer.getChannelData(ch);
      for (let i = 0; i < finalFrames; i++) {
        chData[i] = processedSamples[i * nChannels + ch];
      }
    }

    // 5. Generazione Blob e aggiornamento UI
    const wavBlob = bufferToWave(processedBuffer, finalFrames);
const newUrl = URL.createObjectURL(wavBlob);

const currentTime = audioRef.current?.currentTime || 0;

// 🎯 CORREZIONE: Scala anche loopStart/loopEnd in base al pitch ratio



setAudioFile(newUrl);

// 🎯 RIPRISTINA i valori di loop salvati
setLoopStart(savedLoopStart);
setLoopEnd(savedLoopEnd);
setAudioDuration(savedDuration);



    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = currentTime;
        audioRef.current.play().then(() => {
      setIsPreviewPlaying(true); // <--- AGGIUNGI QUESTA RIGA
    }).catch((e) => console.log("Autoplay impedito:", e));
      }
    }, 250);

  } catch (error) {
    console.error('❌ Errore pitch shift:', error);
    alert('Errore: ' + error);
} finally {
    // 2. Disattiva il caricamento in ogni caso (successo o errore)
    setIsProcessing(false);
  }
};



const loadFile = async (fileData: AudioFileData) => {
  handleReset();
  setCurrentFileId(fileData.id);
  setAudioFile(fileData.url);
originalFileUrlRef.current = fileData.url; // Salva originale per pitch reset
  setAudioFileName(fileData.name);
  setAudioDuration(fileData.duration);
  setLoopStart(fileData.loopStart ?? 0);
  // ✅ CORREZIONE: Se loopEnd esiste ed è diverso da 0, usa quello. 
  // Altrimenti (file nuovo) usa la durata totale.
  if (fileData.loopEnd && fileData.loopEnd > 0) {
    setLoopEnd(fileData.loopEnd);
  } else {
    setLoopEnd(fileData.duration);
  }
  
  setWaveformData(fileData.waveform);

  // Se il BPM è già presente lo usiamo, altrimenti ricalcoliamo
  if (fileData.bpm) {
    setDetectedBPM(fileData.bpm);
  } else {
    console.log('🔄 Rilevamento BPM mancante per:', fileData.name);
    try {
      const response = await fetch(fileData.url);
      const arrayBuffer = await response.arrayBuffer();
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      const { bpm, offset } = await analyzeAudioMetadata(audioBuffer);
      
      setDetectedBPM(bpm);
setOriginalBPM(bpm); // <--- Salva qui il valore originale
      setAudioOffset(offset);
      
      // Aggiorniamo l'oggetto in locale così non lo richiede più
      fileData.bpm = bpm; 
    } catch (err) {
      console.error('Errore ricalcolo BPM:', err);
      setDetectedBPM(120); // Fallback
    }
  }
};
const removeFile = async (id: string) => {
  try {
    
    
    setAudioFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (currentFileId === id) {
        if (updated.length > 0) {
          loadFile(updated[0]);
        } else {
          clearAudioFile();
        }
      }
      return updated;
    });
    
    // ✅ NON aggiornare storage info (il file è ancora nel DB)
    console.log('🗑️ File rimosso dalla playlist (ma rimane in IndexedDB)');
  } catch (error) {
    console.error('Error removing file:', error);
  }
};

const deleteFileFromLibrary = async (id: string) => {
  const confirm = window.confirm(
    '⚠️ ATTENZIONE!\n\nQuesto cancellerà il file anche dalla libreria permanente.\nLa playlist potrà richiedere di ricaricarlo manualmente.\n\nVuoi continuare?'
  );
  
  if (!confirm) return;
  
  try {
    await deleteFileFromIndexedDB(id);
    await removeFile(id); // Rimuovi anche dalla playlist corrente
    await updateStorageInfo();
    console.log('🗑️ File cancellato definitivamente dalla libreria');
  } catch (error) {
    console.error('Error deleting file from library:', error);
  }
};

const exportSession = () => {
  const name = prompt('Nome della playlist:', sessionName || 'La mia playlist ABCD');
  if (!name) return;
  
  setSessionName(name);
  
  const sessionData = {
    version: '2.0',
    playlistName: name,
    exportDate: new Date().toISOString(),
    files: audioFiles.map(f => ({
      id: f.id,
      name: f.name,
      duration: f.duration,
      loopStart: f.loopStart,
      loopEnd: f.loopEnd,
      bpm: f.bpm,
      timestamp: f.timestamp
    })),
    phaseRepetitions,
    phasePercentages,
    currentFileId
  };
  
  const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const loadAllDBFiles = async () => {
  const files = await getAllFilesFromIndexedDB();
  setAllDBFiles(files);
  setShowDBFilesModal(true);
};

const addFileFromDB = async (dbFile: IndexedDBFile) => {
  // Verifica se è già nella playlist
  if (audioFiles.some(f => f.id === dbFile.id)) {
    alert('Questo file è già nella playlist corrente');
    return;
  }
  
  const newFile: AudioFileData = {
    id: dbFile.id,
    url: URL.createObjectURL(dbFile.blob),
    name: dbFile.name,
    duration: dbFile.duration,
    loopStart: dbFile.loopStart,
    loopEnd: dbFile.loopEnd,
    waveform: dbFile.waveform,
    bpm: null,
    timestamp: dbFile.timestamp
  };
  
  setAudioFiles(prev => [...prev, newFile]);
  alert(`✅ "${dbFile.name}" aggiunto alla playlist`);
};

// SOSTITUISCI la funzione importSession (riga ~470-541) con questa:
const importSession = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target?.result as string;
      const data = JSON.parse(text);
      
      if (!data.version || !data.files) {
        alert('File playlist non valido ❌');
        return;
      }
      
      // Carica settings globali
      setPhaseRepetitions(data.phaseRepetitions || defaultPhaseDurations);
      setPhasePercentages(data.phasePercentages || defaultPhasePercentages);
      setSessionName(data.playlistName || 'Playlist importata');
      
      // Smart matching con IndexedDB
      const existingFiles = await getAllFilesFromIndexedDB();
      console.log('📂 File in IndexedDB:', existingFiles.length);
      console.log('📋 File nella playlist:', data.files.length);
      
      const matched: Record<string, AudioFileData> = {};
      const pending: any[] = [];
      
      for (const importedFile of data.files) {
  const matchedDB = existingFiles.find(f => f.name === importedFile.name); // ✅ CORRETTO
        
        if (matchedDB) {
  const url = URL.createObjectURL(matchedDB.blob);
  matched[importedFile.id] = {
  id: importedFile.id,
  url,
  name: matchedDB.name,
  duration: matchedDB.duration,
  loopStart: importedFile.loopStart,
  loopEnd: importedFile.loopEnd,
  waveform: matchedDB.waveform,
  bpm: importedFile.bpm,
  timestamp: Date.now()
};
        } else {
          console.log('❌ Match NON trovato per:', importedFile.name);
          // File mancante
          pending.push(importedFile);
        }
      }
      
      console.log('✅ File matchati:', Object.keys(matched).length);
      console.log('⚠️ File mancanti:', pending.length);
      
      setImportMatchedFiles(matched);
      setImportPendingFiles(pending);
      
      // Se tutti i file sono già presenti, carica direttamente
      if (pending.length === 0) {
        const allFiles = Object.values(matched);
        setAudioFiles(allFiles);
        
        if (data.currentFileId && matched[data.currentFileId]) {
          loadFile(matched[data.currentFileId]);
        } else if (allFiles.length > 0) {
          loadFile(allFiles[0]);
        }
        
        alert(`✅ Playlist caricata!\n\nTutti i ${allFiles.length} file erano già presenti.`);
      } else {
        // Mostra modal per file mancanti
        setShowImportModal(true);
      }
      
    } catch (e) {
      alert('Errore nel caricamento ❌');
      console.error(e);
    }
  };
  
  reader.readAsText(file);
  event.target.value = '';
};

const handleReloadFileForImport = async (pendingFile: any, event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;
  
  // Verifica nome
  if (file.name !== pendingFile.name) {
    const confirm = window.confirm(
      `Il file selezionato (${file.name}) non corrisponde al nome atteso (${pendingFile.name}).\n\nVuoi caricarlo comunque?`
    );
    if (!confirm) {
      event.target.value = '';
      return;
    }
setIsLoadingFile(true); // <-- AGGIUNGI
  }
  
  try {
    const id = pendingFile.id;
    const url = URL.createObjectURL(file);
    
    // Genera waveform
    setIsLoadingWaveform(true);
    let waveformData: number[] = [];
    
    const arrayBuffer = await file.arrayBuffer();
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);
    const samples = 64;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData: number[] = [];
    
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j]);
      }
      filteredData.push(sum / blockSize);
    }
    
    const max = Math.max(...filteredData);
    waveformData = filteredData.map(n => n / max);
    
    const tempAudio = new Audio(url);
    await new Promise((resolve) => {
      tempAudio.addEventListener('loadedmetadata', resolve, { once: true });
    });
    
    const completeImport = () => {
  const allFiles = Object.values(importMatchedFiles);
  setAudioFiles(allFiles);
  
  if (allFiles.length > 0) {
    loadFile(allFiles[0]);
  }
  
  setShowImportModal(false);
  setImportPendingFiles([]);
  setImportMatchedFiles({});
  
  const matchedCount = allFiles.length;
  const totalCount = matchedCount + importPendingFiles.filter(
    f => !importMatchedFiles[f.id]
  ).length;
  
  alert(`✅ Playlist caricata!\n\n${matchedCount}/${totalCount} file trovati.`);
};
    
    const newFile: AudioFileData = {
      id,
      url,
      name: file.name,
      duration: tempAudio.duration,
      loopStart: pendingFile.loopStart,
      loopEnd: pendingFile.loopEnd,
      waveform: waveformData,
      bpm: pendingFile.bpm,
      timestamp: Date.now()
    };
    
    // Salva in IndexedDB
    await saveFileToIndexedDB({
      id,
      name: file.name,
      blob: file,
      duration: tempAudio.duration,
      loopStart: pendingFile.loopStart,
      loopEnd: pendingFile.loopEnd,
      waveform: waveformData,
      timestamp: Date.now()
    });
    
    setImportMatchedFiles(prev => ({ ...prev, [id]: newFile }));
console.log('✅ File ricaricato e aggiunto ai matched:', file.name);
setIsLoadingWaveform(false);
await updateStorageInfo();
    
  } catch (error) {
    console.error('Error reloading file:', error);
    alert('Errore nel caricamento del file');
    setIsLoadingWaveform(false);
setIsLoadingFile(false); // <-- AGGIUNGI QUESTO
  }
  
  event.target.value = '';
};

// ✅ QUI FUORI, COME FUNZIONE SEPARATA
const completeImport = () => {
  const allFiles = Object.values(importMatchedFiles);
  setAudioFiles(allFiles);
  
  if (allFiles.length > 0) {
    loadFile(allFiles[0]);
  }
  
  setShowImportModal(false);
  setImportPendingFiles([]);
  setImportMatchedFiles({});
  
  const matchedCount = allFiles.length;
  const totalCount = matchedCount + importPendingFiles.filter(
    f => !importMatchedFiles[f.id]
  ).length;
  
  alert(`✅ Playlist caricata!\n\n${matchedCount}/${totalCount} file trovati.`);
};

useEffect(() => {
  if (currentFileId && audioFile) {
    setAudioFiles(prev => prev.map(f => 
      f.id === currentFileId 
        ? { ...f, loopStart, loopEnd, waveform: waveformData, bpm: detectedBPM }
        : f
    ));
  }
}, [loopStart, loopEnd, currentFileId, detectedBPM]);

  useEffect(() => {
  const audio = audioRef.current;
  if (!audio) return;

  const handleLoadedMetadata = () => {
    // 🎯 NON aggiornare nulla durante pitch shift
    if (isProcessing) return;
    
    setAudioDuration(audio.duration);
    setLoopEnd(prev => (prev === 0 || prev === undefined) ? audio.duration : prev);
  };

  audio.addEventListener('loadedmetadata', handleLoadedMetadata);
  return () => audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
}, [audioFile]);
  
  // Carica file da IndexedDB all'avvio


// Aggiorna storage info periodicamente
const updateStorageInfo = async () => {
  try {
    const { usage, quota } = await getStorageEstimate();
    setStorageUsage(usage);
    setStorageQuota(quota);
  } catch (error) {
    console.error('Error getting storage info:', error);
  }
};

useEffect(() => {
  const audio = audioRef.current;
  if (!audio) return;

  // Se siamo in preview o in running, aggiorna il volume "al volo"
  // Senza questo, React cercherebbe di ricaricare l'intera logica di play
  const targetVolume = isAudioMuted ? 0 : audioVolume;
  
  if (audio.volume !== targetVolume) {
    audio.volume = targetVolume;
  }
}, [audioVolume, isAudioMuted]); 
// Nota: Non mettiamo isPreviewPlaying tra le dipendenze per evitare restart

useEffect(() => {
  const audio = audioRef.current;
  if (!audio || !audioFile) return;

  if (isRunning && !isPaused && !isInBreak) {
    audio.playbackRate = getCurrentPlaybackRate();
audio.preservesPitch = true;
    audio.play().catch(console.error);
    // ... logica metronomo allenamento ...
  } else {
  // Ferma audio E metronomo quando non in running
  if (!isPreviewPlaying) {
    audio.pause();
    stopMetronome(); // Questo ora setta isMetronomeActiveRef.current = false
  }
}
  // IMPORTANTE: aggiungi isPreviewPlaying alle dipendenze qui sotto
}, [isRunning, isPaused, isInBreak, currentPhase, audioFile, detectedBPM, isPreviewPlaying]);

// Gestore volumi audio "chirurgico"
useEffect(() => {
  if (audioRef.current) {
    // Applichiamo il volume direttamente all'hardware (DOM)
    // Questo non causa ri-render o blocchi della preview
    audioRef.current.volume = isAudioMuted ? 0 : audioVolume;
  }
}, [audioVolume, isAudioMuted]);

// Salva modifiche loop in IndexedDB
// SOSTITUISCI l'useEffect (righe ~756-785) con questo:
useEffect(() => {
  if (!currentFileId || !audioFile) return;

// 🎯 NON salvare durante pitch shift processing
  if (isProcessing) return;
  
  const saveChanges = async () => {
    try {
      const currentFile = audioFiles.find(f => f.id === currentFileId);
      if (!currentFile) {
        console.log('⚠️ File corrente non trovato in audioFiles');
        return;
      }
      
      console.log('🔍 Cerco file in IndexedDB con ID:', currentFileId); // ← AGGIUNGI
      
      // ✅ Recupera il blob originale da IndexedDB invece di fare fetch
      const existingFile = await getFileFromIndexedDB(currentFileId);
      if (!existingFile) {
        console.log('⚠️ File non trovato in IndexedDB per salvare modifiche');
        return;
      }
      
      console.log('💾 Salvo modifiche per:', currentFile.name, 'con ID:', currentFileId); // ← MODIFICA
      
      await saveFileToIndexedDB({
        id: currentFileId,
        name: audioFileName,
        blob: existingFile.blob,
        duration: audioDuration,
        loopStart,
        loopEnd,
        waveform: waveformData,
        timestamp: Date.now()
      });
      
      console.log('✅ Modifiche salvate in IndexedDB');
    } catch (error) {
      console.error('❌ Save error:', error);
    }
  };
  
  const timeoutId = setTimeout(saveChanges, 3000);
  
  return () => clearTimeout(timeoutId);
}, [loopStart, loopEnd, currentFileId, audioFileName, audioDuration, waveformData, audioFiles]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioFile) return;

    const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(audio.currentTime);
    requestAnimationFrame(() => setCurrentTime(audio.currentTime));

const effectiveEnd = loopEnd;
    const effectiveStart = loopStart;

    // 1. GESTIONE PREVIEW (Reset del pulsante alla fine)
    if (isPreviewPlaying) {
      if (audio.currentTime >= effectiveEnd - 0.1) {
        audio.pause(); 
        audio.currentTime = effectiveStart; 
        setIsPreviewPlaying(false); 
      }
      return;
    }
    
    // 🎯 NUOVO BLOCCO: GESTIONE FOCUS 🎯
    if (isRunning && isFocused && !isPaused) {
        // In modalità FOCUS, forziamo sempre l'uso di loopStart e loopEnd
        const focusEnd = loopEnd;
        const focusStart = loopStart;

        if (audio.currentTime >= focusEnd - 0.1) {
            // Loop back to the start of the focus segment
            audio.currentTime = focusStart;
            audio.play(); // Assicurati che continui a suonare
        }
        return; // Finito, esci da handleTimeUpdate: il FOCUS bypassa la logica di ALLENAMENTO
    }

    // 2. GESTIONE ALLENAMENTO (Logica che ora funziona solo se NON in Focus)
    if (isRunning && !isPaused && !isInBreak && !isFocused) {
      if (audio.currentTime >= effectiveEnd - 0.1) {
        // --- Logica di fine ripetizione ---

        const nextRepetition = currentRepetition + 1;
        const totalRepetitions = phaseRepetitions[currentPhase];

        // Caso A: Fase NON completata (ripetizione interna)
        if (nextRepetition < totalRepetitions) {
          
          // 1. Forza il riavvio del loop e la riproduzione (azione sincrona)
          audio.currentTime = effectiveStart; 
          audio.play(); 
          
          // 2. Aggiorna lo stato della ripetizione (azione asincrona)
          setCurrentRepetition(nextRepetition);
          
        } 
        // Caso B: Fase COMPLETATA (passaggio al break o fine ciclo)
        else {
          const currentIndex = phaseOrder.indexOf(currentPhase);
          
          if (currentIndex < phaseOrder.length - 1) {
            // Passaggio alla pausa (Break)
            setIsInBreak(true);
            const nextPhase = phaseOrder[currentIndex + 1];

            audio.pause();
            setCurrentRepetition(nextRepetition); 
            
            setTimeout(() => startBreak(nextPhase), 50);
          } else {
            // Fine ciclo completo
            setIsRunning(false);
            setCurrentPhase('A');
            setCurrentRepetition(0);
            audio.pause();
            audio.currentTime = effectiveStart;
          }
        }
      }
    } 
    // 3. GESTIONE FINE TRACK QUANDO NON IN RUNNING
    else if (!isRunning && audio.currentTime >= effectiveEnd - 0.1) {
      audio.currentTime = effectiveStart;
    }
};

   audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [audioFile, loopStart, loopEnd, audioDuration, isRunning, isPaused, isInBreak, isFocused, currentRepetition, phaseRepetitions, currentPhase]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioFile) return;

   if (isRunning && !isPaused && !isInBreak) {
// 🛑 Assicura che la preview sia VERAMENTE ferma
    if (isPreviewPlaying) {
      setIsPreviewPlaying(false);
      stopMetronome();
      workerRef.current?.postMessage("stop");
    }
    
    audio.playbackRate = getCurrentPlaybackRate();
  audio.playbackRate = getCurrentPlaybackRate();
audio.preservesPitch = true;
  audio.volume = isAudioMuted ? 0 : audioVolume;
audio.volume = audioVolume; // Forza il volume attuale all'avvio
  audio.play().then(() => {
    if (detectedBPM) {
      const ctx = audioContextRef.current;
      startMetronome(
        detectedBPM, 
        getCurrentPlaybackRate(), 
        ctx?.currentTime || 0, 
        audio.currentTime,
        false  // stoppa normalmente
      );
    }
  }).catch(err => console.error('Audio play error:', err));
} else {
  // NON fermare durante preview
  if (!isPreviewPlaying) {
    audio.pause();
    stopMetronome();
    workerRef.current?.postMessage("stop"); // <-- AGGIUNGI QUESTA RIGA
  }
}
    
    // AGGIUNGI audioVolume qui sotto nelle dipendenze
  }, [isRunning, isPaused, isInBreak, currentPhase, phasePercentages, audioFile, detectedBPM]);
    
  
  // Carica file da IndexedDB all'avvio
useEffect(() => {
  const loadFilesFromDB = async () => {
    console.log('🔄 Caricamento file da IndexedDB all\'avvio...');
    try {
      const files = await getAllFilesFromIndexedDB();
      console.log('📦 File caricati da IndexedDB:', files.length);
      
     const loadedFiles: AudioFileData[] = files.map(f => ({
        id: f.id,
        url: URL.createObjectURL(f.blob),
        name: f.name,
        duration: f.duration,
        loopStart: f.loopStart,
        loopEnd: f.loopEnd,
        waveform: f.waveform,
        bpm: null,
        timestamp: f.timestamp
      }));
      
      setAudioFiles(loadedFiles);
      
      if (loadedFiles.length > 0) {
        loadFile(loadedFiles[0]);
      }
      
      await updateStorageInfo();
    } catch (error) {
      console.error('❌ Errore caricamento file:', error);
    }
  };
  
  loadFilesFromDB();
}, []);

// Reset preview quando cambia file
useEffect(() => {
  if (isPreviewPlaying) {
    audioRef.current?.pause();
    stopMetronome();
    workerRef.current?.postMessage("stop"); // <-- AGGIUNGI QUESTA RIGA
    setIsPreviewPlaying(false);
  }
}, [currentFileId]);
const [previewTime, setPreviewTime] = useState(0);

 // ✅ Esegui solo all'avvio

  const startBreak = (phaseToStartAfterBreak: PhaseKey) => {
    countdownTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    countdownTimeoutsRef.current = [];
// Ferma preview se attiva
    if (isPreviewPlaying) {
      stopMetronome();
      workerRef.current?.postMessage("stop");
      audioRef.current?.pause();
      setIsPreviewPlaying(false);
// FERMA L'AUDIO durante il countdown
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = loopStart;
    }
    }
    setIsFocused(false);
    breakStartedRef.current = true;
    nextPhaseOnBreakEndRef.current = phaseToStartAfterBreak;
    setIsInBreak(true);
    setIsPaused(false);
    setCountdownBeat(0);
    setCurrentRepetition(0);

    // 1... 2...
    const t1 = setTimeout(() => {
      playCountSound(1);
      setCountdownBeat(1);
    }, 0);
    
    const t2 = setTimeout(() => {
      playCountSound(2);
      setCountdownBeat(2);
    }, 1000);
    
    // 1, 2, 3, 4
    const t3 = setTimeout(() => {
      playCountSound(1);
      setCountdownBeat(3);
    }, 2000);
    
    const t4 = setTimeout(() => {
      playCountSound(2);
      setCountdownBeat(4);
    }, 2500);
    
    const t5 = setTimeout(() => {
      playCountSound(3);
      setCountdownBeat(5);
    }, 3000);
    
    const t6 = setTimeout(() => {
      playCountSound(4);
      setCountdownBeat(6);
    }, 3500);

    const finalTimeout = setTimeout(() => {
      setIsInBreak(false);
      setCountdownBeat(0);
      setCurrentPhase(phaseToStartAfterBreak);
      setCurrentRepetition(0);
      breakStartedRef.current = false;
    }, 4000);
    
    countdownTimeoutsRef.current = [t1, t2, t3, t4, t5, t6, finalTimeout];
  };
 const handlePreview = async () => {
  if (!audioRef.current || !audioFile) return;

  if (isPreviewPlaying) {
    stopMetronome(); // <-- METTI PRIMA, così setta subito il flag a false
    audioRef.current.pause();
    setIsPreviewPlaying(false);


  } else {
    audioRef.current.currentTime = loopStart;
audioRef.current.playbackRate = phasePercentages.D / 100; // <-- AGGIUNGI QUESTA
  audioRef.current.preservesPitch = true; // <-- AGGIUNGI QUESTA
    try {
      await audioRef.current.play();
      setIsPreviewPlaying(true);
      if (detectedBPM && audioContextRef.current) {
        startMetronome(
          detectedBPM, 
          1.0, 
          audioContextRef.current.currentTime, 
          audioRef.current.currentTime
        );
      }
    } catch (err) {
      console.error("Errore preview:", err);
    }
  }
};

  useEffect(() => {
  const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e);
    setShowInstallButton(true);
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

  return () => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  };
}, []);

  const handleStartStop = () => {
    if (!audioFile) return;
    
    // 🛑 STOP TOTALE della preview
    if (isPreviewPlaying) {
      stopMetronome();
      workerRef.current?.postMessage("stop");
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = loopStart;
        audioRef.current.playbackRate = 1.0; // Reset rate
      }
      setIsPreviewPlaying(false);
    }
    
    if (isInBreak && countdownTimeoutsRef.current.length > 0) return;

    if (isRunning) {
      setIsPaused(!isPaused);
      setIsFocused(false);
      if (!isPaused && isInBreak) breakStartedRef.current = false;
    } else {
      setIsPaused(false);
      setIsFocused(false);
      setIsInBreak(true);
      setIsRunning(true);
      setCurrentRepetition(0);
      
      if (audioRef.current) {
        audioRef.current.currentTime = loopStart;
      }
      
      setTimeout(() => startBreak('A'), 50);
    }
  };

  const handleReset = () => {
    countdownTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    countdownTimeoutsRef.current = [];
    if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    if (globalIntervalRef.current) clearInterval(globalIntervalRef.current);
    stopMetronome();
    workerRef.current?.postMessage("stop"); // <-- AGGIUNGI QUESTA RIGA
    
    setIsRunning(false);
// Reset playbackRate per preview
    if (audioRef.current) {
      audioRef.current.playbackRate = 1.0;
    }
    setIsPaused(false);
    setIsFocused(false);
    setIsInBreak(false);
    setCountdownBeat(0);
    setCurrentPhase('A');
    setCurrentRepetition(0);
    setTotalTimeRemaining(0);
    nextPhaseOnBreakEndRef.current = 'A';
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = loopStart;
    }
  };

  const goToNextPhase = () => {
    if (!isRunning || isInBreak) return;
    
    countdownTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    countdownTimeoutsRef.current = [];
    if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    if (globalIntervalRef.current) clearInterval(globalIntervalRef.current);
    
    setIsFocused(false);
    
    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex < phaseOrder.length - 1) {
      const nextPhase = phaseOrder[currentIndex + 1];
      nextPhaseOnBreakEndRef.current = nextPhase;
      setIsInBreak(true);
      setCurrentPhase(nextPhase);
      setCurrentRepetition(0);
      
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = loopStart;
      }
      
      setTimeout(() => startBreak(nextPhase), 50);
    }
  };
  
  const handleRestartPhase = () => {
    if (!isRunning || isInBreak || isFocused) return;

    if (intervalIdRef.current) { clearInterval(intervalIdRef.current); intervalIdRef.current = null; }
    if (globalIntervalRef.current) { clearInterval(globalIntervalRef.current); globalIntervalRef.current = null; }
    
    setCurrentRepetition(0);
    setIsInBreak(true);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = loopStart;
    }
    
    setTimeout(() => {
      startBreak(currentPhase);
    }, 50);
  };

  const handleFocusToggle = () => {
    if (!isRunning || isPaused || isInBreak) return;
    setIsFocused(prev => !prev);
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isRunning && !isPaused) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * audioDuration;
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleLoopMarkerDrag = (type: 'start' | 'end', e: React.MouseEvent | React.TouchEvent) => {
  if (isRunning && !isPaused) return;
  
  const container = waveformContainerRef.current;
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  
  const getPosition = (event: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime = percentage * audioDuration;
    
    if (type === 'start') {
      setLoopStart(Math.min(newTime, loopEnd - 1));
    } else {
      setLoopEnd(Math.max(newTime, loopStart + 1));
    }
  };
  
  const onMove = (moveEvent: MouseEvent | TouchEvent) => {
    moveEvent.preventDefault();
    getPosition(moveEvent);
  };
  
  const onEnd = () => {
    document.removeEventListener('mousemove', onMove as any);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove as any);
    document.removeEventListener('touchend', onEnd);
  };
  
  document.addEventListener('mousemove', onMove as any);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove as any, { passive: false });
  document.addEventListener('touchend', onEnd);
};

  const clearAudioFile = () => {
  handleReset();
  stopMetronome();
  setAudioFiles([]);
  setCurrentFileId(null);
  setAudioFile(null);
  setAudioFileName('');
  setAudioDuration(0);
  setLoopStart(0);
  setLoopEnd(0);
  setCurrentTime(0);
  setWaveformData([]);
  setDetectedBPM(null);
  setCurrentRepetition(0);
};

const clearAllStorage = async () => {
  const confirm = window.confirm(
    '⚠️ ATTENZIONE!\n\nQuesto cancellerà TUTTI i file audio salvati nel browser.\n\nVuoi continuare?'
  );
  
  if (!confirm) return;
  
  try {
    await clearAllIndexedDB();
    clearAudioFile();
    await updateStorageInfo();
    alert('✅ Storage pulito con successo!');
  } catch (error) {
    console.error('Error clearing storage:', error);
    alert('❌ Errore nella pulizia dello storage');
  }
};

const adjustBPM = (delta: number) => {
    // BPM non è usato in questa app audio, ma manteniamo la logica per durate
  };

  const updatePhaseRepetitions = (phase: PhaseKey, reps: number) => {
    setPhaseRepetitions(prev => {
      const updated = { ...prev, [phase]: reps };
      if (!isRunning) {
        if (phase === currentPhase) {
          setCurrentRepetition(0);
        }
      }
      return updated;
    });
  };

  const updatePhasePercentage = (phase: PhaseKey, value: number) => {
    if (phase === 'D') return;
    setPhasePercentages(prev => ({ ...prev, [phase]: value, D: 100 }));
  };

  const handleResetDefaults = () => {
    if (isRunning && !isPaused) return;
    setPhaseRepetitions({ A: 3, B: 3, C: 3, D: 3 });
    setPhasePercentages({ ...defaultPhasePercentages });
    setCurrentPhase('A');
    setCurrentRepetition(0);
    setTotalTimeRemaining(0);
    nextPhaseOnBreakEndRef.current = 'A';
    setIsInBreak(false);
    setCountdownBeat(0);
  };
  // Calcolo progresso basato sulle ripetizioni
const totalReps = phaseOrder.reduce((acc, key) => acc + phaseRepetitions[key], 0);

const currentIndex = phaseOrder.indexOf(currentPhase);
let elapsedReps = 0;
for (let i = 0; i < currentIndex; i++) {
  elapsedReps += phaseRepetitions[phaseOrder[i]];
}
elapsedReps += currentRepetition;

const currentProgressWidth = isRunning && totalReps > 0 ? (elapsedReps / totalReps) * 100 : 0;

  const gradientStops = useMemo(() => {
    // Con ripetizioni non serve calcolare durata totale
    // Usiamo semplicemente proporzioni uguali
    let cumulativePercentage = 0;
    const phasePercentageEach = 100 / phaseOrder.length;
    
    return phaseOrder.map(key => {
      const phaseColor = phaseStyles[key].globalBarColor;
      const start = cumulativePercentage;
      cumulativePercentage += phasePercentageEach;
      return `${phaseColor} ${start}%, ${phaseColor} ${cumulativePercentage}%`;
    }).join(', ');
  }, []);
  const handleInstallClick = async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === 'accepted') {
    setShowInstallButton(false);
  }

  setDeferredPrompt(null);
};

  return (
    <div className="fixed inset-0 overflow-x-hidden overflow-y-auto bg-[#0b0d0e] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(156,176,196,0.12),_transparent_62%)]" />
      <div className="pointer-events-none absolute -bottom-32 left-[12%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,_rgba(96,129,118,0.18),_transparent_68%)] blur-3xl" />
      <div className="pointer-events-none absolute -top-48 right-[-10%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,_rgba(71,85,105,0.16),_transparent_70%)] blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-full min-h-full px-4 pb-16 pt-10 sm:max-w-2xl sm:px-6
                  md:max-w-4xl
                  lg:max-w-6xl lg:px-6 mx-auto">
        <audio ref={audioRef} src={audioFile || undefined} />

        <motion.header
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-5 text-center"
        >
          <div className="flex items-center justify-center gap-4">
  <h1 className="text-3xl sm:text-4xl md:text-5xl font-light leading-tight text-neutral-100">
    <span className="font-semibold text-[#88a7d0]">A</span>
    <span className="font-semibold text-[#c2b68a]">B</span>
    <span className="font-semibold text-[#d9a88a]">C</span>
    <span className="font-semibold text-[#8ab7aa]">D</span>
    <span className="pl-2 font-light text-neutral-300">method:audio</span>
  </h1>
  
  {/* Mostra toggle SOLO se c'è un file caricato */}
  {audioFile && (
    <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
      <button 
        onClick={() => setIsEasyMode(true)}
        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
          isEasyMode 
            ? 'bg-emerald-500 text-white shadow-lg' 
            : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        EASY MODE
      </button>
      <button 
        onClick={() => {
          setIsEasyMode(false);
          setPhasePercentages({ A: 70, B: 85, C: 105, D: 100 });
        }}
        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
          !isEasyMode 
            ? 'bg-blue-500 text-white shadow-lg' 
            : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        FULL MODE
      </button>
    </div>
  )}
</div>
          <p className="text-sm text-neutral-500">
            Prodotto da <a href="https://batterista.online">Batterista Online</a>
          </p>
        </motion.header>

        {audioFile && (
          <motion.div 
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="relative mt-8 h-1.5 w-full overflow-hidden rounded-full bg-white/5 shadow-inner"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${currentProgressWidth}%`,
                background: `linear-gradient(to right, ${gradientStops})`,
              }}
            />
          </motion.div>
        )}

{/* EASY MODE INTERFACE */}
        {isEasyMode && audioFile && (
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            className="mt-14 space-y-6"
          >
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
              <h2 className="text-2xl font-semibold mb-6 text-center text-emerald-300">EASY MODE</h2>
              
              <div className="space-y-6">
                {/* Nome File */}
                <div className="text-center">
                  <div className="text-sm text-neutral-400 mb-1">File corrente:</div>
                  <div className="font-semibold text-lg text-white">{audioFileName}</div>
                </div>

                {/* Waveform */}
                <div 
                  ref={waveformContainerRef}
                  className="relative h-40 cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-black/60 to-black/30"
                  onClick={handleWaveformClick}
                >
                  {waveformData.length > 0 && (
                    <div className="relative flex h-full items-center justify-center gap-0 px-1">
                      {waveformData.map((amplitude, index) => {
                        const isInLoop = 
                          (index / waveformData.length) * audioDuration >= loopStart &&
                          (index / waveformData.length) * audioDuration <= loopEnd;
                        const isPassed = (index / waveformData.length) * audioDuration <= currentTime;
                        
                        return (
                          <div key={index} className="relative flex h-full items-center justify-center" style={{ flex: 1 }}>
                            <div
                              className="rounded-full transition-all duration-150"
                              style={{
                                width: '2px',
                                height: `${Math.max(amplitude * 95, 10)}%`,
                                background: isInLoop && isPassed
                                  ? 'linear-gradient(to top, #5dda9d, rgba(93, 218, 157, 0.4))'
                                  : isInLoop
                                    ? 'linear-gradient(to top, rgba(93, 218, 157, 0.5), rgba(93, 218, 157, 0.3))'
                                    : 'linear-gradient(to top, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
                              }}
                            />
                          </div>
                        );
                      })}
                      
                      {/* Current time indicator */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-white/80 shadow-[0_0_20px_rgba(255,255,255,0.6)] rounded-full"
                        style={{ left: `${(currentTime / audioDuration) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

               {/* Loop Range con Slider - Copiato da Full Mode */}
<div className="space-y-4">
  <div className="text-xs uppercase tracking-[0.3em] text-neutral-400 mb-3">
    Loop Range
  </div>
  
  {/* Visualizzazione grafica del range */}
  <div className="relative h-2 rounded-xl bg-white/5 mb-2">
    <div
      className="absolute h-full rounded-xl bg-gradient-to-r from-emerald-500/40 to-red-500/40"
      style={{
        left: `${(loopStart / audioDuration) * 100}%`,
        width: `${((loopEnd - loopStart) / audioDuration) * 100}%`
      }}
    />
    
    {/* Marker START */}
    <div
      className="absolute top-1/2 h-6 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-emerald-400 bg-emerald-500 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center"
      style={{ left: `${(loopStart / audioDuration) * 100}%` }}
      onMouseDown={(e) => handleLoopMarkerDrag('start', e)}
      onTouchStart={(e) => handleLoopMarkerDrag('start', e)}
    >
      <Scissors size={14} className="text-white" />
    </div>
    
    {/* Marker END */}
    <div
      className="absolute top-1/2 h-6 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-red-400 bg-red-500 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center"
      style={{ left: `${(loopEnd / audioDuration) * 100}%` }}
      onMouseDown={(e) => handleLoopMarkerDrag('end', e)}
      onTouchStart={(e) => handleLoopMarkerDrag('end', e)}
    >
      <Scissors size={14} className="text-white" />
    </div>
  </div>
  
  <div className="flex justify-between text-xs text-neutral-400">
    <div className="flex flex-col">
      <span className="font-semibold text-emerald-400">START</span>
      <span className="tabular-nums">{formatTime(loopStart)}</span>
    </div>
    <div className="flex flex-col text-right">
      <span className="font-semibold text-red-400">END</span>
      <span className="tabular-nums">{formatTime(loopEnd)}</span>
    </div>
  </div>
</div>

                {/* Playback Speed Easy Mode */}
<div className="space-y-3">
  <div className="flex items-center justify-between mb-2">
    <label className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold">Velocità di Studio</label>
    <span className="text-xl font-black text-[#5dda9d] tabular-nums">
      {Math.round(phasePercentages.D)}%
    </span>
  </div>
  
  <input 
  type="range" 
  min="50" 
  max="150" 
  value={phasePercentages.D} 
  onChange={(e) => {
    let val = parseInt(e.target.value);
    
    // 🧲 Effetto magnetico: se sei vicino al 100%, snap a 100
    if (val >= 99.5 && val <= 100.5) {
      val = 100;
    }
    
    setPhasePercentages({A: val, B: val, C: val, D: val});
    
    // Applica immediatamente il playbackRate se audio è in preview
    if (audioRef.current && isPreviewPlaying) {
      audioRef.current.playbackRate = val / 100;
    }
  }} 
  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#5dda9d]" 
/>
    
  
  <div className="flex justify-between text-[9px] uppercase tracking-widest text-neutral-600 font-bold">
    <span>Slow</span>
    <span>Normal</span>
    <span>Fast</span>
  </div>
</div>
                {/* Pitch Control */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs uppercase tracking-wider text-neutral-400">Tonalità (Pitch)</label>
                    <span className="text-lg font-bold text-purple-300">{pendingPitch > 0 ? '+' : ''}{pendingPitch} semitoni</span>
                  </div>
                  <input 
                    type="range" 
                    min="-12" 
                    max="12" 
                    value={pendingPitch} 
                    onChange={(e) => setPendingPitch(parseInt(e.target.value))} 
                    className="w-full accent-purple-500 h-2"
                  />
                  {pendingPitch !== pitchShift && (
                    <button 
                      onClick={async () => { 
                        setPitchShift(pendingPitch); 
                        await applyPitchShift(pendingPitch); 
                      }} 
                      className="mt-3 w-full py-2.5 rounded-lg bg-purple-500 text-white font-bold text-sm hover:bg-purple-600 transition"
                    >
                      🎵 Applica Modifica Tonalità
                    </button>
                  )}
                </div>

                {/* Volume Controls */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-neutral-400 mb-2 block">Volume Traccia</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={audioVolume} 
                      onChange={(e) => setAudioVolume(parseFloat(e.target.value))} 
                      className="w-full accent-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-neutral-400 mb-2 block">Volume Click (⚠️ funzione sperimentale)</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={clickVolume} 
                      onChange={(e) => setClickVolume(parseFloat(e.target.value))} 
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>

                {/* Play Button */}
                <button 
                  onClick={handlePreview} 
                  className={`w-full py-4 rounded-xl text-xl font-bold transition shadow-lg ${
                    isPreviewPlaying 
                      ? 'bg-red-700 hover:bg-red-600 text-white' 
                      : 'bg-emerald-800 hover:bg-emerald-600 text-white'
                  }`}
                >
                  {isPreviewPlaying ? '⏸ Stop' : '> Play'}
                </button>

                {/* Change File Button */}
                <label className="block w-full cursor-pointer">
                  <div className="w-full py-3 rounded-xl border-2 border-white/20 bg-white/5 text-center font-semibold text-neutral-300 hover:bg-white/10 transition">
                    📁 Load File
                  </div>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </motion.div>
        )}

        {!audioFile && !isEasyMode ? (
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            className="mt-14 rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-16 text-center shadow-[0_32px_70px_rgba(8,10,12,0.35)] backdrop-blur-xl"
          >
            <label className="mx-auto mb-8 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-[#3e5c55]/20 to-[#2e4741]/20 transition hover:border-white/20 hover:shadow-xl">
  <Upload size={64} className="text-[#5dda9d]" />
  <input
    type="file"
    accept="audio/*"
    onChange={handleFileUpload}
    className="hidden"
  />
</label>
            <h2 className="mb-4 text-3xl font-semibold">Carica un file audio</h2>
            <p className="mx-auto mb-8 max-w-md text-neutral-400">
              Supporta MP3, WAV, OGG e altri formati audio.<br/>
              Scegli un brano o un esercizio da studiare.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
  <label className={`inline-flex cursor-pointer items-center gap-3 rounded-full bg-gradient-to-r from-[#3e5c55] to-[#2e4741] px-8 py-4 text-lg font-semibold shadow-lg transition hover:shadow-xl ${isLoadingFile ? 'opacity-50 cursor-wait' : ''}`}>
  {isLoadingFile ? (
    <>
      <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
      Caricamento...
    </>
  ) : (
    <>
      <Upload size={20} />
      Carica File Audio
    </>
  )}
  <input
    type="file"
    accept="audio/*"
    onChange={handleFileUpload}
    className="hidden"
    disabled={isLoadingFile}
  />
</label>
  
  <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border-2 border-purple-500/40 bg-purple-500/10 px-8 py-4 text-lg font-semibold text-purple-300 shadow-lg transition hover:border-purple-400 hover:bg-purple-500/20">
    <Download size={20} />
    Carica Sessione
    <input
      type="file"
      accept=".json"
      onChange={importSession}
      className="hidden"
    />
  </label>
</div>
          </motion.div>
          
        ) : !isEasyMode ? (
          <div className="mt-14 space-y-8">
         <motion.div 
  variants={fadeUp}
  initial="hidden"
  animate="visible"
  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
>
  {phaseOrder.map(key => (
    <button
      key={key}
      onClick={() => {
        if (!audioFile || isInBreak) return;
        
        if (isRunning) {
          // Se sta già suonando, passa a quella fase
          setCurrentPhase(key);
          setCurrentRepetition(0);
          setIsInBreak(true);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = loopStart;
          }
          setTimeout(() => startBreak(key), 50);
        } else {
          // Se non sta suonando, avvia da quella fase
          setCurrentPhase(key);
          setCurrentRepetition(0);
          setIsInBreak(true);
          setIsRunning(true);
          setIsPaused(false);
          if (audioRef.current) {
            audioRef.current.currentTime = loopStart;
          }
          setTimeout(() => startBreak(key), 50);
        }
      }}
      disabled={!audioFile || isInBreak}
      className={`flex items-center justify-center gap-1 rounded-full border px-4 py-2 text-sm transition cursor-pointer hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 ${
        currentPhase === key
          ? `bg-gradient-to-r ${phaseStyles[key].color} font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]`
          : 'border-white/5 bg-white/5 text-neutral-300 hover:border-white/20'
      }`}
    >
      <span className="font-bold" style={{ color: currentPhase === key ? 'white' : phaseStyles[key].accent }}>
        {key}
      </span>
      <span>{phaseStyles[key].name.substring(1)}</span>
    </button>
  ))}
</motion.div>

            <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_minmax(300px,400px)]">
              <div className="space-y-8">
                <motion.section
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="overflow-hidden rounded-2xl sm:rounded-[32px] border border-white/8 bg-white/5 p-4 sm:p-6 lg:p-8 shadow-[0_32px_70px_rgba(8,10,12,0.35)] backdrop-blur-xl"
                >
                  <AnimatePresence mode="wait">
                    {isInBreak ? (
                      <motion.div
                        key="break"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.65, ease: 'easeOut' }}
                        className="flex flex-col items-center justify-center py-16 text-center"
                      >
                        <span className="text-xs uppercase tracking-[0.36em] text-neutral-500">
                          Preparazione per la sezione {nextPhaseOnBreakEndRef.current}
                        </span>
                        <div className="mt-6 text-[5.5rem] font-bold text-[#8ab7aa] tabular-nums">
                          {countdownBeat === 0 ? '...' : 
                           countdownBeat <= 2 ? countdownBeat : 
                           countdownBeat - 2}
                        </div>
                        <p className="text-neutral-400">
                          {countdownBeat <= 2 ? 'One... Two...' : '1, 2, 3, 4!'}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="active"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.65, ease: 'easeOut' }}
                        className="space-y-8"
                      >
                        <div className="grid gap-8 md:grid-cols-2">
                          <div>
                            <div className="mb-2 text-xs uppercase tracking-[0.4em] text-neutral-500">Sezione Corrente</div>
                            <h2 className={`mb-3 text-4xl font-semibold ${phaseStyles[currentPhase].textColor}`}>
                              {currentPhase} • {phaseStyles[currentPhase].name}
                            </h2>
                            <div className="space-y-1.5 text-sm text-neutral-400">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: phaseStyles[currentPhase].accent }}></div>
                                Velocità: <span className="font-semibold text-white"><div>
  <span className="font-semibold text-white">
    {isPreviewPlaying 
        ? '100% - velocità originale' 
        : `${Math.round(getCurrentPlaybackRate() * 100)}%`}
                                </span>
                              </div>
                              
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
  <div className="h-2 w-2 rounded-full bg-neutral-500"></div>
  Ripetizioni: <span className="font-semibold text-white">
    {isPreviewPlaying ? '--/--' : `${currentRepetition + 1}/${phaseRepetitions[currentPhase]}`}
  </span>
</div>
                              <div className="flex items-center gap-2">
                                <Music size={12} className="text-neutral-500" />
                                <span className="truncate">{audioFileName}</span>
                              </div>
                              {detectedBPM ? (
    <div className="flex flex-col items-center">
      <span className="text-white text-lg">
        {isPreviewPlaying ? detectedBPM : Math.round(detectedBPM * getCurrentPlaybackRate())} BPM
      </span>
      <span className="text-s text-neutral-500">
        (Originale: {detectedBPM} BPM)
      </span>
    </div>
  ) : (
    "Calcolo BPM..."
  )}
                            </div>
                          </div>
                          
                          <div className="text-center md:text-left">
  <div className="mb-2 text-xs uppercase tracking-[0.4em] text-neutral-500">Ripetizione</div>
  <div className="text-6xl font-bold tabular-nums text-neutral-100">
    {isPreviewPlaying ? 'Preview' : `${currentRepetition + 1}/${phaseRepetitions[currentPhase]}`}
  </div>
                            {isFocused && (
                              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.35em] text-yellow-300">
                                <Target size={14} /> FOCUS ATTIVO
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
  <div className="mb-2 flex justify-between text-xs text-neutral-500">
    <span>{isPreviewPlaying ? 'Preview Loop' : 'Posizione Audio'}</span>
    <span className="tabular-nums">{formatTime(currentTime)} / {formatTime(audioDuration)}</span>
  </div>
  <div className="h-2 overflow-hidden rounded-full bg-white/5">
    <div
      className={`h-full rounded-full bg-gradient-to-r ${isPreviewPlaying ? 'from-purple-500 to-pink-500' : phaseStyles[currentPhase].color}`}
      style={{ width: `${(currentTime / audioDuration) * 100}%` }}
    />
  </div>
</div>

                        
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.section>

{/* BPM Display */}

                 <motion.div
  variants={scaleIn}
  initial="hidden"
  animate="visible"
  className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 overflow-hidden"
>
  {/* Header */}
  <div className="flex items-center justify-between p-4">
    <div className="flex items-center gap-3">
      <Activity size={16} className="text-blue-300" />
      <div>
        <span className="text-xs uppercase tracking-[0.35em] text-blue-300">Metronomo & Pitch</span>
        <div className="text-[11px] text-blue-400/60 mt-0.5">⚠️ Funzioni sperimentali</div>
      </div>
    </div>
    
    <div className="flex items-center gap-3">
      {/* Display BPM */}
      {detectedBPM && (
        <div className="px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40">
          <div className="text-lg font-bold text-blue-100 leading-none tabular-nums">
            {isRunning && !isPaused && !isInBreak 
              ? Math.round(detectedBPM * getCurrentPlaybackRate())
              : detectedBPM}
          </div>
          <div className="text-[9px] text-blue-300/70 leading-none mt-1">
            {isRunning && !isPaused && !isInBreak ? `Fase ${currentPhase}` : 'BPM'}
          </div>
        </div>
      )}
      
      {/* Collapse Button */}
      <button
        onClick={() => toggleSection('bpmDetector')}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-white/10"
        title={collapsedSections.bpmDetector ? "Espandi" : "Riduci"}
      >
        {collapsedSections.bpmDetector ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  </div>

  {/* Content */}
  <AnimatePresence initial={false}>
    {!collapsedSections.bpmDetector && (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className="border-t border-blue-500/20 p-4 space-y-4"
      >
        {/* Sezione BPM Control */}
 {/* Visual Indicator */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Indicatore visivo:</span>
              <div className="flex items-center gap-2">
                <div className="relative w-5 h-5 flex items-center justify-center">
  <div 
    ref={visualClickRef} 
    className="absolute inset-0 rounded-full pointer-events-none" 
    style={{ 
      backgroundColor: '#2a4741',
      opacity: 0,
      boxShadow: '0 0 0px #5dda9d'
    }}
  />
</div>
                <span className="text-[10px] uppercase text-neutral-500">Click</span>
              </div>
            </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-2">
            <Music size={12} />
            Controllo Tempo
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onMouseDown={handleTap}
              className="py-3 rounded-lg bg-[#5dda9d]/10 border border-[#5dda9d]/30 text-[#5dda9d] font-bold active:scale-95 transition-all text-sm hover:bg-[#5dda9d]/20"
            >
              Tap Tempo
            </button>
            <button
              onClick={resetToOriginalBPM}
              disabled={!originalBPM}
              className="py-3 rounded-lg bg-white/5 border border-white/10 text-neutral-300 font-semibold hover:bg-white/10 active:scale-95 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset BPM
            </button>
          </div>
          {originalBPM && detectedBPM !== originalBPM && (
            <div className="mt-2 text-center text-[10px] text-neutral-500">
              BPM Originale: {originalBPM}
            </div>
          )}
        </div>

{/* Sezione Aggiusta BPM */}
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-2">
            <Activity size={12} />
            Aggiusta BPM Manualmente
          </div>
          
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex gap-2">
              <button 
                onClick={() => setDetectedBPM(prev => prev ? Math.max(30, prev - 1) : null)} 
                disabled={!detectedBPM}
                className="flex-1 py-2 hover:bg-white/10 rounded-lg text-white transition border border-white/10 text-sm font-semibold disabled:opacity-40"
              >
                -1 BPM
              </button>
              <button 
                onClick={() => setDetectedBPM(prev => prev ? Math.min(300, prev + 1) : null)} 
                disabled={!detectedBPM}
                className="flex-1 py-2 hover:bg-white/10 rounded-lg text-white transition border border-white/10 text-sm font-semibold disabled:opacity-40"
              >
                +1 BPM
              </button>
            </div>
          </div>
        </div>

        {/* Sezione Sync Control */}
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-2">
            <Target size={12} />
            Sincronizzazione Click
          </div>
          
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-3">
           


            {/* Offset Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Offset manuale:</span>
                <span className="text-base font-mono text-[#5dda9d] tabular-nums font-bold">
                  {manualSyncOffset > 0 ? '+' : ''}{manualSyncOffset}ms
                </span>
              </div>
              
              <div className="flex gap-2">
  <button 
    onClick={() => setManualSyncOffset(prev => prev - 5)} 
    className="flex-1 py-2 hover:bg-white/10 rounded-lg text-white transition border border-white/10 text-sm font-semibold"
  >
    -5ms
  </button>
  <button 
    onClick={() => setManualSyncOffset(0)} 
    className="flex-1 py-2 hover:bg-white/10 rounded-lg text-neutral-400 transition border border-white/10 text-xs uppercase"
  >
    Reset
  </button>
  <button 
    onClick={() => setManualSyncOffset(prev => prev + 5)} 
    className="flex-1 py-2 hover:bg-white/10 rounded-lg text-white transition border border-white/10 text-sm font-semibold"
  >
    +5ms
  </button>
</div>
            </div>
          </div>

{/* Pitch Shifter con tasto Applica */}
<div>
          <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-2">
             
           
          </div>
</div>
<div>
<div className="text-xs uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-2">
            <Music size={12} />
            Pitch Shifter
          </div>
</div>
<div className="mb-4 space-y-3 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
  
<div className="text-xs uppercase tracking-[0.3em] text-purple-300 mb-3 flex items-center justify-between">
    

    {/* Visualizziamo pendingPitch così vedi il numero cambiare subito */}
    <span className="font-mono text-sm">
      {pendingPitch > 0 ? '+' : ''}{pendingPitch} semitoni
    </span>
  </div>
  
  <div className="flex gap-2">
    <button
      onClick={() => setPendingPitch(Math.max(-12, pendingPitch - 1))}
      disabled={pendingPitch <= -12}
      className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 font-semibold hover:bg-white/10 transition disabled:opacity-40"
    >
      -1
    </button>
    
    <button
      onClick={() => {
        setPendingPitch(0);
        // Se è già applicato lo 0, non facciamo nulla, altrimenti resettiamo
        if (pitchShift !== 0) {
          setPitchShift(0);
          applyPitchShift(0);
        }
      }}
      disabled={pendingPitch === 0 && pitchShift === 0}
      className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 font-semibold hover:bg-purple-500/30 transition disabled:opacity-40"
    >
      Reset
    </button>
    
    <button
      onClick={() => setPendingPitch(Math.min(12, pendingPitch + 1))}
      disabled={pendingPitch >= 12}
      className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 font-semibold hover:bg-white/10 transition disabled:opacity-40"
    >
      +1
    </button>
  </div>
  
  <input
    type="range"
    min="-12"
    max="12"
    step="1"
    value={pendingPitch}
    onChange={(e) => setPendingPitch(parseInt(e.target.value))}
    className="w-full accent-purple-500 h-1.5 cursor-pointer"
  />

  {/* PULSANTE APPLICA: compare solo se il valore scelto è diverso da quello attivo */}
  <AnimatePresence>
    {pendingPitch !== pitchShift && (
      <motion.button
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        onClick={async () => {
          setPitchShift(pendingPitch); // Allinea lo stato applicato
          await applyPitchShift(pendingPitch); // Avvia l'elaborazione
        }}
        className="w-full py-2.5 mt-2 rounded-lg bg-purple-500 text-white font-bold text-xs tracking-widest hover:bg-purple-400 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
      >
        <RefreshCcw size={14} className={isProcessing ? "animate-spin" : ""} />
        APPLICA MODIFICA
      </motion.button>
    )}
  </AnimatePresence>
  
  <div className="text-[10px] text-purple-300/60 text-center italic">
    {pendingPitch !== pitchShift 
      ? "Clicca 'Applica' per elaborare l'audio" 
      : ""}
  </div>
</div>
        </div>

        {/* Info durante allenamento */}
        {isRunning && !isPaused && !isInBreak && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-center">
            <div className="text-xs text-emerald-300">
              🎯 Fase <strong>{currentPhase}</strong> in riproduzione
            </div>
            <div className="text-[10px] text-emerald-400/60 mt-1">
              {detectedBPM} BPM × {Math.round(getCurrentPlaybackRate() * 100)}% = {Math.round(detectedBPM * getCurrentPlaybackRate())} BPM
            </div>
          </div>
        )}
      </motion.div>
    )}
  </AnimatePresence>
</motion.div>
                  

                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="space-y-5 rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)] backdrop-blur"
                >
                  <div className="flex items-center justify-between">
  <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">Waveform & Loop</span>
  <button
    onClick={handlePreview}
    disabled={isRunning}
    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      isPreviewPlaying
        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
    } disabled:opacity-40`}
  >
    {isPreviewPlaying ? <Pause size={14} /> : <Play size={14} />}
    {isPreviewPlaying ? 'Stop' : 'Preview'}
  </button>
</div>



                  {/* Waveform Equalizer Style */}
                  <div 
  ref={waveformContainerRef}
  className="relative h-40 cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-black/60 to-black/30"
  onClick={handleWaveformClick}
>
  {isLoadingWaveform ? (
    <div className="flex h-full items-center justify-center text-neutral-500">
      Caricamento waveform...
    </div>
  ) : waveformData.length > 0 ? (
    <div className="relative flex h-full items-center justify-center gap-0 px-1">
      {waveformData.map((amplitude, index) => {
  const isInLoop = 
    (index / waveformData.length) * audioDuration >= loopStart &&
    (index / waveformData.length) * audioDuration <= loopEnd;
  const isPassed = (index / waveformData.length) * audioDuration <= currentTime;
  
  // Calcola il colore gradiente ABCD per la preview (quando non è running)
const getPreviewGradientColor = () => {
  if (isRunning) return null; // Se sta suonando, usa la logica normale
  
  const position = (index / waveformData.length) * 2; // 0 a 2 (per ripetere due volte)
  const normalizedPos = position % 1; // Posizione nel ciclo corrente (0 a 1)
  
  const colors = [
    phaseStyles['A'].accent, // blu
    phaseStyles['B'].accent, // giallo
    phaseStyles['C'].accent, // rosso
    phaseStyles['D'].accent  // verde
  ];
  
  // Determina tra quali due colori interpolare
  const colorIndex = Math.floor(normalizedPos * 4);
  const nextColorIndex = (colorIndex + 1) % 4;
  const localPos = (normalizedPos * 4) % 1; // Posizione tra i due colori (0 a 1)
  
  // Interpola tra due colori adiacenti
  const color1 = colors[colorIndex];
  const color2 = colors[nextColorIndex];
  
  // Estrai RGB dai colori hex
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);
  
  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);
  
  // Interpola
  const r = Math.round(r1 + (r2 - r1) * localPos);
  const g = Math.round(g1 + (g2 - g1) * localPos);
  const b = Math.round(b1 + (b2 - b1) * localPos);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};
  
  const previewColor = getPreviewGradientColor();
  
  return (
  <div key={index} className="relative flex h-full items-center justify-center" style={{ flex: 1 }}>
      <div
  className="rounded-full transition-all duration-150"
  style={{
    width: '2px',
    height: `${Math.max(amplitude * 95, 10)}%`,
    background: !isRunning && isInLoop
      ? isPassed
        ? `linear-gradient(to top, ${previewColor}, ${hexToRgba(previewColor, 0.4)})`
        : `linear-gradient(to top, ${hexToRgba(previewColor, 0.6)}, ${hexToRgba(previewColor, 0.3)})`
      : isInLoop && isPassed
        ? `linear-gradient(to top, ${phaseStyles[currentPhase].accent}, ${hexToRgba(phaseStyles[currentPhase].accent, 0.4)})`
        : isInLoop
          ? `linear-gradient(to top, ${hexToRgba(phaseStyles[currentPhase].accent, 0.5)}, ${hexToRgba(phaseStyles[currentPhase].accent, 0.3)})`
          : 'linear-gradient(to top, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
    boxShadow: isInLoop && isPassed
      ? `0 0 20px ${hexToRgba(phaseStyles[currentPhase].accent, 0.7)}, 0 0 40px ${hexToRgba(phaseStyles[currentPhase].accent, 0.3)}`
      : 'none',
    filter: isInLoop && isPassed ? 'brightness(1.2)' : 'none'
  }}
/>
          </div>
        );
      })}
      
      {/* Current time indicator */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white/80 shadow-[0_0_20px_rgba(255,255,255,0.6)] rounded-full"
        style={{ left: `${(currentTime / audioDuration) * 100}%` }}
      />
    </div>
  ) : (
    <div className="flex h-full items-center justify-center text-neutral-500">
      Nessun waveform disponibile
    </div>
  )}
</div>

                  {/* Faders Volume */}
                  <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.3em] text-neutral-500 mb-3">
                      Mix Volumi
                    </div>
                    
                   <div className="flex flex-col gap-4">
  {/* Fader Audio Traccia */}
  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
    <button 
      onClick={() => setIsAudioMuted(!isAudioMuted)}
      className={`p-2 rounded-lg transition-all ${isAudioMuted ? 'text-red-400 bg-red-400/10' : 'text-neutral-400 hover:bg-white/10'}`}
      title="Mute Audio"
    >
      {isAudioMuted ? <VolumeX size={20} /> : <Music size={20} />}
    </button>
    
    <div className="flex flex-col flex-1 gap-1">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold ml-1">Traccia</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={audioVolume}
        onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
        className="w-full accent-[#5dda9d] h-1.5"
      />
    </div>
    
    <span className="w-10 text-right text-xs text-neutral-500 tabular-nums font-medium">
      {isAudioMuted ? 'OFF' : `${Math.round(audioVolume * 100)}%`}
    </span>
  </div>

  {/* Fader Metronomo (Click) */}
  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
    <button 
      onClick={() => setIsClickMuted(!isClickMuted)}
      className={`p-2 rounded-lg transition-all ${isClickMuted ? 'text-red-400 bg-red-400/10' : 'text-neutral-400 hover:bg-white/10'}`}
      title="Mute Click"
    >
      {isClickMuted ? <VolumeX size={20} /> : <Activity size={20} />}
    </button>
    
    <div className="flex flex-col flex-1 gap-1">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold ml-1">Metronomo</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={clickVolume}
        onChange={(e) => setClickVolume(parseFloat(e.target.value))}
        className="w-full accent-[#5dda9d] h-1.5"
      />
    </div>
    
    <span className="w-10 text-right text-xs text-neutral-500 tabular-nums font-medium">
      {isClickMuted ? 'OFF' : `${Math.round(clickVolume * 100)}%`}
    </span>
  </div>
</div>
</div>

                  {/* Range Slider per Loop */}
                  <div className="mt-4 space-y-4">
                    <div className="text-xs uppercase tracking-[0.3em] text-neutral-500 mb-3">
                      Loop Range
                    </div>
                    
                    {/* Visualizzazione grafica del range */}
                    <div className="relative h-2 rounded-xl bg-white/5 mb-2">
                      <div
                        className="absolute h-full rounded-xl bg-gradient-to-r from-emerald-500/40 to-red-500/40"
                        style={{
                          left: `${(loopStart / audioDuration) * 100}%`,
                          width: `${((loopEnd - loopStart) / audioDuration) * 100}%`
                        }}
                      />
                      
                      {/* Marker START */}
                      <div
  className="absolute top-1/2 h-6 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-emerald-400 bg-emerald-500 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center"
  style={{ left: `${(loopStart / audioDuration) * 100}%` }}
  onMouseDown={(e) => handleLoopMarkerDrag('start', e)}
  onTouchStart={(e) => handleLoopMarkerDrag('start', e)}
>
  <Scissors size={14} className="text-white" />
</div>
                      
                      {/* Marker END */}
                      <div
  className="absolute top-1/2 h-6 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-red-400 bg-red-500 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center"
  style={{ left: `${(loopEnd / audioDuration) * 100}%` }}
  onMouseDown={(e) => handleLoopMarkerDrag('end', e)}
  onTouchStart={(e) => handleLoopMarkerDrag('end', e)}
>
  <Scissors size={14} className="text-white" />
</div>
                    </div>
                    
                    <div className="flex justify-between text-xs text-neutral-400">
                      <div className="flex flex-col">
                        <span className="font-semibold text-emerald-400">START</span>
                        <span className="tabular-nums">{formatTime(loopStart)}</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="font-semibold text-red-400">END</span>
                        <span className="tabular-nums">{formatTime(loopEnd)}</span>
                      </div>
                    </div>
                  </div> 
                </motion.div>

                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="space-y-5 rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)] backdrop-blur"
                >

                  <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">Controlli</span>
                  
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleReset}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition hover:bg-white/10"
                      title="Reset globale"
                    >
                      <RotateCcw size={22} />
                    </button>

                    <button
                      onClick={handleRestartPhase}
                      disabled={!isRunning || isInBreak || isFocused}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition hover:bg-white/10 disabled:opacity-40"
                      title={`Ripeti sezione ${currentPhase}`}
                    >
                      <RefreshCcw size={22} />
                    </button>

                    <button
                      onClick={handleStartStop}
                      disabled={isInBreak && countdownTimeoutsRef.current.length > 0}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-10 py-4 text-lg font-semibold transition shadow-[0_18px_40px_rgba(7,24,19,0.4)] ${
                        isRunning && !isPaused
                          ? 'border border-red-500/20 bg-gradient-to-r from-[#734848] to-[#5a3535] text-red-50'
                          : 'border border-emerald-400/20 bg-gradient-to-r from-[#3e5c55] to-[#2e4741] text-emerald-50'
                      } disabled:opacity-40`}
                    >
                      {isRunning && !isPaused ? <Pause size={18} /> : <Play size={18} />}
                      {isRunning && !isPaused ? 'Pausa' : isPaused ? 'Riprendi' : 'Start'}
                    </button>

                    <button
                      onClick={handleFocusToggle}
                      disabled={!isRunning || isInBreak || isPaused}
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition ${
                        isFocused
                          ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300 shadow-[0_0_25px_rgba(252,211,77,0.4)]'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      } disabled:opacity-40`}
                      title="Focus"
                    >
                      <Target size={22} />
                    </button>

                    <button
                      onClick={goToNextPhase}
                      disabled={!isRunning || isInBreak || currentPhase === 'D' || isFocused}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition hover:bg-white/10 disabled:opacity-40"
                      title="Fase successiva"
                    >
                      <SkipForward size={22} />
                    </button>
                  </div>

                 
                </motion.div>
              </div>

              <div className="space-y-8">
                <motion.div
  variants={scaleIn}
  initial="hidden"
  animate="visible"
  className="rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(6,8,10,0.35)] backdrop-blur"
>
  <div className="space-y-3 mb-4">
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">
        Playlist Audio ({audioFiles.length})
      </span>
      <button
        onClick={() => setShowStorageModal(true)}
        className="text-xs text-neutral-500 hover:text-neutral-300 transition"
      >
        📊 {(storageUsage / 1024 / 1024).toFixed(1)}MB / {(storageQuota / 1024 / 1024 / 1024).toFixed(1)}GB
      </button>
    </div>
    
    <div className="flex flex-wrap gap-2">
      {/* AGGIUNGI (primo) */}
      <label className={`flex items-center gap-1.5 cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 ${isLoadingFile ? 'opacity-50 cursor-wait' : ''}`}>
  {isLoadingFile ? (
    <>
      <div className="animate-spin h-3 w-3 border-2 border-emerald-300 border-t-transparent rounded-full" />
      <span>Carico...</span>
    </>
  ) : (
    <>
      <Plus size={12} />
      Aggiungi
    </>
  )}
  <input
    type="file"
    accept="audio/*"
    onChange={handleFileUpload}
    className="hidden"
    disabled={isLoadingFile}
  />
</label>


      {/* SALVA PLAYLIST (secondo) */}
      <button
        onClick={exportSession}
        disabled={audioFiles.length === 0}
        className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-40"
        title="Salva playlist (JSON portabile)"
      >
        <Upload size={12} />
        Salva Playlist
      </button>

      {/* CARICA PLAYLIST (terzo) */}
      <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1.5 text-xs font-semibold text-purple-300 transition hover:bg-purple-500/20">
        <Download size={12} />
        Carica Playlist
        <input
          type="file"
          accept=".json"
          onChange={importSession}
          className="hidden"
        />
      </label>
    </div>
  </div>


  
  <div className="space-y-2 max-h-60 overflow-y-auto pr-2" style={{scrollbarWidth: 'thin'}}>
    {audioFiles.map(file => (
      <div
        key={file.id}
        className={`flex items-center gap-2 rounded-lg border p-3 transition cursor-pointer ${
          currentFileId === file.id
            ? 'border-[#5dda9d] bg-emerald-500/10'
            : 'border-white/10 bg-white/5 hover:border-white/20'
        }`}
        onClick={() => loadFile(file)}
      >
        <Music size={16} className={currentFileId === file.id ? 'text-[#5dda9d]' : 'text-neutral-500'} />
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-100">{file.name}</div>
          <div className="text-xs text-neutral-500 tabular-nums">{formatTime(file.duration)}</div>
        </div>
        <div className="flex gap-1">
          {/* Rimuovi dalla playlist */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeFile(file.id);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-yellow-500/10 hover:border-yellow-500/30"
            title="Rimuovi dalla playlist"
          >
            <Minus size={14} />
          </button>
          
          {/* Cancella definitivamente */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteFileFromLibrary(file.id);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-red-500/10 hover:border-red-500/30"
            title="Cancella definitivamente"
          >
            <X size={14} className="text-red-400" />
          </button>
        </div>
      </div>
    ))}
    <button
  onClick={loadAllDBFiles}
  className="flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20"
  title="Libreria completa"
>
  <Music size={12} />
  Libreria
</button>
    {audioFiles.length === 0 && (
      <div className="text-center py-8 text-neutral-500 text-sm">
        Nessun file caricato
      </div>
    )}
  </div>
{/* MODAL LIBRERIA DATABASE */}
{showDBFilesModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div className="w-full max-w-lg max-h-[70vh] rounded-2xl border border-white/20 bg-[#0b0d0e]/95 shadow-2xl">
      {/* Header con X */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h3 className="text-lg font-semibold">Libreria ({allDBFiles.length})</h3>
        <button
          onClick={() => setShowDBFilesModal(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>
      
      {/* Lista file scrollabile */}
      <div className="space-y-2 overflow-y-auto p-4" style={{ maxHeight: 'calc(70vh - 80px)' }}>
        {allDBFiles.map(file => {
          const isInPlaylist = audioFiles.some(f => f.id === file.id);
          
          return (
            <div
              key={file.id}
              className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                isInPlaylist ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <Music size={14} className={isInPlaylist ? 'text-emerald-400' : 'text-neutral-500'} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-semibold">{file.name}</div>
                <div className="text-xs text-neutral-500 tabular-nums">{formatTime(file.duration)}</div>
              </div>
              
              {isInPlaylist ? (
                <span className="text-xs text-emerald-400 font-semibold whitespace-nowrap">✓ Caricato</span>
              ) : (
                <button
                  onClick={() => addFileFromDB(file)}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 whitespace-nowrap"
                >
                  <Plus size={12} />
                  Aggiungi
                </button>
              )}
            </div>
          );
        })}
        
        {allDBFiles.length === 0 && (
          <div className="py-12 text-center text-sm text-neutral-500">
            Nessun file nel database
          </div>
        )}
      </div>
    </div>
  </div>
)}
</motion.div>

                

                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="space-y-5 rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)] backdrop-blur"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">Overview Sezioni</span>
                  </div>
                  <div className="space-y-5">
                    {phaseOrder.map(key => (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between text-sm font-semibold text-neutral-200">
                          <span>{key} • {phaseStyles[key].name}</span>
                          <span className="text-neutral-400">{Math.round(getPhasePercentage(key) * 100)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-neutral-500">
                          <span>{phaseRepetitions[key]} ripetizioni</span>
                          <span>{phasePercentages[key]}%</span>
                        </div>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <div
  className="h-full rounded-full"
  style={{ 
    width: `${Math.min(phasePercentages[key], 150) / 150 * 100}%`,
    background: phasePercentages[key] > 100
      ? `linear-gradient(to right, 
          ${phaseStyles[key].accent} 0%, 
          ${phaseStyles[key].accent} ${(100 / phasePercentages[key]) * 100}%, 
          #ff6b35 ${(100 / phasePercentages[key]) * 100}%, 
          #ff0000 100%
        )`
      : `linear-gradient(to right, ${phaseStyles[key].accent}, ${phaseStyles[key].accent})`,
    transition: 'width 0.3s ease, background 0.3s ease'
  }}
/>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#18181b] p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)]"
                >
                  <button
                    onClick={() => {
                      setShowSettings(!showSettings);
                      setShowInstructions(false);
                    }}
                    className="flex w-full items-center justify-between text-sm font-semibold transition"
                    style={{ backgroundColor: '#18181b', padding: '12px', borderRadius: '12px' }}
                  >
                    <span style={{ color: '#d4d4d8' }}>Settings ABCD</span>
                    {showSettings ? <ChevronUp size={18} style={{ color: '#d4d4d8' }} /> : <ChevronDown size={18} style={{ color: '#d4d4d8' }} />}
                  </button>

                  <AnimatePresence initial={false}>
                    {showSettings && (
                      <motion.div
                        key="settings-panel"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className="mt-6 space-y-8 text-neutral-200"
                      >
                        <div>
                          <label className="mb-3 block text-xs uppercase tracking-[0.35em] text-neutral-500">Ripetizioni per Sezione</label>
                          <div className="space-y-4">
                            {phaseOrder.map(key => (
                              <div key={key}>
                                <div className={`mb-2 text-xs font-semibold uppercase tracking-[0.35em] ${phaseStyles[key].textColor}`}>
                                  {key} • {phaseStyles[key].name}
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                  {[1, 2, 3, 4, 5].map(reps => (
                                    <button
                                      key={reps}
                                      onClick={() => updatePhaseRepetitions(key, reps)}
                                      disabled={isRunning && !isPaused}
                                      className={`rounded-xl border py-2 text-sm font-semibold transition ${
                                        phaseRepetitions[key] === reps
                                          ? `border-white/20 bg-gradient-to-r ${phaseStyles[key].color} text-white`
                                          : 'border-white/5 bg-transparent text-neutral-400 hover:border-white/20 hover:text-neutral-100'
                                      } ${isRunning && !isPaused ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                      {reps}
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-2 grid grid-cols-5 gap-2">
                                  {[6, 7, 8, 9, 10].map(reps => (
                                    <button
                                      key={reps}
                                      onClick={() => updatePhaseRepetitions(key, reps)}
                                      disabled={isRunning && !isPaused}
                                      className={`rounded-xl border py-2 text-sm font-semibold transition ${
                                        phaseRepetitions[key] === reps
                                          ? `border-white/20 bg-gradient-to-r ${phaseStyles[key].color} text-white`
                                          : 'border-white/5 bg-transparent text-neutral-400 hover:border-white/20 hover:text-neutral-100'
                                      } ${isRunning && !isPaused ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                      {reps}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="mb-3 block text-xs uppercase tracking-[0.35em] text-neutral-500">Percentuali Velocità</label>
                          <div className="grid gap-5 md:grid-cols-2">
                            {phaseOrder.map(key => (
                              <div key={key} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.35em] text-neutral-400">
                                  <span className={phaseStyles[key].textColor}>{key}</span>
                                  <span>{phasePercentages[key]}%</span>
                                </div>
                                {key === 'D' ? (
                                  <p className="text-[11px] text-neutral-500">Fissata a 100% (velocità target)</p>
                                ) : (
                                  <input
                                    type="range"
                                    min="50"
                                    max="150"
                                    step="1"
                                    value={phasePercentages[key]}
                                    onChange={(e) => updatePhasePercentage(key, Number(e.target.value))}
                                    className="w-full accent-[#3e5c55]"
                                    disabled={isRunning && !isPaused}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-5 space-y-3">
                          <button
                            onClick={handleResetDefaults}
                            disabled={isRunning && !isPaused}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-400 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <RefreshCcw size={16} className="text-neutral-500" />
                            Ripristina Defaults
                          </button>
                          <div className="text-center text-[11px] uppercase tracking-[0.3em] text-neutral-500">
                            {isRunning && !isPaused ? 'Impossibile modificare durante riproduzione' : 'Tutte le modifiche verranno riportate ai valori iniziali'}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#18181b] p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)]"
                >
                  <button
                    onClick={() => {
                      setShowInstructions(!showInstructions);
                      setShowSettings(false);
                    }}
                    className="flex w-full items-center justify-between text-sm font-semibold transition"
                    style={{ backgroundColor: '#18181b', padding: '12px', borderRadius: '12px' }}
                  >
                    <span className="flex items-center gap-2" style={{ color: '#d4d4d8' }}>
                      <Info size={16} style={{ color: '#d4d4d8' }} />
                      <span style={{ color: '#d4d4d8' }}>Info & Istruzioni</span>
                    </span>
                    {showInstructions ? <ChevronUp size={18} style={{ color: '#d4d4d8' }} /> : <ChevronDown size={18} style={{ color: '#d4d4d8' }} />}
                  </button>

                  <AnimatePresence initial={false}>
                    {showInstructions && (
                      <motion.div
  key="instructions-panel"
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.4, ease: 'easeOut' }}
  className="mt-6 space-y-6 text-neutral-300"
>
  <div className="space-y-3">
    <h4 className="text-lg font-semibold text-neutral-200">Cos'è ABCD Audio Practice</h4>
    <p className="text-sm text-neutral-400">
      ABCD Audio Practice è uno strumento progettato per musicisti che vogliono studiare in modo più efficace utilizzando file audio. 
      Basato sul metodo ABCD (Attenzione, Base, Challenge, Destinazione), ti permette di progredire gradualmente da velocità ridotte 
      fino alla velocità target, migliorando tecnica, precisione e resistenza.
    </p>
  </div>
  
  <div className="border-t border-white/10 pt-4 space-y-3">
    <h4 className="text-lg font-semibold text-neutral-200">Come Funziona</h4>
    <p className="text-sm text-neutral-400">
      1. <span className="font-semibold text-neutral-200">Carica un file audio</span> (backing track, esercizio, brano da studiare)<br/>
      2. <span className="font-semibold text-neutral-200">Imposta un loop</span> opzionale sulla sezione che vuoi ripetere<br/>
      3. <span className="font-semibold text-neutral-200">Premi Start</span> e l'app riprodurrà l'audio attraverso 4 fasi progressive<br/>
      4. Ogni fase ha una <span className="font-semibold text-neutral-200">velocità diversa</span> e un numero di <span className="font-semibold text-neutral-200">ripetizioni configurabile</span>
    </p>
  </div>

  <div className="border-t border-white/10 pt-4 space-y-3">
    <h4 className="text-lg font-semibold text-neutral-200">Le 4 Fasi ABCD</h4>
    <div className="space-y-2">
      <div className="rounded-lg border border-white/5 bg-white/5 p-3">
        <div className="font-semibold text-[#98b5f5]">A — Attenzione (70%)</div>
        <p className="text-xs text-neutral-400 mt-1">Concentrati sulla meccanica e sulla precisione. Velocità ridotta per costruire le basi corrette.</p>
      </div>
      <div className="rounded-lg border border-white/5 bg-white/5 p-3">
        <div className="font-semibold text-[#f4d48a]">B — Base (85%)</div>
        <p className="text-xs text-neutral-400 mt-1">Consolida la tecnica aumentando gradualmente. Lavora su stabilità e qualità del suono.</p>
      </div>
      <div className="rounded-lg border border-white/5 bg-white/5 p-3">
        <div className="font-semibold text-[#ffb08a]">C — Challenge (105%)</div>
        <p className="text-xs text-neutral-400 mt-1">Supera la velocità target per sviluppare resistenza e sicurezza. La zona di sfida.</p>
      </div>
      <div className="rounded-lg border border-white/5 bg-white/5 p-3">
        <div className="font-semibold text-[#9de7c6]">D — Destinazione (100%)</div>
        <p className="text-xs text-neutral-400 mt-1">Velocità target. Dopo la challenge, questa velocità risulterà naturale e controllata.</p>
      </div>
    </div>
  </div>

  <div className="border-t border-white/10 pt-4 space-y-3">
    <h4 className="text-lg font-semibold text-neutral-200">Personalizzazione</h4>
    <p className="text-sm text-neutral-400">
      Nella sezione <span className="font-semibold text-neutral-200">Settings</span> puoi modificare:
    </p>
    <ul className="list-none space-y-1 pl-4 text-sm text-neutral-400">
      <li>• Numero di ripetizioni per ogni fase (1-10)</li>
      <li>• Percentuale di velocità per le fasi A, B, C (50%-150%)</li>
      <li>• La fase D è fissa al 100% (velocità target)</li>
    </ul>
  </div>

  <div className="border-t border-white/10 pt-4 space-y-3">
    <h4 className="text-lg font-semibold text-neutral-200">Tips per lo Studio</h4>
    <ul className="list-none space-y-1 pl-4 text-sm text-neutral-400">
      <li>• Usa il <span className="font-semibold text-neutral-200">loop</span> per concentrarti su passaggi difficili</li>
      <li>• Il pulsante <span className="font-semibold text-neutral-200">Focus</span> ripete all'infinito la fase corrente</li>
      <li>• Aumenta gradualmente le ripetizioni man mano che migliori</li>
      <li>• Anche solo 12 minuti al giorno portano risultati evidenti</li>
    </ul>
  </div>

  <div className="border-t border-white/10 pt-4">
    
     <a href="https://batterista.online"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 rounded-xl border border-[#3e5c55] bg-gradient-to-r from-[#3e5c55]/20 to-[#2e4741]/20 px-6 py-3 text-sm font-semibold text-[#5dda9d] transition hover:border-[#5dda9d] hover:shadow-lg"
    >
      🥁 Vai al sito Batterista Online
    </a>
  </div>
</motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </div>
          </div>
        ) : null}
        
        {/* MODAL IMPORT PLAYLIST */}
{showImportModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0d0e] p-8 shadow-2xl">
        <h2 className="mb-6 text-2xl font-semibold">
          Importa Playlist: <span className="text-[#5dda9d]">{sessionName}</span>
        </h2>
      
      <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
        <p className="text-sm text-blue-300">
          <strong>✅ {Object.keys(importMatchedFiles).length} file</strong> trovati automaticamente in cache
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          <strong>⚠️ {importPendingFiles.filter(f => !importMatchedFiles[f.id]).length} file</strong> mancanti - ricaricali manualmente
</p>
</div>
<div className="mb-6 space-y-3">
    {importPendingFiles.map(pendingFile => {
      const isMatched = !!importMatchedFiles[pendingFile.id];
      
      return (
        <div
          key={pendingFile.id}
          className={`rounded-xl border p-4 transition ${
            isMatched
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-red-500/40 bg-red-500/10'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isMatched ? (
                  <span className="text-emerald-400 text-lg">✅</span>
                ) : (
                  <span className="text-red-400 text-lg">❌</span>
                )}
                <span className="font-semibold truncate">{pendingFile.name}</span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Durata: {formatTime(pendingFile.duration)} • 
                Loop: {formatTime(pendingFile.loopStart)} - {formatTime(pendingFile.loopEnd)}
              </div>
            </div>
            
            {!isMatched && (
              <label className="cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 whitespace-nowrap">
                📁 Ricarica
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleReloadFileForImport(pendingFile, e)}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      );
    })}
    
    {Object.keys(importMatchedFiles).length > 0 && importPendingFiles.length === 0 && (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
        <p className="text-emerald-300 font-semibold">
          ✅ Tutti i file sono già presenti!
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          Clicca "Completa" per caricare la playlist.
        </p>
      </div>
    )}
  </div>
  
  <div className="flex gap-4">
    <button
      onClick={() => {
        setShowImportModal(false);
        setImportPendingFiles([]);
        setImportMatchedFiles({});
      }}
      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-semibold transition hover:bg-white/10"
    >
      Annulla
    </button>
    
    <button
      onClick={completeImport}
      disabled={Object.keys(importMatchedFiles).length === 0}
      className="flex-1 rounded-xl bg-gradient-to-r from-[#3e5c55] to-[#2e4741] px-6 py-3 font-semibold shadow-lg transition hover:shadow-xl disabled:opacity-40"
    >
      Completa Importazione
    </button>
  </div>
</div>
</div>
)}


{/* MODAL STORAGE INFO */}
{showStorageModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0d0e] p-8 shadow-2xl">
      <h2 className="mb-6 text-2xl font-semibold">📊 Gestione Storage</h2>
      
      <div className="mb-6 space-y-4">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-neutral-400">Spazio utilizzato</span>
            <span className="font-semibold">{(storageUsage / 1024 / 1024).toFixed(1)} MB</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
              style={{ width: `${Math.min((storageUsage / storageQuota) * 100, 100)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {((storageUsage / storageQuota) * 100).toFixed(1)}% di {(storageQuota / 1024 / 1024 / 1024).toFixed(1)} GB disponibili
          </div>
        </div>
        
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-400">File audio in cache</span>
            <span className="font-semibold">{audioFiles.length}</span>
          </div>
          <div className="text-xs text-neutral-500">
            I file sono salvati nel browser e persistono tra le sessioni
          </div>
        </div>
        
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="text-xs text-yellow-300">
            ⚠️ <strong>Nota:</strong> Se cancelli i dati del browser (cookie/cache) perderai tutti i file (dal Database, NON dal tuo dispositivo!)
            Esporta regolarmente le playlist come backup!
          </p>
        </div>
      </div>
      
      <div className="space-y-3">
        <button
          onClick={clearAllStorage}
          className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 font-semibold text-red-300 transition hover:bg-red-500/20"
        >
          🗑️ Cancella Tutti i File
        </button>
        
        <button
          onClick={() => setShowStorageModal(false)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-semibold transition hover:bg-white/10"
        >
          Chiudi
        </button>
      </div>
    </div>
  </div>
)}
        
         {/* INSERISCI IL FOOTER QUI */}

        <footer className="mt-16 border-t border-white/10 pt-8 pb-4">
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                Copyright © Batterista Online - Tutti i diritti riservati
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-neutral-500">
                <a href="https://batterista.online" target="_blank" rel="noopener noreferrer" className="hover:text-[#5dda9d] transition">
                  www.batterista.online
                </a>
                <span>•</span>
                <a href="mailto:info@batterista.online" className="hover:text-[#5dda9d] transition">
                  info@batterista.online
                </a>
              </div>
              <p className="text-xs text-neutral-600">
                ABCD Audio Versione 1.2
              </p>
            </div>

            <div className="space-y-4">
  <div className="flex items-center justify-center">
    
      <a href="https://www.buymeacoffee.com/batterista"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-neutral-300 transition hover:border-[#5dda9d] hover:text-[#5dda9d] hover:shadow-lg"
    >
      <span>Aiutami a mantenere questa applicazione sempre gratuita:</span>
      <span className="ml-2">☕ Offrimi un caffè</span>
    </a>
  </div>

  {showInstallButton && (
    <div className="flex items-center justify-center pt-4 border-t border-white/10">
      <button
        onClick={handleInstallClick}
        className="flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-6 py-3 text-sm font-semibold text-blue-300 transition hover:border-blue-400/40 hover:bg-blue-500/20 hover:text-blue-200"
      >
        <Download size={18} /> Installa App
      </button>
    </div>
  )}
</div>
            
          </div>
        </footer>
        {/* FINE FOOTER */}

{/* Loading Overlay */}
        {isLoadingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/20 bg-[#0b0d0e]/95 p-8 shadow-2xl">
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-[#5dda9d] border-t-transparent" />
                <div className="text-lg font-semibold text-white">Caricamento file audio...</div>
                <div className="text-sm text-neutral-400">Analisi BPM e generazione waveform</div>
              </div>
            </div>
          </div>
        )}
{/* Overlay di caricamento per il Pitch Shift */}
<AnimatePresence>
  {isProcessing && (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md"
    >
      <div className="flex flex-col items-center gap-6 p-8 rounded-3xl bg-white/5 border border-white/10 shadow-2xl">
        {/* La "rotellina" o Spinner */}
        <div className="relative">
          <div className="h-20 w-20 animate-spin rounded-full border-4 border-[#5dda9d]/20 border-t-[#5dda9d]" />
          <Activity className="absolute inset-0 m-auto text-[#5dda9d] animate-pulse" size={32} />
        </div>
        
        <div className="text-center">
          <h3 className="text-xl font-bold text-white">Elaborazione Audio</h3>
          <p className="text-white/60 text-sm mt-1">Sto applicando il pitch shift, un momento...</p>
        </div>
        
        {/* Barra di progresso finta (opzionale) */}
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-[#5dda9d]"
            animate={{ x: [-200, 200] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          />
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>

      </div>
    </div>
  );

   
}

export default App;
