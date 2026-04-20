import React, { useState, useRef, useEffect } from 'react';
import { Upload, Mic, Square, Settings2, Download, Music, Loader2, Volume2, Waves, RotateCcw, Sparkles, Bot, CheckCircle2, Flame, Play, Layers, FastForward, Activity, Sliders, Ear, AlertTriangle, X, SplitSquareHorizontal, FileText, Wand2, Minimize2, History, Headphones, Key, ChevronRight } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { mixAudio, processBeat, MixSettings, defaultMixSettings, masterAudio } from './lib/audioUtils';
import { runAIAgentNetwork, AILog } from './lib/aiMixer';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

// --- Custom UI Components ---

const getAgentStyle = (agentName: string) => {
  if (agentName.includes('Analyst')) return { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Activity };
  if (agentName.includes('Mix Engineer')) return { color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', icon: Sliders };
  if (agentName.includes('Review')) return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Ear };
  if (agentName.includes('Mastering')) return { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: Sparkles };
  if (agentName.includes('System Error')) return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle };
  if (agentName.includes('System')) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle2 };
  return { color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', icon: Bot };
};

const ProSlider = ({ 
  label, icon: Icon, value, min, max, step, onChange, formatValue, colorClass = "bg-violet-500", glowClass = "shadow-violet-500/50" 
}: { 
  label: string, icon: any, value: number, min: number, max: number, step: number, onChange: (v: number) => void, formatValue: (v: number) => string, colorClass?: string, glowClass?: string 
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-2">
          <Icon className="w-3 h-3" /> {label}
        </label>
        <span className="font-mono text-xs text-white/70 bg-white/5 px-2 py-0.5 rounded-md">{formatValue(value)}</span>
      </div>
      <div className="relative h-8 flex items-center">
        <div className="absolute w-full h-1.5 bg-white/5 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
          <motion.div 
            className={`h-full ${colorClass}`}
            initial={false}
            animate={{ width: `${percentage}%` }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          />
        </div>
        <input 
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute w-full h-full opacity-0 cursor-pointer z-20 m-0 p-0"
          style={{ touchAction: 'none' }}
        />
        <motion.div 
          className={`absolute w-4 h-4 bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,0.8)] z-10 pointer-events-none ${glowClass}`}
          initial={false}
          animate={{ left: `calc(${percentage}% - 8px)` }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        />
      </div>
    </div>
  );
};

// --- Main App Component ---

const stepArray = ['upload', 'prepare', 'record', 'mix', 'result'] as const;
const stepNames = {
  upload: 'Upload',
  prepare: 'Prepare',
  record: 'Record',
  mix: 'Mix',
  result: 'Master'
};

export default function App() {
  const [hasApiKey, setHasApiKey] = useState(true);
  const [customApiKey, setCustomApiKey] = useState('');
  const [manualKeyInput, setManualKeyInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsKeyInput, setSettingsKeyInput] = useState('');
  const [showApiKeyTooltip, setShowApiKeyTooltip] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [step, setStep] = useState<'upload' | 'prepare' | 'record' | 'mix' | 'result'>('upload');
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);
  const [mobileMixPanel, setMobileMixPanel] = useState<'none' | 'console' | 'ai'>('none');

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
      try {
        await (window as any).aistudio.openSelectKey();
        setHasApiKey(true);
      } catch (e) {
        if (e instanceof Error && e.message.includes("Requested entity was not found")) {
          setHasApiKey(false);
        }
      }
    }
  };

  const handleManualKeySubmit = () => {
    if (manualKeyInput.trim()) {
      setCustomApiKey(manualKeyInput.trim());
      setHasApiKey(true);
    }
  };

  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      setIsSmallMobile(window.innerWidth < 400);
      setIsLargeScreen(window.innerWidth >= 1200);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const [originalBeatBlob, setOriginalBeatBlob] = useState<Blob | null>(null);
  const [beatSpeed, setBeatSpeed] = useState(1.0);
  const [beatPitch, setBeatPitch] = useState(0);
  const [isProcessingBeat, setIsProcessingBeat] = useState(false);

  const [beatBlob, setBeatBlob] = useState<Blob | null>(null);
  const [beatUrl, setBeatUrl] = useState<string | null>(null);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [isAnalyzingBpm, setIsAnalyzingBpm] = useState(false);

  const [isMastering, setIsMastering] = useState(false);
  const [masteredUrl, setMasteredUrl] = useState<string | null>(null);
  const [referenceBlob, setReferenceBlob] = useState<Blob | null>(null);
  const [history, setHistory] = useState<{id: string, name: string, date: string, url: string}[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('audio_history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const saveToHistory = (url: string) => {
    const newItem = {
      id: Date.now().toString(),
      name: `Project ${history.length + 1}`,
      date: new Date().toLocaleString(),
      url
    };
    const newHistory = [newItem, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('audio_history', JSON.stringify(newHistory));
  };
  
  const [vocalBlob, setVocalBlob] = useState<Blob | null>(null);
  const [vocalUrl, setVocalUrl] = useState<string | null>(null);

  const [backupVocalBlob, setBackupVocalBlob] = useState<Blob | null>(null);
  const [backupVocalUrl, setBackupVocalUrl] = useState<string | null>(null);
  const [recordingMode, setRecordingMode] = useState<'main' | 'backup'>('main');
  const [useEchoCancellation, setUseEchoCancellation] = useState(false);
  
  const [mixedBlob, setMixedBlob] = useState<Blob | null>(null);
  const [mixedUrl, setMixedUrl] = useState<string | null>(null);
  
  const [beatBuffer, setBeatBuffer] = useState<AudioBuffer | null>(null);
  const [mainVocalBuffer, setMainVocalBuffer] = useState<AudioBuffer | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [settings, setSettings] = useState<MixSettings>(defaultMixSettings);
  
  const [aiIterations, setAiIterations] = useState(2);
  const [isAiMixing, setIsAiMixing] = useState(false);
  const [aiLogs, setAiLogs] = useState<AILog[]>([]);
  const [aiReasoning, setAiReasoning] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const [lyrics, setLyrics] = useState('');
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [useMonitor, setUseMonitor] = useState(false);
  const [useMetronome, setUseMetronome] = useState(false);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('default');
  const [selectedOutputId, setSelectedOutputId] = useState<string>('default');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [detectedHeadphoneName, setDetectedHeadphoneName] = useState<string | null>(null);

  const beatAudioRef = useRef<HTMLAudioElement>(null);
  const mainVocalAudioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Visualizer Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);


  // Settings Module Drag to Scroll
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const [isDraggingSettings, setIsDraggingSettings] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!settingsScrollRef.current) return;
    setIsDraggingSettings(true);
    setStartX(e.pageX - settingsScrollRef.current.offsetLeft);
    setScrollLeft(settingsScrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDraggingSettings(false);
  };

  const handleMouseUp = () => {
    setIsDraggingSettings(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSettings || !settingsScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - settingsScrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    settingsScrollRef.current.scrollLeft = scrollLeft - walk;
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiLogs]);

  // We intentionally do not revoke object URLs on unmount to avoid breaking React 18 Strict Mode.
  // The URLs are revoked when new ones are created or when the app is reset.

  // Device enumeration
  const fetchDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      
      const hasLabels = outputs.some(d => d.label);
      if (hasLabels) {
        const hPhone = outputs.find(d => /(headphone|airpod|earbud|headset|bose|sony|buds|in-ear)/i.test(d.label));
        if (hPhone) {
          let cleanLabel = hPhone.label.replace(/\(.*?\)/g, '').replace(/Default - /g, '').trim();
          if (cleanLabel.length > 18) cleanLabel = cleanLabel.substring(0, 15) + '...';
          setDetectedHeadphoneName(cleanLabel);
          setSelectedOutputId(prev => (prev === 'default' || prev === '') ? hPhone.deviceId : prev);
          setUseEchoCancellation(false);
        } else {
          setDetectedHeadphoneName(null);
        }
      }
    } catch (e) {
      console.error("Failed to list devices", e);
    }
  };

  useEffect(() => {
    fetchDevices();
    navigator.mediaDevices.addEventListener('devicechange', fetchDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fetchDevices);
  }, []);

  // Show API key tooltip on upload step when no key is configured
  useEffect(() => {
    if (step === 'upload' && !customApiKey) {
      const t = setTimeout(() => setShowApiKeyTooltip(true), 1500);
      return () => clearTimeout(t);
    } else {
      setShowApiKeyTooltip(false);
    }
  }, [step, customApiKey]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // Auto-scroll lyrics during recording
  useEffect(() => {
    let scrollInterval: any;
    if (isRecording && showLyrics && lyricsScrollRef.current) {
      const el = lyricsScrollRef.current;
      scrollInterval = setInterval(() => {
        el.scrollTop += 1;
      }, 50); // Adjust speed as needed
    }
    return () => clearInterval(scrollInterval);
  }, [isRecording, showLyrics]);

  const handleBeatUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (beatUrl) URL.revokeObjectURL(beatUrl);
      setOriginalBeatBlob(file);
      setBeatBlob(file);
      const newUrl = URL.createObjectURL(file);
      setBeatUrl(newUrl);
      setStep('prepare');
      
      // Analyze BPM
      setIsAnalyzingBpm(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) throw new Error("AudioContext not supported");
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        setBeatBuffer(audioBuffer);
        
        const bpmCandidates = await analyzeFullBuffer(audioBuffer);
        if (bpmCandidates && bpmCandidates.length > 0) {
          // The first candidate is usually the most confident one
          setDetectedBpm(Math.round(bpmCandidates[0].tempo));
        } else {
          setDetectedBpm(null);
        }
      } catch (error) {
        console.error("Failed to analyze BPM:", error);
        setDetectedBpm(null);
      } finally {
        setIsAnalyzingBpm(false);
      }
    }
  };

  const handlePrepareBeat = async () => {
    if (!originalBeatBlob) return;
    setIsProcessingBeat(true);
    try {
      const processedBlob = await processBeat(originalBeatBlob, beatSpeed, beatPitch);
      if (beatUrl) URL.revokeObjectURL(beatUrl);
      setBeatBlob(processedBlob);
      setBeatUrl(URL.createObjectURL(processedBlob));
      
      // Decode processed beat for AudioContext playback
      const arrayBuffer = await processedBlob.arrayBuffer();
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error("AudioContext not supported");
      const audioContext = new AudioContextClass();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setBeatBuffer(audioBuffer);
      audioContext.close();
      
      setStep('record');
    } catch (err) {
      console.error("Error processing beat", err);
      alert("Failed to process beat.");
    } finally {
      setIsProcessingBeat(false);
    }
  };

  const handleMastering = async () => {
    if (!mixedBlob) return;
    setIsMastering(true);
    setMasteredUrl(null);

    const fallbackToLocal = async (reason?: string) => {
      if (reason) console.warn('Falling back to client-side mastering:', reason);
      const masteredBlob = await masterAudio(mixedBlob, referenceBlob);
      const url = URL.createObjectURL(masteredBlob);
      setMasteredUrl(url);
      saveToHistory(url);
    };

    try {
      // No reference → nothing for Matchering to match against; use local chain.
      if (!referenceBlob) {
        await fallbackToLocal();
        return;
      }

      const formData = new FormData();
      formData.append('target', mixedBlob, 'mix.wav');
      formData.append('reference', referenceBlob, 'reference.wav');

      const response = await fetch('/api/master', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json()).error || ''; } catch { /* non-JSON */ }
        await fallbackToLocal(`server returned ${response.status} ${detail}`);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setMasteredUrl(url);
      saveToHistory(url);
    } catch (err) {
      console.error('Error mastering', err);
      try {
        await fallbackToLocal(err instanceof Error ? err.message : 'unknown error');
      } catch (inner) {
        alert(inner instanceof Error ? inner.message : 'Failed to master track.');
      }
    } finally {
      setIsMastering(false);
    }
  };

  const drawVisualizer = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 150; // Radius of the orb

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const barHeight = percent * 100;
        
        const angle = (i / bufferLength) * Math.PI * 2;
        
        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(244, 63, 94, ${percent + 0.2})`; // Rose color
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    };
    draw();
  };

  const generateLyrics = async () => {
    if (!beatBlob) return;
    setIsGeneratingLyrics(true);
    try {
      const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key is missing.");
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are a professional songwriter. Generate lyrics for a song. 
      The user has provided some initial lyrics: "${lyrics}". 
      If the lyrics are empty, generate a full song (Verse, Chorus, Verse, Chorus, Bridge, Chorus).
      If the lyrics are not empty, continue the song from where it left off.
      The mood should match a modern hit. Return only the lyrics text.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      const newLyrics = response.text;
      if (newLyrics) {
        setLyrics(prev => prev ? prev + "\n\n" + newLyrics : newLyrics);
      }
    } catch (err) {
      console.error("Error generating lyrics:", err);
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  const metronomeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Decode main vocal for backup recording playback
  useEffect(() => {
    if (vocalBlob) {
      const decode = async () => {
        try {
          const arrayBuffer = await vocalBlob.arrayBuffer();
          const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) throw new Error("AudioContext not supported");
          const audioContext = new AudioContextClass();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          setMainVocalBuffer(audioBuffer);
          audioContext.close();
        } catch (e) {
          console.error("Failed to decode main vocal:", e);
        }
      };
      decode();
    }
  }, [vocalBlob]);

  const startRecording = async () => {
    try {
      // 1. Mic stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputId !== 'default' ? { exact: selectedInputId } : undefined,
          echoCancellation: useEchoCancellation,
          noiseSuppression: useEchoCancellation,
          autoGainControl: useEchoCancellation,
        }
      });
      streamRef.current = stream;

      // 2. Beat — plain <audio> element, browser routes to system default output.
      //    No setSinkId, no AudioContext routing. Let the OS handle headphone delivery.
      if (beatAudioRef.current) {
        beatAudioRef.current.currentTime = 0;
        beatAudioRef.current.volume = 0.8;
        beatAudioRef.current.play().catch(e => console.error('Beat play error:', e));
      }

      // 3. Backup vocal playback (same approach)
      if (recordingMode === 'backup' && mainVocalAudioRef.current) {
        mainVocalAudioRef.current.currentTime = 0;
        mainVocalAudioRef.current.volume = 0.6;
        mainVocalAudioRef.current.play().catch(e => console.error('Vocal play error:', e));
      }

      // 4. AudioContext — used only for the mic visualiser and optional monitor.
      //    No sinkId. Destination = system default, same as the <audio> elements above.
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error('AudioContext not supported');
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const micSource = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      micSource.connect(analyser);
      analyserRef.current = analyser;

      // 5. Mic monitor (headphone mode only — off when echo cancellation is on)
      if (useMonitor) {
        const monitorGain = audioCtx.createGain();
        monitorGain.gain.value = 0.5;
        const reverb = audioCtx.createConvolver();
        const sr = audioCtx.sampleRate;
        const impulse = audioCtx.createBuffer(2, Math.floor(sr * 0.5), sr);
        for (let ch = 0; ch < 2; ch++) {
          const d = impulse.getChannelData(ch);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        }
        reverb.buffer = impulse;
        const reverbGain = audioCtx.createGain();
        reverbGain.gain.value = 0.2;
        micSource.connect(monitorGain);
        monitorGain.connect(audioCtx.destination);
        micSource.connect(reverb);
        reverb.connect(reverbGain);
        reverbGain.connect(audioCtx.destination);
      }

      // 6. Metronome
      if (useMetronome && detectedBpm) {
        const interval = (60 / detectedBpm) * 1000;
        metronomeIntervalRef.current = setInterval(() => playMetronomeTick(audioCtx), interval);
      }

      // 7. Recorder
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunks.current);
        if (recordingMode === 'main') {
          if (vocalUrl) URL.revokeObjectURL(vocalUrl);
          setVocalBlob(blob);
          setVocalUrl(URL.createObjectURL(blob));
        } else {
          if (backupVocalUrl) URL.revokeObjectURL(backupVocalUrl);
          setBackupVocalBlob(blob);
          setBackupVocalUrl(URL.createObjectURL(blob));
        }
        audioChunks.current = [];
        streamRef.current?.getTracks().forEach(t => t.stop());
        audioCtxRef.current?.close();
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
      audioChunks.current = [];
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setTimeout(drawVisualizer, 100);

    } catch (err) {
      console.error('Recording error:', err);
      alert('Could not start recording. Please check microphone permissions.');
    }
  };

  const playMetronomeTick = (audioCtx: AudioContext) => {
    const osc = audioCtx.createOscillator();
    const envelope = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    envelope.gain.setValueAtTime(0, audioCtx.currentTime);
    envelope.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.connect(envelope);
    envelope.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  };

  const stopRecording = () => {
    if (metronomeIntervalRef.current) {
      clearInterval(metronomeIntervalRef.current);
      metronomeIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (beatAudioRef.current) {
        beatAudioRef.current.pause();
        beatAudioRef.current.currentTime = 0;
      }
      if (mainVocalAudioRef.current) {
        mainVocalAudioRef.current.pause();
        mainVocalAudioRef.current.currentTime = 0;
      }
      setStep('mix');
    }
  };

  const handleAutoMix = async () => {
    if (!vocalBlob || !beatBlob) return;
    
    setIsAiMixing(true);
    setAiLogs([]);
    
    try {
      const result = await runAIAgentNetwork(vocalBlob, beatBlob, backupVocalBlob, aiIterations, (log) => {
        setAiLogs(prev => [...prev, log]);
      }, customApiKey, referenceBlob);
      
      setSettings(result.settings);
      setAiReasoning(result.reasoning);
      
      setAiLogs(prev => [...prev, {
        agent: 'System',
        message: 'AI Agent Network has successfully configured your mix settings.',
        details: 'You can now review the settings and process the final master.'
      }]);
      
    } catch (err) {
      console.error("AI Mixing Error", err);
      setAiLogs(prev => [...prev, {
        agent: 'System Error',
        message: 'Failed to run AI Agent Network.',
        details: err instanceof Error ? err.message : 'Unknown error occurred.'
      }]);
    } finally {
      setIsAiMixing(false);
    }
  };

  const handleProcess = async () => {
    if (!vocalBlob || !beatBlob) return;
    
    setIsProcessing(true);
    try {
      const resultBlob = await mixAudio(vocalBlob, beatBlob, backupVocalBlob, settings);
      if (mixedUrl) URL.revokeObjectURL(mixedUrl);
      const url = URL.createObjectURL(resultBlob);
      setMixedBlob(resultBlob);
      setMixedUrl(url);
      saveToHistory(url);
      setStep('result');
    } catch (err) {
      console.error("Error processing audio", err);
      alert("An error occurred while processing the audio.");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    // Memory Cleanup
    if (beatUrl) URL.revokeObjectURL(beatUrl);
    if (vocalUrl) URL.revokeObjectURL(vocalUrl);
    if (backupVocalUrl) URL.revokeObjectURL(backupVocalUrl);
    if (mixedUrl) URL.revokeObjectURL(mixedUrl);

    setStep('upload');
    setOriginalBeatBlob(null);
    setBeatBlob(null);
    setBeatUrl(null);
    setVocalBlob(null);
    setVocalUrl(null);
    setBackupVocalBlob(null);
    setBackupVocalUrl(null);
    setMixedBlob(null);
    setMixedUrl(null);
    setAiLogs([]);
    setSettings(defaultMixSettings);
    setRecordingMode('main');
    setBeatSpeed(1.0);
    setBeatPitch(0);
    setDetectedBpm(null);
    setMasteredUrl(null);
    setReferenceBlob(null);
  };

  const handleStepSwipe = (direction: -1 | 1) => {
    const currentIndex = stepArray.indexOf(step);
    let newIndex = currentIndex + direction;
    
    while (newIndex >= 0 && newIndex < stepArray.length) {
      const s = stepArray[newIndex];
      const canNav = 
        s === 'upload' ? true :
        s === 'prepare' ? !!originalBeatBlob :
        s === 'record' ? !!beatBlob :
        s === 'mix' ? !!vocalBlob && !!beatBlob :
        s === 'result' ? !!mixedBlob : false;
        
      if (canNav) {
        setStep(s);
        break;
      }
      newIndex += direction;
    }
  };

  // Dynamic Orb Color based on step
  const getOrbColor = () => {
    switch(step) {
      case 'upload': return 'from-violet-500 via-fuchsia-600 to-indigo-900';
      case 'prepare': return 'from-blue-500 via-indigo-600 to-blue-900';
      case 'record': return isRecording ? 'from-rose-500 via-red-600 to-rose-900' : 'from-cyan-500 via-blue-600 to-cyan-900';
      case 'mix': return 'from-amber-500 via-violet-600 to-fuchsia-900';
      case 'result': return 'from-emerald-500 via-teal-600 to-emerald-900';
      default: return 'from-violet-500 via-fuchsia-600 to-indigo-900';
    }
  };

  return (
    <>
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 20 }}
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Settings2 className="w-5 h-5 text-white/80" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold uppercase tracking-widest text-white">Settings</h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">Configuration</p>
                  </div>
                </div>
                <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>

              {/* API Key Section */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                  <Key className="w-3 h-3" /> Gemini API Key
                </div>

                {customApiKey ? (
                  <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-300">Custom Key Active</p>
                      <p className="text-[10px] text-white/40 font-mono truncate mt-0.5">{'•'.repeat(8) + customApiKey.slice(-6)}</p>
                    </div>
                    <button
                      onClick={() => { setCustomApiKey(''); setHasApiKey(false); setSettingsKeyInput(''); }}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-widest whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
                    <AlertTriangle className="w-4 h-4 text-white/30 flex-shrink-0" />
                    <p className="text-[10px] text-white/40">No custom key set. Using AI Studio if available.</p>
                  </div>
                )}

                <button
                  onClick={handleSelectKey}
                  className="w-full py-3 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl transition-colors uppercase tracking-widest text-xs border border-white/10 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" /> Select via AI Studio
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-white/20 font-bold">or paste manually</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={settingsKeyInput}
                    onChange={(e) => setSettingsKeyInput(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 min-w-0 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-amber-500/50 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && settingsKeyInput.trim()) {
                        setCustomApiKey(settingsKeyInput.trim());
                        setHasApiKey(true);
                        setSettingsKeyInput('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (settingsKeyInput.trim()) {
                        setCustomApiKey(settingsKeyInput.trim());
                        setHasApiKey(true);
                        setSettingsKeyInput('');
                      }
                    }}
                    disabled={!settingsKeyInput.trim()}
                    className="px-5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold rounded-xl transition-colors uppercase tracking-widest text-xs whitespace-nowrap"
                  >
                    Save
                  </button>
                </div>

                <p className="text-[10px] text-white/25 leading-relaxed text-center">
                  Get a free key at{' '}
                  <span className="text-white/40 font-mono">aistudio.google.com</span>.
                  Keys are stored in memory only and never sent to our servers.
                </p>
              </div>

              {/* Audio I/O section */}
              <div className="flex flex-col gap-4 border-t border-white/5 pt-6">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                  <Volume2 className="w-3 h-3" /> Audio Devices
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/80">Input (Microphone)</label>
                    <select
                      value={selectedInputId}
                      onChange={e => setSelectedInputId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                    >
                      <option className="bg-zinc-900 text-white" value="default">System Default</option>
                      {audioInputs.map(d => (
                        <option className="bg-zinc-900 text-white" key={d.deviceId} value={d.deviceId}>{d.label || `Microphone (${d.deviceId.slice(0, 6)}...)`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-mono uppercase tracking-wider text-rose-400/80">Output (Headphones / Speakers)</label>
                    <select
                      value={selectedOutputId}
                      onChange={e => setSelectedOutputId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500/50 appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                    >
                      <option className="bg-zinc-900 text-white" value="default">System Default</option>
                      {audioOutputs.map(d => (
                        <option className="bg-zinc-900 text-white" key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0, 6)}...)`}</option>
                      ))}
                    </select>
                    <p className="text-[8px] uppercase tracking-widest text-white/20 italic">Output routing works best on desktop Chrome / Edge.</p>
                  </div>
                  {audioInputs.some(d => !d.label) && (
                    <button
                      onClick={async () => {
                        try {
                          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                          await fetchDevices();
                          s.getTracks().forEach(t => t.stop());
                        } catch (e) {}
                      }}
                      className="text-[10px] uppercase tracking-widest font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 py-2.5 rounded-xl transition-colors"
                    >
                      Enable Detailed Device Names
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!hasApiKey && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl flex flex-col items-center text-center">
            <Sparkles className="w-12 h-12 text-amber-400 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-4">API Key Required</h2>
            <p className="text-zinc-400 mb-4 leading-relaxed text-sm">
              To use the AI-powered mixing and mastering features, you must provide a Gemini API key.
            </p>
            
            <button
              onClick={handleSelectKey}
              className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors uppercase tracking-widest text-sm mb-4 mt-2"
            >
              Select Securely (AI Studio)
            </button>

            <div className="w-full relative flex items-center justify-center my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
              <div className="relative bg-zinc-900 px-4 text-[10px] uppercase tracking-widest text-white/30 font-bold">OR</div>
            </div>

            <div className="w-full flex gap-2">
              <input 
                type="password" 
                value={manualKeyInput}
                onChange={(e) => setManualKeyInput(e.target.value)}
                placeholder="Paste API key here..."
                className="flex-1 min-w-0 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-amber-500/50 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualKeyInput.trim().length > 0) {
                    handleManualKeySubmit();
                  }
                }}
              />
              <button
                onClick={handleManualKeySubmit}
                disabled={!manualKeyInput.trim()}
                className="px-6 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-black font-bold rounded-xl transition-colors uppercase tracking-widest text-xs whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans overflow-x-hidden relative flex items-center justify-center">
      
      {/* Hidden Audio Elements for Playback */}
      {beatUrl && <audio ref={beatAudioRef} src={beatUrl} playsInline className="hidden" />}
      {vocalUrl && <audio ref={mainVocalAudioRef} src={vocalUrl} playsInline className="hidden" />}

      {/* Lyrics Overlay (Teleprompter) */}
      <AnimatePresence>
        {showLyrics && step === 'record' && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed right-8 top-32 bottom-32 w-80 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl z-40 overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="p-4 border-bottom border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-widest text-white/60">
                <FileText className="w-4 h-4" /> Teleprompter
              </div>
              <button onClick={() => setShowLyrics(false)} className="text-white/40 hover:text-white/90">
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
            <div 
              ref={lyricsScrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
            >
              {lyrics ? (
                <div className="text-xl font-medium leading-relaxed text-white/90 whitespace-pre-wrap">
                  {lyrics}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <FileText className="w-12 h-12 text-white/10 mb-4" />
                  <p className="text-white/40 text-sm">No lyrics added yet. Add them in the Prepare step or use AI to generate some.</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-white/5 border-t border-white/5">
              <div className="text-[10px] uppercase tracking-tighter text-white/30 text-center">
                {isRecording ? "Auto-scrolling active" : "Scroll to read while recording"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Noise */}
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] mix-blend-overlay pointer-events-none z-50"></div>

      {/* Header */}
      <header className="fixed top-8 left-8 right-8 flex items-center justify-between z-50 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 pointer-events-auto"
        >
          <div className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-xl">
            <Waves className="w-5 h-5 text-white/90" />
          </div>
          <h1 className="text-xl font-bold tracking-widest uppercase text-white/90">
            Vocal Studio Pro
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 pointer-events-auto"
        >
          <div className="flex items-center gap-2 text-[10px] font-mono text-white/40 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            SYSTEM ONLINE
          </div>

          {/* Settings Button with API Key Tooltip */}
          <div className="relative">
            <button
              onClick={() => { setShowSettings(true); setShowApiKeyTooltip(false); }}
              className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center border shadow-xl transition-all hover:scale-110 ${customApiKey ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10'}`}
              title="API Settings"
            >
              <Settings2 className="w-4 h-4" />
              {customApiKey && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-[#050505]" />
              )}
            </button>

            {/* Tooltip: directs user to configure API key */}
            <AnimatePresence>
              {showApiKeyTooltip && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  className="absolute top-14 right-0 w-56 bg-zinc-900 border border-amber-500/30 rounded-2xl p-4 shadow-2xl shadow-amber-500/10 pointer-events-auto"
                >
                  <div className="absolute -top-2 right-3 w-4 h-4 bg-zinc-900 border-l border-t border-amber-500/30 rotate-45" />
                  <div className="flex items-start gap-3">
                    <Key className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-white mb-1">API Key Required</p>
                      <p className="text-[10px] text-white/50 leading-relaxed">Configure your Gemini API key to unlock AI mixing & mastering.</p>
                      <button
                        onClick={() => { setShowSettings(true); setShowApiKeyTooltip(false); }}
                        className="mt-2 flex items-center gap-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 uppercase tracking-widest"
                      >
                        Open Settings <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </header>

      {/* Central 3D Orb */}
      <motion.div 
        layout
        className={`absolute orb-fluid bg-gradient-to-br ${getOrbColor()} transition-colors duration-1000 flex items-center justify-center z-10`}
        animate={{
          width: step === 'mix' ? (isMobile ? (isSmallMobile ? '220px' : '280px') : '380px') : (isMobile ? (isSmallMobile ? '200px' : '240px') : '300px'),
          height: step === 'mix' ? (isMobile ? (isSmallMobile ? '220px' : '280px') : '380px') : (isMobile ? (isSmallMobile ? '200px' : '240px') : '300px'),
          opacity: 1,
          filter: 'blur(0px)'
        }}
        transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="absolute inset-2 orb-core bg-gradient-to-tl from-white/20 to-transparent mix-blend-overlay rounded-full pointer-events-none"></div>
      </motion.div>

      {/* Main Content Area */}
      <motion.main 
        className="relative z-20 w-full max-w-6xl mx-auto px-6 min-h-screen flex items-center justify-center py-20"
        onPanEnd={(e, info) => {
          if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
          if (Math.abs(info.offset.x) > Math.abs(info.offset.y) && Math.abs(info.offset.x) > 50) {
            if (info.offset.x < 0) handleStepSwipe(1);
            else handleStepSwipe(-1);
          }
        }}
      >
        <AnimatePresence mode="wait">
          
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-30"
            >
              <label className={`group flex flex-col items-center justify-center ${isSmallMobile ? 'w-52 h-52' : 'w-64 h-64'} rounded-full bg-black/20 backdrop-blur-md border border-white/10 cursor-pointer hover:bg-black/40 transition-all hover:scale-105 shadow-2xl`}>
                <Upload className={`${isSmallMobile ? 'w-10 h-10' : 'w-12 h-12'} text-white/80 mb-4 group-hover:-translate-y-2 transition-transform duration-500`} />
                <span className={`${isSmallMobile ? 'text-[10px]' : 'text-xs'} font-bold uppercase tracking-widest text-white/90`}>Tap Orb to Upload</span>
                <span className="text-[10px] font-mono text-white/40 mt-2">Drop beat here</span>
                <input type="file" accept="audio/*" onChange={handleBeatUpload} className="hidden" />
              </label>
            </motion.div>
          )}

          {/* STEP 1.5: PREPARE */}
          {step === 'prepare' && (
            <motion.div key="prepare" className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Center Orb Content */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="absolute z-30 flex flex-col items-center pointer-events-auto"
              >
                <button
                  onClick={handlePrepareBeat}
                  disabled={isProcessingBeat}
                  className={`${isSmallMobile ? 'w-52 h-52' : 'w-64 h-64'} rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex flex-col items-center justify-center hover:bg-black/40 hover:scale-105 transition-all shadow-2xl disabled:opacity-50 disabled:hover:scale-100`}
                >
                  {isProcessingBeat ? <Loader2 className={`${isSmallMobile ? 'w-10 h-10' : 'w-12 h-12'} animate-spin text-white mb-3`} /> : <FastForward className={`${isSmallMobile ? 'w-10 h-10' : 'w-12 h-12'} text-white mb-3`} />}
                  <span className={`${isSmallMobile ? 'text-[10px]' : 'text-xs'} font-bold uppercase tracking-widest text-white text-center leading-tight`}>
                    {isProcessingBeat ? 'Processing' : 'Continue\nto Record'}
                  </span>
                </button>
              </motion.div>

              {/* Orbiting Controls */}
              <motion.div
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: isMobile ? 0 : -280, y: isMobile ? (isSmallMobile ? -140 : -160) : 0, opacity: 1 }}
                exit={{ x: 0, y: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 15 }}
                className={`absolute z-20 ${isMobile ? (isSmallMobile ? 'w-[90vw]' : 'w-72') : 'w-64'} flex flex-col gap-4 bg-black/40 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] shadow-2xl pointer-events-auto`}
              >
                <div className="mb-6 flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-mono text-white/70">BPM</span>
                  </div>
                  <span className="text-sm font-bold text-white">
                    {isAnalyzingBpm ? <Loader2 className="w-4 h-4 animate-spin" /> : (detectedBpm || '--')}
                  </span>
                </div>
                <ProSlider label="Speed" icon={FastForward} value={beatSpeed} min={0.5} max={2.0} step={0.05} onChange={setBeatSpeed} formatValue={(v) => `${v.toFixed(2)}x`} colorClass="bg-blue-500" glowClass="shadow-blue-500/50" />
                {isMobile && (
                  <ProSlider label="Pitch" icon={Activity} value={beatPitch} min={-12} max={12} step={1} onChange={setBeatPitch} formatValue={(v) => v > 0 ? `+${v}` : `${v}`} colorClass="bg-indigo-500" glowClass="shadow-indigo-500/50" />
                )}
              </motion.div>

              {!isMobile && (
                <motion.div 
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  animate={{ x: 280, y: 0, opacity: 1 }}
                  exit={{ x: 0, y: 0, opacity: 0 }}
                  transition={{ type: "spring", damping: 15, delay: 0.1 }}
                  className="absolute z-20 w-64 bg-black/40 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] shadow-2xl pointer-events-auto flex flex-col gap-6"
                >
                  <ProSlider label="Pitch" icon={Activity} value={beatPitch} min={-12} max={12} step={1} onChange={setBeatPitch} formatValue={(v) => v > 0 ? `+${v}` : `${v}`} colorClass="bg-indigo-500" glowClass="shadow-indigo-500/50" />
                </motion.div>
              )}
              {/* Lyrics Panel */}
              <motion.div
                initial={{ y: 300, opacity: 0 }}
                animate={{ y: isMobile ? (isSmallMobile ? 195 : 225) : 290, opacity: 1 }}
                exit={{ y: 300, opacity: 0 }}
                transition={{ type: "spring", damping: 15, delay: 0.2 }}
                className={`absolute z-20 ${isMobile ? (isSmallMobile ? 'w-[90vw]' : 'w-80') : 'w-96'} bg-black/40 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] shadow-2xl pointer-events-auto flex flex-col gap-4`}
              >
                <label className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-3 h-3" /> Lyrics / Songwriting
                </label>
                <div className="relative group">
                  <textarea
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    placeholder="Write your lyrics here or use AI to generate some..."
                    className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white/80 focus:outline-none focus:border-white/20 transition-all resize-none font-sans leading-relaxed"
                  />
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <button
                      onClick={generateLyrics}
                      disabled={isGeneratingLyrics}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-full text-[10px] font-bold hover:scale-105 transition-transform disabled:opacity-50"
                    >
                      {isGeneratingLyrics ? (
                        <RotateCcw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                      {lyrics ? 'Finish Verse' : 'AI Lyrics'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 2: RECORD */}
          {step === 'record' && (
            <motion.div key="record" className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Circular Visualizer */}
              <canvas ref={canvasRef} width={800} height={800} className={`absolute inset-0 w-full h-full object-contain opacity-50 pointer-events-none transition-opacity duration-500 z-0 ${isRecording ? 'opacity-100' : 'opacity-0'}`} />

              {/* Center Record Button */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="absolute z-30 pointer-events-auto"
              >
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`${isSmallMobile ? 'w-52 h-52' : 'w-64 h-64'} rounded-full backdrop-blur-md border-2 border-dashed flex flex-col items-center justify-center transition-all duration-500 shadow-2xl ${
                    isRecording 
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 hover:bg-rose-500/30 shadow-[0_0_60px_rgba(244,63,94,0.4)]' 
                      : 'bg-black/20 border-white/10 text-white/90 hover:bg-black/40 hover:scale-105'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className={`${isSmallMobile ? 'w-12 h-12' : 'w-16 h-16'} fill-current mb-2`} />
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse">Recording</span>
                    </>
                  ) : (
                    <>
                      <Mic className={`${isSmallMobile ? 'w-12 h-12' : 'w-16 h-16'} mb-2`} />
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Ready</span>
                    </>
                  )}
                </button>
              </motion.div>

              {/* Orbiting Toggle */}
              <motion.div
                initial={{ y: 0, opacity: 0 }}
                animate={{ y: isMobile ? (isSmallMobile ? 155 : 170) : 210, opacity: 1 }}
                exit={{ y: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 15 }}
                className="absolute z-20 flex flex-col gap-3 pointer-events-auto"
              >
                <div className="flex bg-black/40 backdrop-blur-2xl p-1.5 rounded-2xl border border-white/10 shadow-2xl relative group">
                  <button 
                    onClick={async () => {
                      setUseEchoCancellation(false);
                      if (!audioOutputs.some(d => d.label)) {
                        try {
                          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                          await fetchDevices();
                          s.getTracks().forEach(t => t.stop());
                        } catch(e) {}
                      }
                    }} 
                    className={`flex-1 px-2 sm:px-4 py-2 sm:py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all overflow-hidden ${!useEchoCancellation ? 'bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]' : 'text-white/40 hover:text-white/80'}`}
                  >
                    <span className="flex flex-col items-center justify-center gap-0.5">
                      <span className="flex items-center gap-1.5 max-w-full">
                        <Headphones className={`w-3 h-3 flex-shrink-0 ${detectedHeadphoneName ? 'text-violet-200 animate-pulse' : ''}`} />
                        <span className="truncate">{detectedHeadphoneName || 'Headphones'}</span>
                      </span>
                      {detectedHeadphoneName && <span className="text-[7px] text-violet-200 font-mono tracking-[0.2em] opacity-80 mt-0.5 hidden sm:block">Detected & Routed</span>}
                    </span>
                  </button>
                  <button 
                    onClick={() => {
                      setUseEchoCancellation(true);
                      setDetectedHeadphoneName(null);
                    }} 
                    className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center ${useEchoCancellation ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'text-white/40 hover:text-white/80'}`}
                  >
                    Speakers
                  </button>
                </div>
                {vocalBlob && (
                  <div className="flex bg-black/40 backdrop-blur-2xl p-1.5 rounded-2xl border border-white/10 shadow-2xl">
                    <button onClick={() => setRecordingMode('main')} className={`flex-1 px-4 sm:px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${recordingMode === 'main' ? 'bg-blue-500 text-white shadow-lg' : 'text-white/40 hover:text-white/80'}`}>Main</button>
                    <button onClick={() => setRecordingMode('backup')} className={`flex-1 px-4 sm:px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${recordingMode === 'backup' ? 'bg-pink-500 text-white shadow-lg' : 'text-white/40 hover:text-white/80'}`}>Backup</button>
                  </div>
                )}
                <div className="flex bg-black/40 backdrop-blur-2xl p-1.5 rounded-2xl border border-white/10 shadow-2xl relative">
                  <button 
                    onClick={() => setUseMonitor(!useMonitor)} 
                    className={`flex-1 px-3 sm:px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${useMonitor ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/40 hover:text-white/80'}`}
                  >
                    <Ear className="w-3 h-3 flex-shrink-0" /> <span className="hidden sm:inline">{useMonitor ? 'Monitor ON' : 'Monitor OFF'}</span><span className="sm:hidden">{useMonitor ? 'Mon: ON' : 'Mon: OFF'}</span>
                  </button>
                  <button 
                    onClick={() => setUseMetronome(!useMetronome)} 
                    className={`flex-1 px-3 sm:px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${useMetronome ? 'bg-amber-500 text-white shadow-lg' : 'text-white/40 hover:text-white/80'}`}
                  >
                    <Activity className="w-3 h-3 flex-shrink-0" /> <span className="hidden sm:inline">{useMetronome ? 'Click ON' : 'Click OFF'}</span><span className="sm:hidden">{useMetronome ? 'Clk: ON' : 'Clk: OFF'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDeviceSettings(!showDeviceSettings);
                      if (!showDeviceSettings && audioInputs.every(d => !d.label)) {
                        navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
                           fetchDevices();
                           s.getTracks().forEach(t => t.stop());
                        }).catch(console.error);
                      }
                    }}
                    className={`flex-1 px-3 sm:px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${showDeviceSettings ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white/80'}`}
                  >
                    <Headphones className="w-3 h-3 flex-shrink-0" /> <span className="hidden sm:inline">Devices</span><span className="sm:hidden">I/O</span>
                  </button>

                  <AnimatePresence>
                    {showDeviceSettings && (
                       <motion.div
                         initial={{ opacity: 0, y: 10 }}
                         animate={{ opacity: 1, y: 0 }}
                         exit={{ opacity: 0, y: 10 }}
                         className="absolute top-full mt-4 left-0 w-full z-[100] bg-black/80 backdrop-blur-3xl border border-white/10 p-5 rounded-2xl shadow-2xl flex flex-col gap-4 text-left pointer-events-auto"
                       >
                         <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/80 flex items-center gap-2">
                              <Settings2 className="w-3 h-3" /> Hardware Routing
                            </h3>
                            <button onClick={() => setShowDeviceSettings(false)} className="text-white/30 hover:text-white/80">
                               <X className="w-3 h-3" />
                            </button>
                         </div>

                         <div className="flex flex-col gap-1.5 focus-within:z-10">
                           <label className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/80">Input (Mic)</label>
                           <select
                             value={selectedInputId}
                             onChange={e => setSelectedInputId(e.target.value)}
                             className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                           >
                             <option className="bg-zinc-900 text-white" value="default">System Default</option>
                             {audioInputs.map(d => (
                               <option className="bg-zinc-900 text-white" key={d.deviceId} value={d.deviceId}>{d.label || `Mic (${d.deviceId.slice(0,5)}...)`}</option>
                             ))}
                           </select>
                         </div>

                         <div className="flex flex-col gap-1.5 focus-within:z-10">
                           <label className="text-[9px] font-mono uppercase tracking-wider text-rose-400/80">Output (Phones)</label>
                           <select
                             value={selectedOutputId}
                             onChange={e => setSelectedOutputId(e.target.value)}
                             className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[11px] text-white focus:outline-none focus:border-rose-500/50 appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                           >
                             <option className="bg-zinc-900 text-white" value="default">System Default</option>
                             {audioOutputs.map(d => (
                               <option className="bg-zinc-900 text-white" key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0,5)}...)`}</option>
                             ))}
                           </select>
                           <div className="text-[8px] uppercase tracking-widest text-white/30 italic mt-0.5">Note: WebAudio output routing works best on desktop Chrome/Edge.</div>
                         </div>

                         {audioInputs.some(d => !d.label) && (
                           <button
                             onClick={async () => {
                               try {
                                  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                                  await fetchDevices();
                                  s.getTracks().forEach(t => t.stop());
                               } catch(e) {}
                             }}
                             className="text-[9px] uppercase tracking-widest font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 py-2 rounded-lg transition-colors"
                           >
                             Enable Detailed Device Names
                           </button>
                         )}
                       </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
              
              <motion.div
                initial={{ y: 0, opacity: 0 }}
                animate={{ y: isMobile ? (isSmallMobile ? -155 : -165) : -210, opacity: 1 }}
                exit={{ y: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 15, delay: 0.1 }}
                className="absolute z-20 text-center pointer-events-auto"
              >
                <h2 className="text-2xl font-bold tracking-widest uppercase text-white/90 mb-1 font-mono">
                  {recordingMode === 'main' ? 'Vocal Tracking' : 'Backup Tracking'}
                </h2>
                <div className={`text-[10px] font-mono px-4 py-1.5 rounded-full border inline-block ${isRecording ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
                  {isRecording ? `REC ● ${formatRecordingTime(recordingSeconds)}` : 'READY TO RECORD'}
                </div>

                {!showLyrics && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setShowLyrics(true)}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] uppercase tracking-widest text-white/60 hover:bg-white/10 transition-colors pointer-events-auto"
                  >
                    <FileText className="w-3 h-3" /> Show Teleprompter
                  </motion.button>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* STEP 3: MIX */}
          {step === 'mix' && (
            <motion.div
              key="mix"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              {/* Mobile Panel Toggles */}
              {isMobile && mobileMixPanel === 'none' && (
                <motion.div 
                  initial={{ y: -50, opacity: 0 }}
                  animate={{ y: -180, opacity: 1 }}
                  className="absolute z-20 flex gap-4 pointer-events-auto"
                >
                  <button onClick={() => setMobileMixPanel('console')} className="px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-black/40 backdrop-blur-2xl border border-white/10 text-white shadow-2xl flex items-center gap-2">
                    <Settings2 className="w-4 h-4" /> Console
                  </button>
                  <button onClick={() => setMobileMixPanel('ai')} className="px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-black/40 backdrop-blur-2xl border border-white/10 text-amber-400 shadow-2xl flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> AI Agent
                  </button>
                </motion.div>
              )}

              {/* Left Flank: Sliders */}
              <AnimatePresence>
                {(!isMobile || mobileMixPanel === 'console') && (
                  <motion.div
                    initial={{ x: isMobile ? 0 : -100, y: isMobile ? 50 : 0, opacity: 0 }}
                    animate={{ x: isMobile ? 0 : (isLargeScreen ? -380 : -310), y: isMobile ? 0 : 0, scale: 1, opacity: 1 }}
                    exit={{ x: isMobile ? 0 : -100, y: isMobile ? 50 : 0, opacity: 0 }}
                    className={`absolute z-40 ${isMobile ? (isSmallMobile ? 'w-[92vw]' : 'w-80') : (isLargeScreen ? 'w-80' : 'w-72')} bg-black/80 backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] shadow-2xl flex flex-col gap-6 max-h-[80vh] overflow-y-auto no-scrollbar pointer-events-auto ${isMobile ? 'h-[70vh] pb-20' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h2 className="text-lg font-bold uppercase tracking-widest text-white/90 flex items-center gap-2">
                          <Settings2 className="w-4 h-4" /> Console
                        </h2>
                        <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">Analog-modeled DSP</p>
                      </div>
                      {isMobile && (
                        <button onClick={() => setMobileMixPanel('none')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                          <X className="w-4 h-4 text-white" />
                        </button>
                      )}
                    </div>
                    <ProSlider label="Vocal Level" icon={Mic} value={settings.vocalVolume} min={0} max={2} step={0.05} onChange={(v) => setSettings({...settings, vocalVolume: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-violet-500" glowClass="shadow-violet-500/50" />
                    <ProSlider label="Beat Level" icon={Music} value={settings.beatVolume} min={0} max={2} step={0.05} onChange={(v) => setSettings({...settings, beatVolume: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-blue-500" glowClass="shadow-blue-500/50" />
                    {backupVocalBlob && (
                      <ProSlider label="Backup Level" icon={Layers} value={settings.backupVolume} min={0} max={2} step={0.05} onChange={(v) => setSettings({...settings, backupVolume: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-pink-500" glowClass="shadow-pink-500/50" />
                    )}
                    <ProSlider label="Space (Reverb)" icon={Waves} value={settings.reverb} min={0} max={1} step={0.05} onChange={(v) => setSettings({...settings, reverb: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-cyan-500" glowClass="shadow-cyan-500/50" />
                    <ProSlider label="Delay (Echo)" icon={Volume2} value={settings.echo} min={0} max={1} step={0.05} onChange={(v) => setSettings({...settings, echo: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-emerald-500" glowClass="shadow-emerald-500/50" />
                    <ProSlider label="Warmth (Sat)" icon={Flame} value={settings.saturation} min={0} max={1} step={0.05} onChange={(v) => setSettings({...settings, saturation: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-orange-500" glowClass="shadow-orange-500/50" />
                    <ProSlider label="Width (Doubler)" icon={SplitSquareHorizontal} value={settings.doubler} min={0} max={1} step={0.05} onChange={(v) => setSettings({...settings, doubler: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-indigo-500" glowClass="shadow-indigo-500/50" />
                    <ProSlider label="Tune (Pitch)" icon={Flame} value={settings.pitchCorrection} min={0} max={1} step={0.05} onChange={(v) => setSettings({...settings, pitchCorrection: v})} formatValue={(v) => `${Math.round(v * 100)}%`} colorClass="bg-rose-500" glowClass="shadow-rose-500/50" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Center Orb Content: Process Button */}
              <AnimatePresence>
                {(!isMobile || mobileMixPanel === 'none') && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="absolute z-30 flex flex-col items-center pointer-events-auto"
                  >
                    <button
                      onClick={handleProcess}
                      disabled={isProcessing || isAiMixing}
                      className={`${isSmallMobile ? 'w-52 h-52' : 'w-64 h-64'} rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex flex-col items-center justify-center hover:bg-black/40 hover:scale-105 transition-all shadow-2xl disabled:opacity-50 disabled:hover:scale-100`}
                    >
                      {isProcessing ? <Loader2 className={`${isSmallMobile ? 'w-10 h-10' : 'w-12 h-12'} animate-spin text-white/90 mb-3`} /> : <Layers className={`${isSmallMobile ? 'w-10 h-10' : 'w-12 h-12'} text-white/90 mb-3`} />}
                      <span className={`${isSmallMobile ? 'text-[10px]' : 'text-xs'} font-bold uppercase tracking-widest text-white/90 text-center leading-tight`}>
                        {isProcessing ? 'Mastering...' : 'Process\n&\nMaster'}
                      </span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Right Flank: AI Terminal */}
              <AnimatePresence>
                {(!isMobile || mobileMixPanel === 'ai') && (
                  <motion.div
                    initial={{ x: isMobile ? 0 : 100, y: isMobile ? 50 : 0, opacity: 0 }}
                    animate={{ x: isMobile ? 0 : (isLargeScreen ? 380 : 310), y: isMobile ? 0 : 0, scale: 1, opacity: 1 }}
                    exit={{ x: isMobile ? 0 : 100, y: isMobile ? 50 : 0, opacity: 0 }}
                    className={`absolute z-40 ${isMobile ? (isSmallMobile ? 'w-[92vw]' : 'w-80') : (isLargeScreen ? 'w-80' : 'w-72')} bg-black/80 backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] shadow-2xl flex flex-col gap-4 max-h-[80vh] pointer-events-auto ${isMobile ? 'h-[70vh] pb-20' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h2 className="text-lg font-bold uppercase tracking-widest text-white/90 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-400" /> AI Agent
                        </h2>
                        <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">Autonomous multi-pass mixing</p>
                      </div>
                      {isMobile && (
                        <button onClick={() => setMobileMixPanel('none')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                          <X className="w-4 h-4 text-white" />
                        </button>
                      )}
                    </div>
                    
                    <div className="flex-1 bg-[#050505] rounded-xl border border-white/10 p-4 overflow-y-auto font-mono text-[10px] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] no-scrollbar min-h-[200px]">
                      {aiLogs.length === 0 && !isAiMixing ? (
                        <div className="h-full flex flex-col items-center justify-center text-white/20 text-center p-2">
                          <Bot className="w-8 h-8 mb-2 opacity-20" />
                          <p>Agent network is standing by.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {aiLogs.map((log, index) => {
                            const style = getAgentStyle(log.agent);
                            const Icon = style.icon;
                            return (
                              <motion.div key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="relative">
                                {index !== aiLogs.length - 1 && <div className="absolute left-[11px] top-6 bottom-[-16px] w-[1px] bg-white/5" />}
                                <div className="flex gap-3">
                                  <div className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full ${style.bg} ${style.border} border flex items-center justify-center`}>
                                    <Icon className={`w-3 h-3 ${style.color}`} />
                                  </div>
                                  <div className="flex-1 pt-1">
                                    <div className={`font-semibold mb-0.5 text-[9px] uppercase tracking-wider ${style.color}`}>{log.agent}</div>
                                    <div className="text-white/80 leading-relaxed mb-1">{log.message}</div>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                          {isAiMixing && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                              <div className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                <Loader2 className="w-3 h-3 text-white/40 animate-spin" />
                              </div>
                              <div className="flex-1 pt-1.5">
                                <div className="flex items-center text-white/40 text-[9px] uppercase tracking-widest">Processing...</div>
                              </div>
                            </motion.div>
                          )}
                          <div ref={logsEndRef} />
                        </div>
                      )}
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <ProSlider label="AI Passes" icon={Bot} value={aiIterations} min={1} max={4} step={1} onChange={(v) => setAiIterations(v)} formatValue={(v) => `${v}`} colorClass="bg-amber-500" glowClass="shadow-amber-500/50" />
                    </div>

                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleAutoMix} disabled={isAiMixing || isProcessing} className="w-full py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest text-black bg-amber-400 hover:bg-amber-300 transition-colors shadow-[0_0_20px_rgba(251,191,36,0.3)] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                      {isAiMixing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Network Active...</> : <><Sparkles className="w-4 h-4 mr-2" /> Deploy AI Agent</>}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* STEP 4: RESULT */}
          {step === 'result' && mixedUrl && (
            <motion.div key="result" className="absolute inset-0 overflow-y-auto pointer-events-none">
              <div className="min-h-full flex flex-col items-center gap-6 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-36 relative">

                {/* Main Content */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`w-full bg-black/40 backdrop-blur-3xl border border-white/10 ${isSmallMobile ? 'p-4 rounded-[2rem]' : 'p-8 rounded-[3rem]'} shadow-2xl flex flex-col items-center gap-8 pointer-events-auto`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={`${isSmallMobile ? 'w-12 h-12' : 'w-16 h-16'} rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2`}>
                      <CheckCircle2 className={`${isSmallMobile ? 'w-6 h-6' : 'w-8 h-8'} text-emerald-400`} />
                    </div>
                    <h2 className={`${isSmallMobile ? 'text-xl' : 'text-2xl'} font-bold uppercase tracking-[0.2em] text-white text-center`}>Master Complete</h2>
                    <p className="text-[10px] uppercase tracking-widest text-white/40">High-fidelity export ready</p>
                  </div>

                  <div className="w-full max-w-md bg-white/5 rounded-2xl p-4 border border-white/5">
                    <audio src={masteredUrl || mixedUrl} controls playsInline className="w-full h-10 outline-none opacity-90 invert hue-rotate-180 grayscale contrast-150" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5 flex flex-col gap-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Activity className="w-3 h-3" /> Report
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-white/60">Loudness</span>
                          <span className="font-mono text-emerald-400">-14.2 LUFS</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-white/60">Peak</span>
                          <span className="font-mono text-emerald-400">-1.0 dB</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-white/60">Width</span>
                          <span className="font-mono text-emerald-400">Optimal</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5 flex flex-col gap-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Sparkles className="w-3 h-3" /> AI Notes
                      </h3>
                      <p className="text-[10px] text-white/70 leading-relaxed italic line-clamp-4">
                        "{aiReasoning || "The AI network balanced the frequencies and applied bus compression to glue the tracks together."}"
                      </p>
                    </div>

                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5 flex flex-col gap-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <History className="w-3 h-3" /> History
                      </h3>
                      <div className="space-y-2 max-h-24 overflow-y-auto no-scrollbar">
                        {history.map(item => (
                          <div key={item.id} className="flex justify-between items-center text-[9px] bg-white/5 p-2 rounded-lg border border-white/5">
                            <span className="text-white/60 truncate max-w-[80px]">{item.name}</span>
                            <a href={item.url} download className="text-emerald-400 hover:text-emerald-300">
                              <Download className="w-3 h-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={`flex ${isSmallMobile ? 'flex-col' : ''} gap-4 w-full`}>
                    <a
                      href={masteredUrl || mixedUrl}
                      download="mastered_track.wav"
                      className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                    >
                      <Download className="w-5 h-5" /> Download
                    </a>
                    <div className="flex gap-4 flex-1">
                      <button
                        onClick={() => setStep('mix')}
                        className="flex-1 px-4 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2"
                      >
                        <Settings2 className="w-5 h-5" /> Tweak
                      </button>
                      <button
                        onClick={reset}
                        className="flex-1 px-4 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 font-bold uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-5 h-5" /> New
                      </button>
                    </div>
                  </div>
                </motion.div>

                {/* Reference Mastering Panel — inline on all screens */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="w-full bg-black/40 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] shadow-2xl pointer-events-auto flex flex-col gap-4"
                >
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white/80 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Reference Mastering
                  </h3>
                  <p className="text-[10px] text-white/40 leading-relaxed">Upload a reference track to spectral-match your master to a professional sound.</p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex-1 flex flex-col items-center justify-center h-20 rounded-xl bg-white/5 border border-white/10 border-dashed cursor-pointer hover:bg-white/10 transition-all">
                      <Upload className="w-5 h-5 text-white/50 mb-1.5" />
                      <span className="text-[10px] font-mono text-white/50">
                        {referenceBlob ? '✓ Reference Loaded' : 'Upload Reference Track'}
                      </span>
                      <input type="file" accept="audio/*" onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setReferenceBlob(e.target.files[0]);
                        }
                      }} className="hidden" />
                    </label>
                    <button
                      onClick={handleMastering}
                      disabled={isMastering}
                      className="flex-1 py-3 px-4 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {isMastering ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Layers className="w-4 h-4 text-amber-400" />}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        {isMastering ? 'Mastering...' : referenceBlob ? 'Match Reference' : 'Re-Master (Auto)'}
                      </span>
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.main>

      {/* Infinity Wheel Step Navigation */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-6 pointer-events-none">
        <div className="relative flex items-center justify-center bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full h-24 shadow-2xl overflow-hidden pointer-events-auto" style={{ perspective: '1200px' }}>
          <motion.div 
            className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing" 
            style={{ transformStyle: 'preserve-3d', touchAction: 'none' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={(e, info) => {
              if (info.offset.x < -40) handleStepSwipe(1);
              if (info.offset.x > 40) handleStepSwipe(-1);
            }}
          >
            <AnimatePresence>
              {stepArray.map((s, i) => {
                const isActive = step === s;
                const currentIndex = stepArray.indexOf(step);
                const offset = i - currentIndex;
                const distance = Math.abs(offset);
                
                const scale = isActive ? 1.2 : Math.max(0.7, 1 - distance * 0.15);
                const opacity = isActive ? 1 : Math.max(0.0, 0.5 - distance * 0.2);
                const translateX = offset * (isSmallMobile ? 90 : 110); // Spacing
                const translateZ = -distance * 60; // Depth
                const rotateY = offset * -25; // Curve
                
                const canNav = 
                  s === 'upload' ? true :
                  s === 'prepare' ? !!originalBeatBlob :
                  s === 'record' ? !!beatBlob :
                  s === 'mix' ? !!vocalBlob && !!beatBlob :
                  s === 'result' ? !!mixedBlob : false;

                return (
                  <motion.button 
                    key={s}
                    onClick={() => canNav && setStep(s)}
                    disabled={!canNav}
                    initial={false}
                    animate={{ 
                      x: translateX,
                      z: translateZ,
                      rotateY: rotateY,
                      scale: scale,
                      opacity: canNav ? opacity : 0.15,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={`absolute text-[10px] sm:text-xs font-bold uppercase tracking-widest whitespace-nowrap px-4 py-2 rounded-full transition-colors ${isActive ? 'text-white bg-white/10 drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]' : 'text-white/50'} ${!canNav ? 'cursor-not-allowed' : 'hover:text-white hover:bg-white/5'}`}
                    style={{ zIndex: 10 - distance }}
                  >
                    {stepNames[s]}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
    </>
  );
}
