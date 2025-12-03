import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, SkipForward, RotateCcw, Upload, Scissors, RefreshCcw, Volume2, Target, Music, X, ChevronDown, ChevronUp, Plus, Minus, Info, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    if (file && file.type.startsWith('audio/')) {
      const url = URL.createObjectURL(file);
      setAudioFile(url);
      setAudioFileName(file.name);
      setIsRunning(false);
      setIsPaused(false);
      setCurrentPhase('A');
      setCurrentRepetition(0);
      setTotalTimeRemaining(0);
      setWaveformData([]);
      
      await generateWaveform(file);
    }
  };

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioFile) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
      const effectiveEnd = useFullTrack ? audioDuration : loopEnd;
      if (audio.currentTime >= effectiveEnd - 0.1) {
        // Fine ripetizione
        if (isRunning && !isPaused && !isInBreak && !isFocused) {
          const newRepetition = currentRepetition + 1;
          setCurrentRepetition(newRepetition);
          
          // Controlla se fase completata
          if (newRepetition >= phaseRepetitions[currentPhase]) {
            const currentIndex = phaseOrder.indexOf(currentPhase);
            if (currentIndex < phaseOrder.length - 1) {
              setIsInBreak(true);
              const nextPhase = phaseOrder[currentIndex + 1];
              setTimeout(() => startBreak(nextPhase), 50);
            } else {
              // Fine ciclo completo
              setIsRunning(false);
              setCurrentPhase('A');
              setCurrentRepetition(0);
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = useFullTrack ? 0 : loopStart;
              }
            }
          }
        }
        
        // Riavvia loop
        const effectiveStart = useFullTrack ? 0 : loopStart;
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
    <div className="relative min-h-screen overflow-hidden bg-[#0b0d0e] text-white flex justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(156,176,196,0.12),_transparent_62%)]" />
      <div className="pointer-events-none absolute -bottom-32 left-[12%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,_rgba(96,129,118,0.18),_transparent_68%)] blur-3xl" />
      <div className="pointer-events-none absolute -top-48 right-[-10%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,_rgba(71,85,105,0.16),_transparent_70%)] blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pb-16 pt-10">
        <audio ref={audioRef} src={audioFile || undefined} />

        <motion.header
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-5 text-center"
        >
          <h1 className="text-5xl font-light leading-tight text-neutral-100">
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
            className="mt-14 rounded-3xl border border-white/10 bg-white/5 p-16 text-center shadow-[0_32px_70px_rgba(8,10,12,0.35)] backdrop-blur-xl"
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
            <label className="inline-flex cursor-pointer items-center gap-3 rounded-full bg-gradient-to-r from-[#3e5c55] to-[#2e4741] px-8 py-4 text-lg font-semibold shadow-lg transition hover:shadow-xl">
              <Upload size={20} />
              Seleziona File Audio
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
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

            <div className="grid gap-6 lg:gap-8 lg:grid-cols-[1fr_400px]">
              <div className="space-y-8">
                <motion.section
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="overflow-hidden rounded-[32px] border border-white/8 bg-white/5 p-8 shadow-[0_32px_70px_rgba(8,10,12,0.35)] backdrop-blur-xl"
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
                                Velocità: <span className="font-semibold text-white">{Math.round(getCurrentPlaybackRate() * 100)}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-neutral-500"></div>
                                Ripetizioni: <span className="font-semibold text-white">{currentRepetition + 1}/{phaseRepetitions[currentPhase]}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Music size={12} className="text-neutral-500" />
                                <span className="truncate">{audioFileName}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-center md:text-left">
                            <div className="mb-2 text-xs uppercase tracking-[0.4em] text-neutral-500">Ripetizione</div>
                            <div className="text-6xl font-bold tabular-nums text-neutral-100">{currentRepetition + 1}/{phaseRepetitions[currentPhase]}</div>
                            {isFocused && (
                              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.35em] text-yellow-300">
                                <Target size={14} /> FOCUS ATTIVO
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 flex justify-between text-xs text-neutral-500">
                            <span>Posizione Audio</span>
                            <span className="tabular-nums">{formatTime(currentTime)} / {formatTime(audioDuration)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/5">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${phaseStyles[currentPhase].color}`}
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
                  className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)] backdrop-blur"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">Waveform & Loop</span>
                    <Scissors size={16} className="text-neutral-500" />
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
    <div className="relative flex h-full items-center justify-center gap-1 px-4">
      {waveformData.map((amplitude, index) => {
        const isInLoop = 
          (index / waveformData.length) * audioDuration >= (useFullTrack ? 0 : loopStart) &&
          (index / waveformData.length) * audioDuration <= (useFullTrack ? audioDuration : loopEnd);
        const isPassed = (index / waveformData.length) * audioDuration <= currentTime;
        
        return (
          <div key={index} className="relative flex h-full flex-1 items-center justify-center">
            <div
  className="rounded-full transition-all duration-150"
  style={{
    width: '3px',
    height: `${Math.max(amplitude * 95, 10)}%`,
    background: isInLoop && isPassed
      ? `linear-gradient(to top, ${phaseStyles[currentPhase].accent}, ${hexToRgba(phaseStyles[currentPhase].accent, 0.4)})`
      : isInLoop
      ? `linear-gradient(to top, ${hexToRgba(phaseStyles[currentPhase].accent, 0.25)}, ${hexToRgba(phaseStyles[currentPhase].accent, 0.1)})`
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
                  className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)] backdrop-blur"
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
                  className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(6,8,10,0.35)] backdrop-blur"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <span className="text-xs uppercase tracking-[0.35em] text-neutral-500">File Audio</span>
                      <div className="mt-2 flex items-center gap-2">
                        <Music size={20} className="text-[#5dda9d]" />
                        <div className="flex-1">
                          <div className="truncate text-sm font-semibold text-neutral-100">{audioFileName}</div>
                          <div className="text-xs text-neutral-500 tabular-nums">{formatTime(audioDuration)}</div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={clearAudioFile}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-red-500/10 hover:border-red-500/30"
                      title="Rimuovi file"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </motion.div>

                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(6,8,10,0.35)] backdrop-blur"
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
                  className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)] backdrop-blur"
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
                  className="rounded-3xl border border-white/10 bg-[#18181b] p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)]"
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
                  className="rounded-3xl border border-white/10 bg-[#18181b] p-6 shadow-[0_18px_40px_rgba(5,7,9,0.4)]"
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
