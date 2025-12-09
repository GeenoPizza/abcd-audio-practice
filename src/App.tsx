import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, SkipForward, RotateCcw, Upload, Scissors, RefreshCcw, Volume2, Target, Music, X, ChevronDown, ChevronUp, Plus, Minus, Info, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  useFullTrack: boolean;
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
  
  type AudioFileData = {
  id: string;
  url: string;
  name: string;
  duration: number;
  loopStart: number;
  loopEnd: number;
  useFullTrack: boolean;
  waveform: number[];
  fileHash?: string; // Per smart matching
  timestamp: number;
};

const [audioFiles, setAudioFiles] = useState<AudioFileData[]>([]);
const [currentFileId, setCurrentFileId] = useState<string | null>(null);
const [audioFile, setAudioFile] = useState<string | null>(null);
const [audioFileName, setAudioFileName] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [useFullTrack, setUseFullTrack] = useState(true);
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
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const globalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextPhaseOnBreakEndRef = useRef<PhaseKey>('A');
  const breakStartedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith('audio/')) return;
  
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
      useFullTrack: true,
      waveform: waveformData,
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
      useFullTrack: true,
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
  } finally {
    setIsLoadingWaveform(false);
  }
  
  event.target.value = '';
};

const loadFile = (fileData: AudioFileData) => {
  handleReset();
  setCurrentFileId(fileData.id);
  setAudioFile(fileData.url);
  setAudioFileName(fileData.name);
  setAudioDuration(fileData.duration);
  setLoopStart(fileData.loopStart);
  setLoopEnd(fileData.loopEnd);
  setUseFullTrack(fileData.useFullTrack);
  setWaveformData(fileData.waveform);
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
      useFullTrack: f.useFullTrack,
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
  loopStart: importedFile.loopStart,  // ✅ Dalla playlist
  loopEnd: importedFile.loopEnd,      // ✅ Dalla playlist
  useFullTrack: importedFile.useFullTrack, // ✅ Dalla playlist
  waveform: matchedDB.waveform,
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
      useFullTrack: pendingFile.useFullTrack,
      waveform: waveformData,
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
      useFullTrack: pendingFile.useFullTrack,
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
        ? { ...f, loopStart, loopEnd, useFullTrack, waveform: waveformData }
        : f
    ));
  }
}, [loopStart, loopEnd, useFullTrack, currentFileId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      setLoopEnd(audio.duration);
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

// Salva modifiche loop in IndexedDB
// SOSTITUISCI l'useEffect (righe ~756-785) con questo:
useEffect(() => {
  if (!currentFileId || !audioFile) return;
  
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
        blob: existingFile.blob, // ✅ USA IL BLOB ORIGINALE
        duration: audioDuration,
        loopStart,
        loopEnd,
        useFullTrack,
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
}, [loopStart, loopEnd, useFullTrack, currentFileId, audioFileName, audioDuration, waveformData, audioFiles]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioFile) return;

    const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(audio.currentTime);
    requestAnimationFrame(() => setCurrentTime(audio.currentTime));

    // effectiveEnd e effectiveStart vengono calcolati qui, ma il blocco FOCUS li ignorerà
    // per forzare l'uso di loopStart/loopEnd per la ripetizione.
    const effectiveEnd = useFullTrack ? audioDuration : loopEnd;
    const effectiveStart = useFullTrack ? 0 : loopStart;

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
  }, [audioFile, loopStart, loopEnd, audioDuration, useFullTrack, isRunning, isPaused, isInBreak, isFocused, currentRepetition, phaseRepetitions, currentPhase]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioFile) return;

    if (isRunning && !isPaused && !isInBreak) {
      audio.playbackRate = getCurrentPlaybackRate();
      audio.play().catch(err => console.error('Audio play error:', err));
    } else {
      audio.pause();
    }
  }, [isRunning, isPaused, isInBreak, currentPhase, phasePercentages, audioFile]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);
  
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
        useFullTrack: f.useFullTrack,
        waveform: f.waveform,
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
    setIsPreviewPlaying(false);
  }
}, [currentFileId]);
const [previewTime, setPreviewTime] = useState(0);

 // ✅ Esegui solo all'avvio

  const startBreak = (phaseToStartAfterBreak: PhaseKey) => {
    countdownTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    countdownTimeoutsRef.current = [];
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
  const handlePreviewLoop = () => {
  const audio = audioRef.current;
  if (!audio || isRunning) return;
  
  if (isPreviewPlaying) {
    audio.pause();
    setIsPreviewPlaying(false);
  } else {
    const effectiveStart = useFullTrack ? 0 : loopStart;
    audio.currentTime = effectiveStart;
    audio.playbackRate = 1;
    setPreviewTime(effectiveStart); // ✅ Inizializza previewTime
    audio.play();
    setIsPreviewPlaying(true);
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
    if (isPreviewPlaying) {
  audioRef.current?.pause();
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
        const effectiveStart = useFullTrack ? 0 : loopStart;
        audioRef.current.currentTime = effectiveStart;
      }
      
      setTimeout(() => startBreak('A'), 50);
    }
  };

  const handleReset = () => {
    countdownTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    countdownTimeoutsRef.current = [];
    if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    if (globalIntervalRef.current) clearInterval(globalIntervalRef.current);
    
    setIsRunning(false);
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
      const effectiveStart = useFullTrack ? 0 : loopStart;
      audioRef.current.currentTime = effectiveStart;
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
        audioRef.current.currentTime = useFullTrack ? 0 : loopStart;
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
      audioRef.current.currentTime = useFullTrack ? 0 : loopStart;
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

  const handleLoopMarkerDrag = (type: 'start' | 'end', e: React.MouseEvent) => {
    if (isRunning && !isPaused) return;
    
    const container = waveformContainerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const x = Math.max(0, Math.min(moveEvent.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      const newTime = percentage * audioDuration;
      
      if (type === 'start') {
        setLoopStart(Math.min(newTime, loopEnd - 1));
      } else {
        setLoopEnd(Math.max(newTime, loopStart + 1));
      }
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const clearAudioFile = () => {
  handleReset();
  setAudioFiles([]);
  setCurrentFileId(null);
  setAudioFile(null);
  setAudioFileName('');
  setAudioDuration(0);
  setLoopStart(0);
  setLoopEnd(0);
  setCurrentTime(0);
  setWaveformData([]);
  setUseFullTrack(true);
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
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light leading-tight text-neutral-100">
            <span className="font-semibold text-[#88a7d0]">A</span>
            <span className="font-semibold text-[#c2b68a]">B</span>
            <span className="font-semibold text-[#d9a88a]">C</span>
            <span className="font-semibold text-[#8ab7aa]">D</span>
            <span className="pl-2 font-light text-neutral-300">method:audio</span>
          </h1>
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

        {!audioFile ? (
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
  <label className="inline-flex cursor-pointer items-center gap-3 rounded-full bg-gradient-to-r from-[#3e5c55] to-[#2e4741] px-8 py-4 text-lg font-semibold shadow-lg transition hover:shadow-xl">
    <Upload size={20} />
    Carica File Audio
    <input
      type="file"
      accept="audio/*"
      onChange={handleFileUpload}
      className="hidden"
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
          
        ) : (
          <div className="mt-14 space-y-8">
          <motion.div 
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {phaseOrder.map(key => (
                <div
                  key={key}
                  className={`flex items-center justify-center gap-1 rounded-full border px-4 py-2 text-sm transition ${
                    currentPhase === key
                      ? `bg-gradient-to-r ${phaseStyles[key].color} font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]`
                      : 'border-white/5 bg-white/5 text-neutral-300'
                  }`}
                >
                  <span className="font-bold" style={{ color: currentPhase === key ? 'white' : phaseStyles[key].accent }}>
                    {key}
                  </span>
                  <span>{phaseStyles[key].name.substring(1)}</span>
                </div>
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

                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="space-y-5 rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)] backdrop-blur"
                >
                  <div className="flex items-center justify-between">
  <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">Waveform & Loop</span>
  <button
    onClick={handlePreviewLoop}
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
    (index / waveformData.length) * audioDuration >= (useFullTrack ? 0 : loopStart) &&
    (index / waveformData.length) * audioDuration <= (useFullTrack ? audioDuration : loopEnd);
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

                  {/* Range Sliders per Loop */}
                  {!useFullTrack && (
  <div className="mt-4 space-y-4">
    {/* Visualizzazione grafica del range */}
    <div className="relative h-3 rounded-xl bg-white/5">
      <div
        className="absolute h-full rounded-xl bg-gradient-to-r from-emerald-500/40 to-red-500/40"
        style={{
          left: `${(loopStart / audioDuration) * 100}%`,
          width: `${((loopEnd - loopStart) / audioDuration) * 100}%`
        }}
      />
      <div
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-emerald-400 bg-emerald-500 shadow-lg cursor-pointer"
        style={{ left: `${(loopStart / audioDuration) * 100}%` }}
      />
      <div
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-red-400 bg-red-500 shadow-lg cursor-pointer"
        style={{ left: `${(loopEnd / audioDuration) * 100}%` }}
      />
    </div>

    {/* Slider START separato */}
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-emerald-400">START</span>
        <span className="tabular-nums text-neutral-400">{formatTime(loopStart)}</span>
      </div>
      <input
        type="range"
        min="0"
        max={audioDuration}
        step="0.1"
        value={loopStart}
        onChange={(e) => setLoopStart(Math.min(Number(e.target.value), loopEnd - 1))}
        disabled={isRunning && !isPaused}
        className="w-full accent-emerald-500"
      />
    </div>

    {/* Slider END separato */}
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-red-400">END</span>
        <span className="tabular-nums text-neutral-400">{formatTime(loopEnd)}</span>
      </div>
      <input
        type="range"
        min="0"
        max={audioDuration}
        step="0.1"
        value={loopEnd}
        onChange={(e) => setLoopEnd(Math.max(Number(e.target.value), loopStart + 1))}
        disabled={isRunning && !isPaused}
        className="w-full accent-red-500"
      />
    </div>
  </div>
)}

                  <div className="space-y-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useFullTrack}
                        onChange={(e) => {
                          setUseFullTrack(e.target.checked);
                          if (e.target.checked) {
                            setLoopStart(0);
                            setLoopEnd(audioDuration);
                          }
                        }}
                        disabled={isRunning && !isPaused}
                        className="h-5 w-5 rounded accent-[#3e5c55]"
                      />
                      <span className="text-sm">Usa traccia completa</span>
                    </label>

                    {!useFullTrack && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.3em] text-neutral-500">
                            Inizio Loop (sec)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={loopEnd - 1}
                            step="0.1"
                            value={loopStart.toFixed(1)}
                            onChange={(e) => setLoopStart(Math.max(0, Math.min(Number(e.target.value), loopEnd - 1)))}
                            disabled={isRunning && !isPaused}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white disabled:opacity-50"
                          />
                        </div>
                        
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.3em] text-neutral-500">
                            Fine Loop (sec)
                          </label>
                          <input
                            type="number"
                            min={loopStart + 1}
                            max={audioDuration}
                            step="0.1"
                            value={loopEnd.toFixed(1)}
                            onChange={(e) => setLoopEnd(Math.min(audioDuration, Math.max(Number(e.target.value), loopStart + 1)))}
                            disabled={isRunning && !isPaused}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white disabled:opacity-50"
                          />
                        </div>
                      </div>
                    )}
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

                  <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                    <Volume2 size={16} className="text-neutral-400" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      className="flex-1 accent-[#3e5c55]"
                    />
                    <span className="w-10 text-right text-xs text-neutral-400 tabular-nums">{Math.round(volume * 100)}%</span>
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
      {isAutoSaving && <span className="ml-2 text-emerald-400">● Salvataggio...</span>}
    </span>
    <button
      onClick={() => setShowStorageModal(true)}
      className="text-xs text-neutral-500 hover:text-neutral-300 transition"
    >
      📊 {(storageUsage / 1024 / 1024).toFixed(1)}MB / {(storageQuota / 1024 / 1024 / 1024).toFixed(1)}GB
    </button>
  </div>
    <div className="flex flex-wrap gap-2">
  {/* 1. AGGIUNGI (primo) */}
  <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20">
    <Plus size={12} />
    Aggiungi
    <input
      type="file"
      accept="audio/*"
      onChange={handleFileUpload}
      className="hidden"
    />
  </label>

  {/* 2. SALVA PLAYLIST (secondo, icona Upload) */}
  <button
    onClick={exportSession}
    disabled={audioFiles.length === 0}
    className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-40"
    title="Salva playlist (JSON portabile)"
  >
    <Upload size={12} />
    Salva Playlist
  </button>

  {/* 3. CARICA PLAYLIST (terzo, icona Download) */}
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
  {/* Rimuovi dalla playlist (icona Minus) */}
  <button
    onClick={(e) => {
      e.stopPropagation();
      removeFile(file.id);
    }}
    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-yellow-500/10 hover:border-yellow-500/30"
    title="Rimuovi dalla playlist (rimane disponibile nel Database)"
  >
    <Minus size={14} />
  </button>
  
  {/* Cancella definitivamente (icona X rossa) */}
  <button
    onClick={(e) => {
      e.stopPropagation();
      deleteFileFromLibrary(file.id);
    }}
    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition hover:bg-red-500/10 hover:border-red-500/30"
    title="Cancella definitivamente dal Database"
  >
    <X size={14} className="text-red-400" />
  </button>
</div>
      </div>
    ))}
    
    {audioFiles.length === 0 && (
      <div className="text-center py-8 text-neutral-500 text-sm">
        Nessun file caricato
      </div>
    )}
  </div>
</motion.div>

                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(6,8,10,0.35)] backdrop-blur"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">Fase Corrente</span>
                      <div className="mt-2 text-3xl font-semibold tabular-nums text-neutral-100">
                        {currentPhase}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-center text-xs uppercase tracking-[0.35em]">
                      <span style={{ color: phaseStyles[currentPhase].accent, fontWeight: 'bold' }}>
                        Sez. {currentPhase}:
                      </span>
                      <div className="mt-0.5 text-sm font-normal tracking-normal text-neutral-400">
                        {currentRepetition + 1}/{phaseRepetitions[currentPhase]} rip.
                      </div>
                    </div>
                  </div>
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
                            className={`h-full rounded-full bg-gradient-to-r ${phaseStyles[key].color}`}
                            style={{ width: `${Math.min(phasePercentages[key], 100) / 150 * 100}%` }}
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
                    <span style={{ color: '#d4d4d8' }}>Settings</span>
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
        )}
        
        {/* MODAL IMPORT PLAYLIST */}
{showImportModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0d0e] p-8 shadow-2xl">
      <h2 className="mb-6 text-2xl font-semibold">
        📋 Importa Playlist: <span className="text-[#5dda9d]">{sessionName}</span>
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
                Loop: {pendingFile.useFullTrack ? 'Traccia completa' : `${formatTime(pendingFile.loopStart)} - ${formatTime(pendingFile.loopEnd)}`}
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

      </div>
    </div>
  );
}

export default App;
