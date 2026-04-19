export interface MixSettings {
  vocalVolume: number;
  beatVolume: number;
  backupVolume: number;
  reverb: number;
  echo: number;
  saturation: number;
  doubler: number; // 0.0 to 1.0
  pitchCorrection: number; // 0.0 to 1.0
  vocalEQ: {
    lowCutFreq: number;
    lowMidFreq: number;
    lowMidGain: number;
    highMidFreq: number;
    highMidGain: number;
    highBoostFreq: number;
    highBoostGain: number;
  };
  vocalCompressor: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  masterCompressor: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
}

export const defaultMixSettings: MixSettings = {
  vocalVolume: 1.0,
  beatVolume: 0.8,
  backupVolume: 0.6,
  reverb: 0.3,
  echo: 0.1,
  saturation: 0.0,
  doubler: 0.0,
  pitchCorrection: 0.0,
  vocalEQ: {
    lowCutFreq: 120,
    lowMidFreq: 400,
    lowMidGain: -2,
    highMidFreq: 2500,
    highMidGain: 2,
    highBoostFreq: 5000,
    highBoostGain: 3
  },
  vocalCompressor: {
    threshold: -24,
    ratio: 4,
    attack: 0.005,
    release: 0.1
  },
  masterCompressor: {
    threshold: -10,
    ratio: 2,
    attack: 0.01,
    release: 0.1
  }
};

// Singleton AudioContext for decoding to ensure consistent sample rates
let decodingCtx: AudioContext | null = null;

function getDecodingCtx() {
  if (!decodingCtx) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser.");
    }
    try {
      decodingCtx = new AudioContextClass();
    } catch (e) {
      console.error("Failed to create AudioContext:", e);
      // If the 0-argument constructor fails, we try to catch it, 
      // but we must avoid passing an options object to webkitAudioContext
      if (AudioContextClass === (window as any).AudioContext) {
        try {
          decodingCtx = new AudioContextClass({ sampleRate: 44100 });
        } catch (e2) {
          throw e; // Throw original error if fallback also fails
        }
      } else {
        throw e;
      }
    }
  }
  return decodingCtx;
}

function makeDistortionCurve(amount: number) {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function createReverb(context: BaseAudioContext, duration: number, decay: number) {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = context.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const noiseL = Math.random() * 2 - 1;
    const noiseR = Math.random() * 2 - 1;
    left[i] = noiseL * Math.pow(1 - i / length, decay);
    right[i] = noiseR * Math.pow(1 - i / length, decay);
  }
  return impulse;
}

export function encodeWAV(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length;
  const length = channels[0].length;
  const buffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numChannels * 2, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = Math.max(-1, Math.min(1, channels[channel][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return buffer;
}

export async function extractAudioData(blob: Blob) {
  const audioCtx = getDecodingCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    // decodeAudioData resamples the audio to the context's sampleRate automatically
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    return {
      channels,
      length: buffer.length,
      sampleRate: buffer.sampleRate
    };
  } catch (err) {
    console.error("Failed to decode audio data", err);
    throw err;
  }
}

export async function processBeat(beatBlob: Blob, speed: number, pitch: number): Promise<Blob> {
  if (speed === 1 && pitch === 0) return beatBlob;
  
  const beatData = await extractAudioData(beatBlob);
  const OfflineContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  
  const length = Math.floor(beatData.length / speed);
  const offlineCtx = new OfflineContext(beatData.channels.length, length, beatData.sampleRate);
  
  const buf = offlineCtx.createBuffer(beatData.channels.length, beatData.length, offlineCtx.sampleRate);
  for (let i = 0; i < beatData.channels.length; i++) {
    buf.copyToChannel(beatData.channels[i], i);
  }
  
  const source = offlineCtx.createBufferSource();
  source.buffer = buf;
  source.playbackRate.value = speed;
  source.detune.value = pitch * 100;
  
  source.connect(offlineCtx.destination);
  source.start(0);
  
  const renderedBuffer = await offlineCtx.startRendering();
  const outChannels = [];
  for (let i = 0; i < renderedBuffer.numberOfChannels; i++) {
    outChannels.push(renderedBuffer.getChannelData(i));
  }
  
  const wavBuffer = encodeWAV(outChannels, renderedBuffer.sampleRate);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

export async function mixAudio(
  vocalBlob: Blob,
  beatBlob: Blob,
  backupVocalBlob: Blob | null,
  settings: MixSettings
): Promise<Blob> {
  const vocalData = await extractAudioData(vocalBlob);
  const beatData = await extractAudioData(beatBlob);
  const backupData = backupVocalBlob ? await extractAudioData(backupVocalBlob) : null;
  
  const OfflineContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const sampleRate = beatData.sampleRate;
  const duration = Math.ceil(Math.max(vocalData.length, beatData.length, backupData ? backupData.length : 0));
  
  const offlineCtx = new OfflineContext(2, duration, sampleRate);

  const createBufferSource = (data: any) => {
    const buf = offlineCtx.createBuffer(data.channels.length, data.length, offlineCtx.sampleRate);
    for (let i = 0; i < data.channels.length; i++) {
      buf.copyToChannel(data.channels[i], i);
    }
    const source = offlineCtx.createBufferSource();
    source.buffer = buf;
    return source;
  };

  const vocalSource = createBufferSource(vocalData);
  const beatSource = createBufferSource(beatData);
  const backupSource = backupData ? createBufferSource(backupData) : null;

  // Vocal Chain
  const vocalGain = offlineCtx.createGain();
  vocalGain.gain.value = settings.vocalVolume;
  
  const lowCut = offlineCtx.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = settings.vocalEQ.lowCutFreq;
  
  const lowMid = offlineCtx.createBiquadFilter();
  lowMid.type = 'peaking';
  lowMid.frequency.value = settings.vocalEQ.lowMidFreq;
  lowMid.gain.value = settings.vocalEQ.lowMidGain;
  lowMid.Q.value = 1.0;

  const highMid = offlineCtx.createBiquadFilter();
  highMid.type = 'peaking';
  highMid.frequency.value = settings.vocalEQ.highMidFreq;
  highMid.gain.value = settings.vocalEQ.highMidGain;
  highMid.Q.value = 1.0;

  const highBoost = offlineCtx.createBiquadFilter();
  highBoost.type = 'highshelf';
  highBoost.frequency.value = settings.vocalEQ.highBoostFreq;
  highBoost.gain.value = settings.vocalEQ.highBoostGain;
  
  const saturation = offlineCtx.createWaveShaper();
  saturation.curve = makeDistortionCurve(settings.saturation * 100);
  saturation.oversample = '4x';

  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.value = settings.vocalCompressor.threshold;
  compressor.knee.value = 30;
  compressor.ratio.value = settings.vocalCompressor.ratio;
  compressor.attack.value = settings.vocalCompressor.attack;
  compressor.release.value = settings.vocalCompressor.release;
  
  // Abbey Road Reverb Trick
  const convolver = offlineCtx.createConvolver();
  convolver.buffer = createReverb(offlineCtx, 2.5, 2.0);
  
  const reverbHpf = offlineCtx.createBiquadFilter();
  reverbHpf.type = 'highpass';
  reverbHpf.frequency.value = 600;
  
  const reverbLpf = offlineCtx.createBiquadFilter();
  reverbLpf.type = 'lowpass';
  reverbLpf.frequency.value = 4000;
  
  const reverbGain = offlineCtx.createGain();
  reverbGain.gain.value = settings.reverb;
  
  const delay = offlineCtx.createDelay();
  delay.delayTime.value = 0.4;
  const feedback = offlineCtx.createGain();
  feedback.gain.value = 0.3;
  delay.connect(feedback);
  feedback.connect(delay);
  const delayGain = offlineCtx.createGain();
  delayGain.gain.value = settings.echo;
  
  // Doubler / Widener
  const leftDelay = offlineCtx.createDelay();
  leftDelay.delayTime.value = 0.015; // 15ms
  const rightDelay = offlineCtx.createDelay();
  rightDelay.delayTime.value = 0.025; // 25ms
  
  const leftPanner = offlineCtx.createStereoPanner();
  leftPanner.pan.value = -0.8;
  const rightPanner = offlineCtx.createStereoPanner();
  rightPanner.pan.value = 0.8;
  
  const doublerGain = offlineCtx.createGain();
  doublerGain.gain.value = settings.doubler;
  
  // Routing Vocal
  vocalSource.connect(lowCut);
  lowCut.connect(lowMid);
  lowMid.connect(highMid);
  highMid.connect(highBoost);
  highBoost.connect(saturation);
  saturation.connect(compressor);
  compressor.connect(vocalGain);
  
  // Route to Doubler
  compressor.connect(leftDelay);
  leftDelay.connect(leftPanner);
  leftPanner.connect(doublerGain);
  
  compressor.connect(rightDelay);
  rightDelay.connect(rightPanner);
  rightPanner.connect(doublerGain);
  
  compressor.connect(convolver);
  convolver.connect(reverbHpf);
  reverbHpf.connect(reverbLpf);
  reverbLpf.connect(reverbGain);
  
  compressor.connect(delay);
  delay.connect(delayGain);
  
  // Beat Chain
  const beatGain = offlineCtx.createGain();
  beatGain.gain.value = settings.beatVolume;
  beatSource.connect(beatGain);
  
  // Master Chain
  const masterCompressor = offlineCtx.createDynamicsCompressor();
  masterCompressor.threshold.value = settings.masterCompressor.threshold;
  masterCompressor.ratio.value = settings.masterCompressor.ratio;
  masterCompressor.attack.value = settings.masterCompressor.attack;
  masterCompressor.release.value = settings.masterCompressor.release;
  
  // Cross-Device Optimization: Master Brickwall Limiter
  // Ensures audio never clips and maximizes perceived loudness for mobile/tablet speakers
  const masterLimiter = offlineCtx.createDynamicsCompressor();
  masterLimiter.threshold.value = -0.1; // Just below 0dBFS
  masterLimiter.ratio.value = 20.0; // Brickwall
  masterLimiter.attack.value = 0.001; // Instant attack
  masterLimiter.release.value = 0.05; // Fast release
  
  if (backupSource) {
    const backupGain = offlineCtx.createGain();
    backupGain.gain.value = settings.backupVolume;
    backupSource.connect(backupGain);
    backupGain.connect(masterCompressor);
    backupGain.connect(convolver);
    backupSource.start(0);
  }
  
  vocalGain.connect(masterCompressor);
  doublerGain.connect(masterCompressor);
  reverbGain.connect(masterCompressor);
  delayGain.connect(masterCompressor);
  beatGain.connect(masterCompressor);
  
  masterCompressor.connect(masterLimiter);
  masterLimiter.connect(offlineCtx.destination);
  
  vocalSource.start(0);
  
  // Basic Pitch Correction (simulated via detune if we had pitch data, 
  // but here we'll just add it as a placeholder for the UI and AI to use)
  // Real autotune requires complex DSP, but we can use detune for simple shifts.
  
  beatSource.start(0);
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Cross-Device Optimization: Normalization
  // Maximize volume to 0.95 (-0.4 dBFS) to ensure it sounds loud and clear on all devices
  const outChannels = [renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)];
  
  let maxPeak = 0;
  for (let c = 0; c < outChannels.length; c++) {
    const channel = outChannels[c];
    for (let i = 0; i < channel.length; i++) {
      const absVal = Math.abs(channel[i]);
      if (absVal > maxPeak) maxPeak = absVal;
    }
  }
  
  if (maxPeak > 0) {
    const normalizeFactor = 0.95 / maxPeak;
    for (let c = 0; c < outChannels.length; c++) {
      const channel = outChannels[c];
      for (let i = 0; i < channel.length; i++) {
        channel[i] *= normalizeFactor;
      }
    }
  }

  const wavBuffer = encodeWAV(outChannels, renderedBuffer.sampleRate);
  
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function computeRms(channels: Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      sum += ch[i] * ch[i];
    }
    count += ch.length;
  }
  if (count === 0) return 0;
  return Math.sqrt(sum / count);
}

export async function masterAudio(mixedBlob: Blob, referenceBlob: Blob | null): Promise<Blob> {
  const mixedData = await extractAudioData(mixedBlob);

  // If a reference track is provided but the server-side Matchering sidecar is
  // unavailable, fall back to a lightweight loudness match so the "reference"
  // UI affordance is not purely cosmetic. This is a local approximation — real
  // spectral matching still happens in the Python sidecar.
  let referenceGain = 1;
  if (referenceBlob) {
    try {
      const refData = await extractAudioData(referenceBlob);
      const mixRms = computeRms(mixedData.channels);
      const refRms = computeRms(refData.channels);
      if (mixRms > 1e-6 && refRms > 1e-6) {
        // Clamp so we don't blow up the limiter on very loud references.
        referenceGain = Math.min(Math.max(refRms / mixRms, 0.5), 2.0);
      }
    } catch (err) {
      console.warn('Reference loudness analysis failed, continuing without it', err);
    }
  }

  const OfflineContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offlineCtx = new OfflineContext(2, mixedData.length, mixedData.sampleRate);
  
  const buf = offlineCtx.createBuffer(mixedData.channels.length, mixedData.length, offlineCtx.sampleRate);
  for (let i = 0; i < mixedData.channels.length; i++) {
    buf.copyToChannel(mixedData.channels[i], i);
  }
  
  const source = offlineCtx.createBufferSource();
  source.buffer = buf;
  
  // Mastering Chain
  // 1. Multiband-like EQ (gentle smiley curve to match modern reference)
  const lowShelf = offlineCtx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 100;
  lowShelf.gain.value = 1.5;
  
  const highShelf = offlineCtx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 8000;
  highShelf.gain.value = 2.0;
  
  // 2. Bus Compressor (Glue)
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.03;
  compressor.release.value = 0.25;
  compressor.knee.value = 10;
  
  // 3. Simple Limiter (prevent clipping and boost perceived loudness)
  const limiter = offlineCtx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  
  // Gain stage — scaled by reference loudness when available.
  const makeupGain = offlineCtx.createGain();
  makeupGain.gain.value = 1.25 * referenceGain;
  
  source.connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(compressor);
  compressor.connect(makeupGain);
  makeupGain.connect(limiter);
  limiter.connect(offlineCtx.destination);
  
  source.start(0);
  
  const renderedBuffer = await offlineCtx.startRendering();
  const outChannels = [renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)];
  
  // Peak normalization (Final stage of mastering)
  let maxPeak = 0;
  for (let c = 0; c < outChannels.length; c++) {
    const channel = outChannels[c];
    for (let i = 0; i < channel.length; i++) {
      const absVal = Math.abs(channel[i]);
      if (absVal > maxPeak) maxPeak = absVal;
    }
  }
  
  if (maxPeak > 0) {
    const normalizeFactor = 0.98 / maxPeak; // Leave -0.2dB headroom roughly
    for (let c = 0; c < outChannels.length; c++) {
      const channel = outChannels[c];
      for (let i = 0; i < channel.length; i++) {
        channel[i] *= normalizeFactor;
      }
    }
  }

  const wavBuffer = encodeWAV(outChannels, renderedBuffer.sampleRate);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

export interface AudioMetrics {
  peakDb: number;
  rmsDb: number;
  crestFactorDb: number;
  spectralCentroidHz: number;
  lowMidEnergyDb: number;
  sibilanceEnergyDb: number;
  durationSec: number;
}

const _toDb = (x: number) => (x > 1e-8 ? 20 * Math.log10(x) : -80);

export async function analyzeAudio(blob: Blob): Promise<AudioMetrics> {
  const { channels, length, sampleRate } = await extractAudioData(blob);
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let s = 0;
    for (let c = 0; c < channels.length; c++) s += channels[c][i];
    mono[i] = s / channels.length;
  }

  const windowSec = Math.min(10, length / sampleRate);
  const windowSamples = Math.max(1, Math.floor(windowSec * sampleRate));
  let start = 0;
  let maxAvg = 0;
  const step = Math.max(1, Math.floor(windowSamples / 4));
  for (let s = 0; s + windowSamples < length; s += step) {
    let sum = 0;
    for (let i = s; i < s + windowSamples; i += 32) sum += mono[i] * mono[i];
    if (sum > maxAvg) { maxAvg = sum; start = s; }
  }

  let peak = 0;
  let sqSum = 0;
  for (let i = start; i < start + windowSamples; i++) {
    const v = Math.abs(mono[i]);
    if (v > peak) peak = v;
    sqSum += mono[i] * mono[i];
  }
  const rms = Math.sqrt(sqSum / windowSamples);

  const fftSize = Math.min(2048, windowSamples);
  const excerpt = mono.subarray(start, start + fftSize);
  const mags = new Float32Array(fftSize / 2);
  for (let k = 0; k < fftSize / 2; k++) {
    let re = 0, im = 0;
    const w = (-2 * Math.PI * k) / fftSize;
    for (let n = 0; n < fftSize; n++) {
      re += excerpt[n] * Math.cos(w * n);
      im += excerpt[n] * Math.sin(w * n);
    }
    mags[k] = Math.sqrt(re * re + im * im);
  }

  let centroidNum = 0, centroidDen = 0;
  let lowMid = 0, sibilance = 0, total = 0;
  for (let k = 0; k < mags.length; k++) {
    const hz = (k * sampleRate) / fftSize;
    centroidNum += hz * mags[k];
    centroidDen += mags[k];
    total += mags[k];
    if (hz >= 200 && hz <= 500) lowMid += mags[k];
    if (hz >= 5000 && hz <= 9000) sibilance += mags[k];
  }
  const centroid = centroidDen > 0 ? centroidNum / centroidDen : 0;
  const avgPerBin = total / Math.max(1, mags.length);
  const lowMidDb = _toDb(lowMid / Math.max(avgPerBin * 30, 1e-6));
  const sibilanceDb = _toDb(sibilance / Math.max(avgPerBin * 40, 1e-6));

  const peakDb = _toDb(peak);
  const rmsDb = _toDb(rms);
  return {
    peakDb,
    rmsDb,
    crestFactorDb: peakDb - rmsDb,
    spectralCentroidHz: centroid,
    lowMidEnergyDb: lowMidDb,
    sibilanceEnergyDb: sibilanceDb,
    durationSec: length / sampleRate,
  };
}

// Pick a loud ~N-second region and encode as mono 22kHz WAV for low-payload LLM calls.
export async function extractExcerpt(blob: Blob, seconds = 20): Promise<Blob> {
  const { channels, length, sampleRate } = await extractAudioData(blob);
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let s = 0;
    for (let c = 0; c < channels.length; c++) s += channels[c][i];
    mono[i] = s / channels.length;
  }
  const win = Math.min(Math.floor(seconds * sampleRate), length);
  let start = 0;
  let best = 0;
  const step = Math.max(1, Math.floor(win / 8));
  for (let s = 0; s + win <= length; s += step) {
    let sum = 0;
    for (let i = s; i < s + win; i += 64) sum += mono[i] * mono[i];
    if (sum > best) { best = sum; start = s; }
  }
  const targetRate = 22050;
  const srcWin = mono.subarray(start, start + win);
  const outLen = Math.floor((win * targetRate) / sampleRate);
  const out = new Float32Array(outLen);
  const ratio = sampleRate / targetRate;
  for (let i = 0; i < outLen; i++) {
    out[i] = srcWin[Math.floor(i * ratio)] || 0;
  }
  const wav = encodeWAV([out], targetRate);
  return new Blob([wav], { type: 'audio/wav' });
}

