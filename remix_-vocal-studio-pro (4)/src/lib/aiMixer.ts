import { GoogleGenAI } from '@google/genai';
import { MixSettings, mixAudio, defaultMixSettings, analyzeAudio, extractExcerpt, AudioMetrics } from './audioUtils';

export interface AILog {
  agent: string;
  message: string;
  details?: string;
}

const PRESET_LIBRARY: { name: string, description: string, settings: Partial<MixSettings> }[] = [
  {
    name: "Modern Crisp Pop",
    description: "Bright, upfront vocals, tight low-end, and wide stereo image. Radio-ready top-40 production: heavy pitch correction, aggressive presence, airy highs.",
    settings: {
      vocalEQ: { lowCutFreq: 140, lowMidFreq: 300, lowMidGain: -3, highMidFreq: 3500, highMidGain: 3.5, highBoostFreq: 8000, highBoostGain: 4 },
      vocalCompressor: { threshold: -28, ratio: 6, attack: 0.003, release: 0.1 },
      reverb: 0.35, echo: 0.2, saturation: 0.1, doubler: 0.5, pitchCorrection: 0.8
    }
  },
  {
    name: "Warm Vintage R&B",
    description: "Smooth, saturated, tube-like warmth. Rolled-off highs, thick low-mids, minimal width. Soulful, intimate — think Anita Baker, modern D'Angelo.",
    settings: {
      vocalEQ: { lowCutFreq: 90, lowMidFreq: 250, lowMidGain: 2, highMidFreq: 2000, highMidGain: -1, highBoostFreq: 6000, highBoostGain: -2 },
      vocalCompressor: { threshold: -20, ratio: 3, attack: 0.015, release: 0.2 },
      reverb: 0.5, echo: 0.05, saturation: 0.8, doubler: 0.1, pitchCorrection: 0.2
    }
  },
  {
    name: "Aggressive Rap",
    description: "In-your-face battle-rap energy. Hard-compressed, zero reverb, gritty saturation, forward presence at 3–4 kHz. Vocal sits on top of the beat; every syllable punches.",
    settings: {
      vocalEQ: { lowCutFreq: 100, lowMidFreq: 250, lowMidGain: 1, highMidFreq: 3000, highMidGain: 4, highBoostFreq: 5000, highBoostGain: 1 },
      vocalCompressor: { threshold: -32, ratio: 8, attack: 0.001, release: 0.05 },
      reverb: 0.05, echo: 0.0, saturation: 0.7, doubler: 0.25, pitchCorrection: 0.9
    }
  },
  {
    name: "Dark Modern Rap",
    description: "Sub-heavy, detuned, moody. Vocal sits slightly behind the beat with tape-style saturation, short plate reverb, restrained highs. Think Travis Scott, Playboi Carti, modern trap atmosphere.",
    settings: {
      vocalEQ: { lowCutFreq: 110, lowMidFreq: 400, lowMidGain: -2, highMidFreq: 2800, highMidGain: 1.5, highBoostFreq: 7000, highBoostGain: 0 },
      vocalCompressor: { threshold: -26, ratio: 5, attack: 0.004, release: 0.12 },
      reverb: 0.25, echo: 0.15, saturation: 0.45, doubler: 0.35, pitchCorrection: 0.7
    }
  },
  {
    name: "Conscious Rap",
    description: "Clear, articulate, natural dynamics. Moderate compression, gentle 2–3 kHz presence for intelligibility, minimal saturation, subtle plate reverb, warm low-mids — the words matter. Think Kendrick Lamar, J. Cole, Mos Def.",
    settings: {
      vocalEQ: { lowCutFreq: 95, lowMidFreq: 300, lowMidGain: 1, highMidFreq: 2500, highMidGain: 2, highBoostFreq: 7500, highBoostGain: 2 },
      vocalCompressor: { threshold: -22, ratio: 3, attack: 0.008, release: 0.15 },
      reverb: 0.35, echo: 0.1, saturation: 0.15, doubler: 0.15, pitchCorrection: 0.3
    }
  },
  {
    name: "Spacious Ambient",
    description: "Washed out, ethereal. Huge reverb tails, distinct echoes, wide and atmospheric. Cinematic, dream-pop, cloud-rap territory.",
    settings: {
      vocalEQ: { lowCutFreq: 180, lowMidFreq: 500, lowMidGain: -4, highMidFreq: 2500, highMidGain: 1, highBoostFreq: 7000, highBoostGain: 5 },
      vocalCompressor: { threshold: -24, ratio: 4, attack: 0.005, release: 0.3 },
      reverb: 0.9, echo: 0.6, saturation: 0.0, doubler: 0.8, pitchCorrection: 0.5
    }
  },
  {
    name: "Acoustic Intimate",
    description: "Dry, close-mic'd, honest. Natural dynamics, gentle warmth, barely any reverb. Folk / singer-songwriter / stripped-down ballad.",
    settings: {
      vocalEQ: { lowCutFreq: 85, lowMidFreq: 350, lowMidGain: -1, highMidFreq: 2200, highMidGain: 1.5, highBoostFreq: 9000, highBoostGain: 2 },
      vocalCompressor: { threshold: -20, ratio: 2.5, attack: 0.02, release: 0.25 },
      reverb: 0.15, echo: 0.0, saturation: 0.1, doubler: 0.05, pitchCorrection: 0.2
    }
  },
  {
    name: "Pop Punk / Rock",
    description: "Driven, mid-forward, slightly compressed with attitude. Gritty saturation, moderate width, short bright reverb. Think modern pop-rock / alt.",
    settings: {
      vocalEQ: { lowCutFreq: 130, lowMidFreq: 400, lowMidGain: -2, highMidFreq: 3000, highMidGain: 3, highBoostFreq: 7000, highBoostGain: 3 },
      vocalCompressor: { threshold: -26, ratio: 5, attack: 0.004, release: 0.12 },
      reverb: 0.3, echo: 0.1, saturation: 0.5, doubler: 0.3, pitchCorrection: 0.5
    }
  },
  {
    name: "Trap / 808",
    description: "Autotune-forward, heavy doubling, melodic hook style. Bright top-end, controlled low-end to leave room for 808s, short slap delay.",
    settings: {
      vocalEQ: { lowCutFreq: 130, lowMidFreq: 350, lowMidGain: -2.5, highMidFreq: 3200, highMidGain: 3.5, highBoostFreq: 8500, highBoostGain: 4 },
      vocalCompressor: { threshold: -30, ratio: 6, attack: 0.002, release: 0.08 },
      reverb: 0.2, echo: 0.3, saturation: 0.2, doubler: 0.6, pitchCorrection: 1.0
    }
  },
  {
    name: "Lo-Fi Bedroom",
    description: "Warm, slightly distorted, vintage — tape-style saturation, high-shelf cut, cozy room reverb. Bedroom-pop / lo-fi hip-hop character.",
    settings: {
      vocalEQ: { lowCutFreq: 100, lowMidFreq: 300, lowMidGain: 1, highMidFreq: 2000, highMidGain: -2, highBoostFreq: 6000, highBoostGain: -3 },
      vocalCompressor: { threshold: -22, ratio: 3, attack: 0.012, release: 0.18 },
      reverb: 0.4, echo: 0.15, saturation: 0.7, doubler: 0.1, pitchCorrection: 0.3
    }
  },
];

function cosineSimilarity(A: number[], B: number[]) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < A.length; i++) {
        dotProduct += A[i] * B[i];
        normA += A[i] * A[i];
        normB += B[i] * B[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function blobToGenerativePart(blob: Blob) {
  return new Promise<{ inlineData: { data: string; mimeType: string } }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve({
          inlineData: {
            data: base64,
            mimeType: blob.type || 'audio/webm'
          }
        });
      } else {
        reject(new Error("Failed to read blob as base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const mixSettingsSchemaProperties = {
  vocalVolume: { type: "NUMBER", description: "0.0 to 2.0" },
  beatVolume: { type: "NUMBER", description: "0.0 to 2.0" },
  backupVolume: { type: "NUMBER", description: "0.0 to 2.0" },
  reverb: { type: "NUMBER", description: "0.0 to 1.0" },
  echo: { type: "NUMBER", description: "0.0 to 1.0" },
  saturation: { type: "NUMBER", description: "0.0 to 1.0 for vocal warmth/distortion" },
  doubler: { type: "NUMBER", description: "0.0 to 1.0 for vocal widening/doubling effect" },
  pitchCorrection: { type: "NUMBER", description: "0.0 to 1.0 for vocal pitch correction intensity" },
  vocalEQ: {
    type: "OBJECT",
    properties: {
      lowCutFreq: { type: "NUMBER", description: "80 to 250 Hz" },
      lowMidFreq: { type: "NUMBER", description: "250 to 800 Hz" },
      lowMidGain: { type: "NUMBER", description: "-6 to 3 dB" },
      highMidFreq: { type: "NUMBER", description: "1000 to 4000 Hz" },
      highMidGain: { type: "NUMBER", description: "-4 to 4 dB" },
      highBoostFreq: { type: "NUMBER", description: "5000 to 10000 Hz" },
      highBoostGain: { type: "NUMBER", description: "0 to 6 dB" }
    }
  },
  vocalCompressor: {
    type: "OBJECT",
    properties: {
      threshold: { type: "NUMBER", description: "-40 to -10 dB" },
      ratio: { type: "NUMBER", description: "2 to 8" },
      attack: { type: "NUMBER", description: "0.001 to 0.05 seconds" },
      release: { type: "NUMBER", description: "0.05 to 0.3 seconds" }
    }
  },
  masterCompressor: {
    type: "OBJECT",
    description: "Master bus glue compressor. Gentle ratios, slow attacks.",
    properties: {
      threshold: { type: "NUMBER", description: "-20 to -6 dB" },
      ratio: { type: "NUMBER", description: "1.5 to 4" },
      attack: { type: "NUMBER", description: "0.01 to 0.05 seconds" },
      release: { type: "NUMBER", description: "0.1 to 0.4 seconds" }
    }
  }
};

// Blind-A/B style clamps so the LLM can't blow out the speakers or mute the mix
// if it hallucinates an out-of-range value.
function clampSettings(s: MixSettings): MixSettings {
  const clamp = (v: number, lo: number, hi: number, fallback: number) => {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  };
  const d = defaultMixSettings;
  return {
    vocalVolume: clamp(s.vocalVolume, 0, 2, d.vocalVolume),
    beatVolume: clamp(s.beatVolume, 0, 2, d.beatVolume),
    backupVolume: clamp(s.backupVolume, 0, 2, d.backupVolume),
    reverb: clamp(s.reverb, 0, 1, d.reverb),
    echo: clamp(s.echo, 0, 1, d.echo),
    saturation: clamp(s.saturation, 0, 1, d.saturation),
    doubler: clamp(s.doubler, 0, 1, d.doubler),
    pitchCorrection: clamp(s.pitchCorrection, 0, 1, d.pitchCorrection),
    vocalEQ: {
      lowCutFreq: clamp(s.vocalEQ.lowCutFreq, 40, 400, d.vocalEQ.lowCutFreq),
      lowMidFreq: clamp(s.vocalEQ.lowMidFreq, 150, 1200, d.vocalEQ.lowMidFreq),
      lowMidGain: clamp(s.vocalEQ.lowMidGain, -8, 6, d.vocalEQ.lowMidGain),
      highMidFreq: clamp(s.vocalEQ.highMidFreq, 800, 6000, d.vocalEQ.highMidFreq),
      highMidGain: clamp(s.vocalEQ.highMidGain, -6, 6, d.vocalEQ.highMidGain),
      highBoostFreq: clamp(s.vocalEQ.highBoostFreq, 3000, 14000, d.vocalEQ.highBoostFreq),
      highBoostGain: clamp(s.vocalEQ.highBoostGain, -4, 8, d.vocalEQ.highBoostGain),
    },
    vocalCompressor: {
      threshold: clamp(s.vocalCompressor.threshold, -48, -6, d.vocalCompressor.threshold),
      ratio: clamp(s.vocalCompressor.ratio, 1.5, 10, d.vocalCompressor.ratio),
      attack: clamp(s.vocalCompressor.attack, 0.0005, 0.1, d.vocalCompressor.attack),
      release: clamp(s.vocalCompressor.release, 0.02, 0.5, d.vocalCompressor.release),
    },
    masterCompressor: {
      threshold: clamp(s.masterCompressor.threshold, -24, -3, d.masterCompressor.threshold),
      ratio: clamp(s.masterCompressor.ratio, 1.2, 6, d.masterCompressor.ratio),
      attack: clamp(s.masterCompressor.attack, 0.003, 0.1, d.masterCompressor.attack),
      release: clamp(s.masterCompressor.release, 0.05, 0.6, d.masterCompressor.release),
    },
  };
}

function mergeSettings(current: MixSettings, incoming: any): MixSettings {
  const merged: MixSettings = {
    ...current,
    ...incoming,
    vocalEQ: { ...current.vocalEQ, ...(incoming?.vocalEQ || {}) },
    vocalCompressor: { ...current.vocalCompressor, ...(incoming?.vocalCompressor || {}) },
    masterCompressor: { ...current.masterCompressor, ...(incoming?.masterCompressor || {}) },
  };
  return clampSettings(merged);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function formatMetrics(label: string, m: AudioMetrics): string {
  return `${label}: peak ${m.peakDb.toFixed(1)} dB, RMS ${m.rmsDb.toFixed(1)} dB, crest ${m.crestFactorDb.toFixed(1)} dB, centroid ${Math.round(m.spectralCentroidHz)} Hz, low-mid(200-500Hz) ${m.lowMidEnergyDb.toFixed(1)} dB, sibilance(5-9kHz) ${m.sibilanceEnergyDb.toFixed(1)} dB`;
}

export async function runAIAgentNetwork(
  vocalBlob: Blob,
  beatBlob: Blob,
  backupVocalBlob: Blob | null,
  iterations: number,
  onProgress: (log: AILog) => void,
  customApiKey?: string,
  referenceBlob?: Blob | null
): Promise<{ settings: MixSettings, reasoning: string }> {
  
  let apiKeyToUse = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKeyToUse && (window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
      if (await (window as any).aistudio.hasSelectedApiKey()) {
          // Native proxy will intercept, so we can pass a dummy key to bypass SDK checks
          apiKeyToUse = "native-studio-key";
      }
  }

  if (!apiKeyToUse) {
    throw new Error("API Key is missing. Please select an API key.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
  const textModel = 'gemini-3-flash-preview';
  const embeddingModel = 'gemini-embedding-2-preview';

  try {
    // --- Phase 1: Vector Pre-computation (Preset Library) ---
    onProgress({
      agent: 'Vector Engine',
      message: 'Initializing semantic spaces...',
      details: 'Embedding preset profiles using gemini-embedding-2-preview.'
    });

    const presetVectors = await Promise.all(PRESET_LIBRARY.map(async (preset) => {
      const text = `${preset.name}: ${preset.description}`;
      const result = await ai.models.embedContent({
        model: embeddingModel,
        contents: text,
      });
      if (!result.embeddings || result.embeddings.length === 0 || !result.embeddings[0].values) {
        throw new Error(`Failed to generate preset embeddings for: ${preset.name}`);
      }
      return {
        preset: preset,
        vector: result.embeddings[0].values
      };
    }));

    // --- Phase 2: Vocal-Profile Describer (text-modal match) ---
    onProgress({
      agent: 'Acoustic Analyst',
      message: 'Listening to the vocal and beat to describe their character...',
      details: 'Describer agent produces a text profile; embedding it keeps cosine-match same-modality.'
    });

    const vocalExcerpt = await extractExcerpt(vocalBlob, 20);
    const beatExcerptShort = await extractExcerpt(beatBlob, 20);
    const vocalExcerptPart = await blobToGenerativePart(vocalExcerpt);
    const beatExcerptPart = await blobToGenerativePart(beatExcerptShort);

    const vocalMetrics = await analyzeAudio(vocalBlob);
    const beatMetrics = await analyzeAudio(beatBlob);

    const describerPrompt = `You are a Vocal-Profile Describer. You will hear two audio clips: VOCAL and BEAT.
Write a concise natural-language description (<=120 words) covering: genre/style, energy level, tempo feel, vocal tone and delivery (aggressive/smooth/melodic/spoken), articulation, production style (raw/polished/lo-fi), and how the vocal fits the beat.
Measured features for context:
${formatMetrics('VOCAL', vocalMetrics)}
${formatMetrics('BEAT', beatMetrics)}
Respond with only the description paragraph — no headers, no lists.`;

    const describerResponse = await ai.models.generateContent({
      model: textModel,
      contents: [
        { text: describerPrompt },
        { text: 'VOCAL follows:' },
        vocalExcerptPart,
        { text: 'BEAT follows:' },
        beatExcerptPart,
      ],
    });

    const vocalDescription = (describerResponse.text || '').trim() ||
      `A vocal track with RMS ${vocalMetrics.rmsDb.toFixed(1)} dB and centroid ${Math.round(vocalMetrics.spectralCentroidHz)} Hz over a beat with centroid ${Math.round(beatMetrics.spectralCentroidHz)} Hz.`;

    onProgress({
      agent: 'Acoustic Analyst',
      message: 'Vocal profile description generated.',
      details: vocalDescription,
    });

    const userEmbedResult = await ai.models.embedContent({
      model: embeddingModel,
      contents: vocalDescription,
    });
    if (!userEmbedResult.embeddings || !userEmbedResult.embeddings[0]?.values) {
      throw new Error('Failed to embed vocal-profile description.');
    }
    const userVector = userEmbedResult.embeddings[0].values;

    // --- Phase 3: Mathematical Similarity Match ---
    onProgress({
      agent: 'Vector Engine',
      message: 'Running multi-dimensional pattern matching...',
      details: 'Calculating cosine similarity between audio fingerprint and preset semantic spaces.'
    });

    let bestMatch = presetVectors[0];
    let maxSimilarity = -Infinity;

    for (const pv of presetVectors) {
      if(pv.vector && userVector) {
        const similarity = cosineSimilarity(userVector, pv.vector);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestMatch = pv;
        }
      }
    }

    onProgress({
      agent: 'Acoustic Analyst',
      message: `Acoustic Match Found: ${bestMatch.preset.name}`,
      details: `Similarity Score: ${(maxSimilarity * 100).toFixed(2)}%\nDescription: ${bestMatch.preset.description}`
    });

    let currentSettings: MixSettings = {
      ...defaultMixSettings, // Base from audioUtils
      ...bestMatch.preset.settings // Override with preset
    };

    await delay(1000);

    // Beat excerpt reused each pass — small payload, big context win.
    const beatExcerptPartForMix = beatExcerptPart;

    // --- Phase 4: Mix Engineer listens & adjusts (adaptive loop + critic) ---
    const maxPasses = Math.max(iterations, 3);
    let lastReasoning = '';
    let previousExcerptPart: any = null;
    let previousSettings: MixSettings = currentSettings;

    for (let i = 2; i <= maxPasses; i++) {
        onProgress({
          agent: `Mix Engineer (Pass ${i})`,
          message: `Rendering mix excerpt to listen to the current state...`,
          details: `Baseline: "${bestMatch.preset.name}".`
        });

        const currentMixBlob = await mixAudio(vocalBlob, beatBlob, backupVocalBlob, currentSettings);
        const currentExcerpt = await extractExcerpt(currentMixBlob, 20);
        const currentMixPart = await blobToGenerativePart(currentExcerpt);
        const mixMetrics = await analyzeAudio(currentMixBlob);

        const reviewSchema = {
          type: "OBJECT",
          properties: {
            settings: { type: "OBJECT", properties: mixSettingsSchemaProperties },
            reasoning: { type: "STRING", description: "What you heard and why you made each adjustment. Reference specific issues (muddiness around X Hz, sibilance, vocal burying behind beat, etc.)." }
          }
        };

        const reviewPrompt = `You are a Mix Engineer with working ears. You receive two 20s audio excerpts: RENDERED_MIX (current WIP) and RAW_BEAT (dry instrumental, for balance reference).

Measured metrics:
${formatMetrics('RENDERED_MIX', mixMetrics)}
${formatMetrics('RAW_BEAT', beatMetrics)}
Vocal profile: ${vocalDescription}

Diagnose concrete problems you HEAR:
- Vocal buried or too loud vs beat?
- Muddiness (200-500 Hz), boxiness (300-600 Hz), harshness (2-5 kHz)?
- Low end fighting kick/bass?
- Reverb/delay swamping intelligibility?
- Compressor pumping?

Preset baseline: "${bestMatch.preset.name}" - ${bestMatch.preset.description}.
Current settings JSON:
${JSON.stringify(currentSettings)}

Return MICRO-adjustments within ~15% of current values. Describe what you HEARD before what you changed.`;

        const reviewResponse = await ai.models.generateContent({
          model: textModel,
          contents: [
            { text: reviewPrompt },
            { text: 'RENDERED_MIX follows:' },
            currentMixPart,
            { text: 'RAW_BEAT follows:' },
            beatExcerptPartForMix,
          ],
          config: { responseMimeType: "application/json", responseSchema: reviewSchema as any }
        });

        const updatedMix = JSON.parse(reviewResponse.text || "{}");
        const candidateSettings = mergeSettings(currentSettings, updatedMix.settings);
        lastReasoning = updatedMix.reasoning || lastReasoning;

        // Render the candidate and run Critic A/B vs the previous pass.
        const candidateBlob = await mixAudio(vocalBlob, beatBlob, backupVocalBlob, candidateSettings);
        const candidateExcerpt = await extractExcerpt(candidateBlob, 20);
        const candidatePart = await blobToGenerativePart(candidateExcerpt);

        if (previousExcerptPart) {
          const criticSchema = {
            type: "OBJECT",
            properties: {
              winner: { type: "STRING", description: "Either 'old' or 'new'." },
              converged: { type: "BOOLEAN", description: "True if the new pass is effectively the same quality as the old — stop iterating." },
              reason: { type: "STRING" }
            }
          };
          const criticPrompt = `You are the A/B Critic. You hear OLD_MIX and NEW_MIX (both 20s excerpts of the same song at different mix settings). Pick the better one on overall balance, clarity, and musicality. Be honest — if NEW is worse, say 'old'. If they're effectively tied, pick 'old' and set converged=true to stop the loop.`;
          const criticResp = await ai.models.generateContent({
            model: textModel,
            contents: [
              { text: criticPrompt },
              { text: 'OLD_MIX follows:' }, previousExcerptPart,
              { text: 'NEW_MIX follows:' }, candidatePart,
            ],
            config: { responseMimeType: "application/json", responseSchema: criticSchema as any }
          });
          const critic = JSON.parse(criticResp.text || '{}');
          if (critic.winner === 'new') {
            previousSettings = currentSettings;
            currentSettings = candidateSettings;
            previousExcerptPart = candidatePart;
            onProgress({ agent: `Mix Engineer (Pass ${i})`, message: 'Critic accepted the new pass.', details: `${updatedMix.reasoning || ''}\nCritic: ${critic.reason || ''}` });
            if (critic.converged) break;
          } else {
            onProgress({ agent: `Mix Engineer (Pass ${i})`, message: 'Critic rejected this pass — reverting.', details: `Critic: ${critic.reason || ''}` });
            currentSettings = previousSettings;
            break;
          }
        } else {
          previousSettings = currentSettings;
          currentSettings = candidateSettings;
          previousExcerptPart = candidatePart;
          onProgress({ agent: `Mix Engineer (Pass ${i})`, message: 'First pass accepted.', details: updatedMix.reasoning });
        }

        await delay(800);
    }

    // --- Phase 5: Mastering Engineer (reference-aware) ---
    onProgress({
      agent: 'Mastering Engineer',
      message: 'Rendering the final mix excerpt for mastering review...'
    });

    const finalMixBlob = await mixAudio(vocalBlob, beatBlob, backupVocalBlob, currentSettings);
    const finalMixExcerpt = await extractExcerpt(finalMixBlob, 20);
    const finalMixPart = await blobToGenerativePart(finalMixExcerpt);
    const finalMetrics = await analyzeAudio(finalMixBlob);

    let referencePart: any = null;
    let referenceMetricsLine = '';
    if (referenceBlob) {
      try {
        const refExcerpt = await extractExcerpt(referenceBlob, 20);
        referencePart = await blobToGenerativePart(refExcerpt);
        const refMetrics = await analyzeAudio(referenceBlob);
        referenceMetricsLine = formatMetrics('REFERENCE_TRACK', refMetrics);
      } catch (e) {
        console.warn('Reference excerpt failed, continuing without it:', e);
      }
    }

    const masterSchema = {
      type: "OBJECT",
      properties: {
        masterCompressor: mixSettingsSchemaProperties.masterCompressor,
        masteringNotes: { type: "STRING" },
        approved: { type: "BOOLEAN" }
      }
    };

    const masterPrompt = `You are the Mastering Engineer with working ears. Listen to FINAL_MIX${referencePart ? ' and REFERENCE_TRACK' : ''} and set master-bus glue-compressor values.

Measured:
${formatMetrics('FINAL_MIX', finalMetrics)}
${referenceMetricsLine}

Guidelines: threshold -20 to -6 dB, ratio 1.5-3 (gentle glue), attack 20-50 ms, release 100-300 ms.
${referencePart ? 'Match the tonal balance and perceived loudness of REFERENCE_TRACK without killing the mix character.' : ''}
Current master compressor: ${JSON.stringify(currentSettings.masterCompressor)}.
Describe what you heard first, then return updated masterCompressor values.`;

    const masterContents: any[] = [
      { text: masterPrompt },
      { text: 'FINAL_MIX follows:' }, finalMixPart,
    ];
    if (referencePart) {
      masterContents.push({ text: 'REFERENCE_TRACK follows:' }, referencePart);
    }

    const masterResponse = await ai.models.generateContent({
      model: textModel,
      contents: masterContents,
      config: { responseMimeType: "application/json", responseSchema: masterSchema as any }
    });

    const finalResult = JSON.parse(masterResponse.text || "{}");
    if (finalResult.masterCompressor) {
      currentSettings = mergeSettings(currentSettings, { masterCompressor: finalResult.masterCompressor });
    }

    onProgress({
      agent: 'Mastering Engineer',
      message: finalResult.approved === false ? 'Mastering flagged issues — review the notes.' : 'Mastering approved.',
      details: finalResult.masteringNotes
    });

    return {
      settings: currentSettings,
      reasoning: `Profile: ${vocalDescription}\nMatch: ${bestMatch.preset.name}\n${lastReasoning}\n${finalResult.masteringNotes || ""}`
    };

  } catch (error: any) {
    console.error("AI Agent Network Error:", error);
    
    const errorMessage = error?.message || '';
    if (error?.status === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      throw new Error("API Quota Exceeded (429). The Gemini API rate limit was reached. Please wait a minute before trying again.");
    }
    
    throw error;
  }
}
