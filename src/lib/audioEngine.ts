/**
 * Pure TypeScript/PCM audio analysis, Jawari 4-string Tanpura synthesis,
 * per-verse mixing, seamless multi-verse merging, and WAV encoding.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SWARA_NAMES = [
  'Sa', 'komal Re', 'Shuddha Re', 'komal Ga', 'Shuddha Ga',
  'Shuddha Ma', 'Tivra Ma', 'Pa', 'komal Dha', 'Shuddha Dha',
  'komal Ni', 'Shuddha Ni',
];

export type TanpuraTuning = 'Pa-Sa-Sa-Sa' | 'Ma-Sa-Sa-Sa' | 'Ni-Sa-Sa-Sa';
export type TanpuraTuningOption = 'auto' | TanpuraTuning;

export interface TonicCandidate {
  saHz: number;
  noteLabel: string;
  weightShare: number;
}

export interface ScaleAnalysisResult {
  saHz: number;
  noteLabel: string;
  candidates: TonicCandidate[];
  activeSwaras: string[];
  swaraWeights: number[];
  tuning: TanpuraTuning;
  firstRatio: number;
}

export function hzToNote(hz: number): string {
  const midi = 69 + 12 * Math.log2(Math.max(hz, 20) / 440);
  const mRound = Math.round(midi);
  const cents = (midi - mRound) * 100;
  const name = `${NOTE_NAMES[((mRound % 12) + 12) % 12]}${Math.floor(mRound / 12) - 1}`;
  const sign = cents >= 0 ? '+' : '';
  return `${name} (${sign}${Math.round(cents)}¢)`;
}

export function tuningToRatio(tuning: TanpuraTuning): number {
  if (tuning === 'Ma-Sa-Sa-Sa') return 4 / 3;
  if (tuning === 'Ni-Sa-Sa-Sa') return 15 / 8;
  return 1.5;
}

/**
 * Lightweight YIN fundamental frequency estimator over voiced frames.
 */
export function extractVoicedF0(
  mono: Float32Array,
  sr: number,
  fMin = 75,
  fMax = 420
): {f0: Float32Array; weights: Float32Array} {
  const frameLen = sr <= 24000 ? 1024 : 2048;
  const baseHop = sr <= 24000 ? 256 : 512;
  if (mono.length < frameLen) {
    return {f0: new Float32Array(0), weights: new Float32Array(0)};
  }

  const maxSampledFrames = 42;
  const hopLen =
    mono.length > sr * 2.5
      ? Math.max(baseHop, Math.floor((mono.length - frameLen) / maxSampledFrames))
      : baseHop;

  const tauMin = Math.max(2, Math.floor(sr / fMax));
  const tauMax = Math.min(Math.floor(frameLen / 2), Math.floor(sr / fMin));
  const numFrames = Math.floor((mono.length - frameLen) / hopLen) + 1;

  const rawF0: number[] = [];
  const rawRms: number[] = [];
  let maxRms = 0;

  const diff = new Float32Array(tauMax + 1);
  const cmndf = new Float32Array(tauMax + 1);

  for (let fr = 0; fr < numFrames; fr++) {
    const start = fr * hopLen;
    let sumSq = 0;
    for (let i = 0; i < frameLen; i++) {
      const v = mono[start + i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / frameLen);
    if (rms > maxRms) maxRms = rms;
    rawRms.push(rms);

    if (rms < 1e-4) {
      rawF0.push(0);
      continue;
    }

    diff[0] = 0;
    cmndf[0] = 1;
    let runningSum = 0;
    const half = frameLen - tauMax;

    for (let tau = 1; tau <= tauMax; tau++) {
      let d = 0;
      for (let j = 0; j < half; j++) {
        const delta = mono[start + j] - mono[start + j + tau];
        d += delta * delta;
      }
      diff[tau] = d;
      runningSum += d;
      cmndf[tau] = runningSum > 0 ? (d * tau) / runningSum : 1;
    }

    let bestTau = -1;
    const threshold = 0.18;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmndf[tau] < threshold) {
        while (tau + 1 <= tauMax && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    if (bestTau === -1) {
      let minVal = 1e9;
      for (let tau = tauMin; tau <= tauMax; tau++) {
        if (cmndf[tau] < minVal) {
          minVal = cmndf[tau];
          bestTau = tau;
        }
      }
      if (minVal > 0.38) bestTau = -1;
    }

    if (bestTau > 1 && bestTau < tauMax) {
      const s0 = cmndf[bestTau - 1];
      const s1 = cmndf[bestTau];
      const s2 = cmndf[bestTau + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      const shift = Math.abs(denom) > 1e-9 ? (s2 - s0) / denom : 0;
      const refinedTau = bestTau + Math.max(-0.5, Math.min(0.5, shift));
      rawF0.push(sr / refinedTau);
    } else if (bestTau > 0) {
      rawF0.push(sr / bestTau);
    } else {
      rawF0.push(0);
    }
  }

  if (maxRms < 1e-5) {
    return {f0: new Float32Array(0), weights: new Float32Array(0)};
  }

  const f0Keep: number[] = [];
  const wKeep: number[] = [];
  let prevCents = 0;
  let hasPrev = false;

  for (let i = 0; i < rawF0.length; i++) {
    const f = rawF0[i];
    const r = rawRms[i];
    if (r > 0.08 * maxRms && f > 80 && f < 410) {
      const cents = 1200 * Math.log2(f);
      const stable = !hasPrev || Math.abs(cents - prevCents) < 60;
      prevCents = cents;
      hasPrev = true;
      if (stable) {
        f0Keep.push(f);
        wKeep.push(r);
      }
    }
  }

  return {
    f0: Float32Array.from(f0Keep),
    weights: Float32Array.from(wKeep),
  };
}

const f0Cache = new WeakMap<Float32Array, {f0: Float32Array; weights: Float32Array}>();

export function extractVoicedF0Cached(
  mono: Float32Array,
  sr: number
): {f0: Float32Array; weights: Float32Array} {
  const cached = f0Cache.get(mono);
  if (cached) return cached;
  const computed = extractVoicedF0(mono, sr);
  f0Cache.set(mono, computed);
  return computed;
}

export const STANDARD_SHRUTIS: Array<{label: string; hz: number}> = [
  {label: 'A#2 / B♭2 (116.5 Hz)', hz: 116.54},
  {label: 'B2 (123.5 Hz)', hz: 123.47},
  {label: 'C3 — Safed 1 (130.8 Hz)', hz: 130.81},
  {label: 'C#3 — Kali 1 (138.6 Hz)', hz: 138.59},
  {label: 'D3 — Safed 2 (146.8 Hz)', hz: 146.83},
  {label: 'D#3 — Kali 2 (155.6 Hz)', hz: 155.56},
  {label: 'E3 — Safed 3 (164.8 Hz)', hz: 164.81},
  {label: 'F3 — Safed 4 (174.6 Hz)', hz: 174.61},
  {label: 'F#3 — Kali 3 (185.0 Hz)', hz: 185.0},
  {label: 'G3 — Safed 5 (196.0 Hz)', hz: 196.0},
  {label: 'G#3 — Kali 4 (207.7 Hz)', hz: 207.65},
  {label: 'A3 — Safed 6 (220.0 Hz)', hz: 220.0},
  {label: 'A#3 — Kali 5 (233.1 Hz)', hz: 233.08},
  {label: 'B3 — Safed 7 (246.9 Hz)', hz: 246.94},
];

export function analyzePitchAndScale(f0: Float32Array, weights: Float32Array): ScaleAnalysisResult {
  if (f0.length === 0) {
    return {
      saHz: 130.81,
      noteLabel: hzToNote(130.81),
      candidates: [{saHz: 130.81, noteLabel: hzToNote(130.81), weightShare: 1}],
      activeSwaras: ['Sa'],
      swaraWeights: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      tuning: 'Pa-Sa-Sa-Sa',
      firstRatio: 1.5,
    };
  }

  // 0.25-semitone histogram across MIDI 36..72
  const minMidi = 36;
  const step = 0.25;
  const numBins = Math.round((72 - minMidi) / step);
  const hist = new Float64Array(numBins);
  let totalW = 0;
  const midiArr = new Float64Array(f0.length);

  for (let i = 0; i < f0.length; i++) {
    const m = 69 + 12 * Math.log2(f0[i] / 440);
    midiArr[i] = m;
    const bin = Math.floor((m - minMidi) / step);
    if (bin >= 0 && bin < numBins) {
      hist[bin] += weights[i];
      totalW += weights[i];
    }
  }

  // Extract top-3 distinct pitch peaks (>= 1.5 semitones apart) so user can override if Sa != modal peak
  const rankedBins = Array.from({length: numBins}, (_, idx) => ({idx, w: hist[idx]}))
    .filter((b) => b.w > 0)
    .sort((a, b) => b.w - a.w);

  const candidates: TonicCandidate[] = [];
  for (const b of rankedBins) {
    const pkMidi = minMidi + (b.idx + 0.5) * step;
    if (candidates.some((c) => Math.abs(69 + 12 * Math.log2(c.saHz / 440) - pkMidi) < 1.5)) {
      continue;
    }
    let num = 0;
    let den = 0;
    for (let i = 0; i < f0.length; i++) {
      if (Math.abs(midiArr[i] - pkMidi) <= 0.6) {
        num += f0[i] * weights[i];
        den += weights[i];
      }
    }
    const saHz = den > 0 ? num / den : 440 * 2 ** ((pkMidi - 69) / 12);
    candidates.push({
      saHz,
      noteLabel: hzToNote(saHz),
      weightShare: totalW > 0 ? den / totalW : 0,
    });
    if (candidates.length >= 3) break;
  }

  const saHz = candidates[0]?.saHz ?? 130.81;
  const swaraW = new Float64Array(12);
  const denomW = totalW > 0 ? totalW : 1;

  for (let i = 0; i < f0.length; i++) {
    const rel = ((1200 * Math.log2(f0[i] / saHz)) % 1200 + 1200) % 1200;
    for (let s = 0; s < 12; s++) {
      const target = s * 100;
      let dist = ((rel - target + 600) % 1200 + 1200) % 1200 - 600;
      dist = Math.abs(dist);
      if (dist <= 45) {
        swaraW[s] += weights[i] / denomW;
      }
    }
  }

  const activeSwaras = SWARA_NAMES.filter((_, i) => i === 0 || swaraW[i] >= 0.03);
  const paW = swaraW[7];
  const maW = swaraW[5];
  const niW = swaraW[11];

  let tuning: TanpuraTuning = 'Pa-Sa-Sa-Sa';
  if (paW >= 0.025 || (maW < 0.04 && niW < 0.05)) {
    tuning = 'Pa-Sa-Sa-Sa';
  } else if (maW >= paW * 1.4 && maW >= 0.04) {
    tuning = 'Ma-Sa-Sa-Sa';
  } else {
    tuning = 'Ni-Sa-Sa-Sa';
  }

  return {
    saHz,
    noteLabel: hzToNote(saHz),
    candidates,
    activeSwaras,
    swaraWeights: Array.from(swaraW),
    tuning,
    firstRatio: tuningToRatio(tuning),
  };
}

export function analyzeClipSaHz(mono: Float32Array, sr: number, fallbackHz = 130.81): number {
  const {f0, weights} = extractVoicedF0Cached(mono, sr);
  if (f0.length === 0) return fallbackHz;
  return analyzePitchAndScale(f0, weights).saHz;
}

function applyBiquadForwardBackward(data: Float64Array, sr: number, freq: number, type: 'highpass' | 'lowpass'): void {
  const w0 = (2 * Math.PI * Math.min(freq, 0.44 * sr)) / sr;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / Math.SQRT2; // Butterworth Q = 1/sqrt(2)

  let b0 = 0, b1 = 0, b2 = 0;
  if (type === 'lowpass') {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
  } else {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0;
  const na1 = a1 / a0, na2 = a2 / a0;

  const runPass = (arr: Float64Array) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < arr.length; i++) {
      const x0 = arr[i];
      const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
      arr[i] = y0;
    }
  };

  runPass(data);
  data.reverse();
  runPass(data);
  data.reverse();
}

/**
 * Deterministic 4-string Jawari acoustic Tanpura loop synthesis.
 * Fixes edge-filter seam discontinuity by filtering the warm-up buffer BEFORE slicing the steady-state cycle.
 */
export function synthesizeJawariTanpura(
  saHz: number,
  firstRatio = 1.5,
  sr = 24000,
  cycleSec = 5.2,
  numCycles = 1
): Float32Array {
  const totalCycles = numCycles + 3;
  const nCyc = Math.round(cycleSec * sr);
  const nTot = totalCycles * nCyc;
  const buf = new Float64Array(nTot);

  const pluckOffsets = [0.0, 0.25, 0.43, 0.70];
  const stringFreqs = [saHz * (firstRatio * 0.5), saHz, saHz * 1.0008, saHz * 0.5];
  const stringGains = [0.78, 0.95, 0.92, 1.05];

  const noteDur = Math.min(cycleSec * 1.65, 8.5);
  const nNote = Math.round(noteDur * sr);
  const fadeN = Math.min(Math.round(0.25 * sr), Math.floor(nNote / 4));

  // Deterministic LCG PRNG for harmonic phases
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const stringWaves = stringFreqs.map((f0, sIdx) => {
    const wave = new Float64Array(nNote);
    const maxK = Math.min(24, Math.floor(4200 / Math.max(f0, 40)));
    const gain = stringGains[sIdx];

    for (let k = 1; k <= maxK; k++) {
      let amp: number, tRise: number, tDec: number;
      if (k === 1) {
        amp = 1.0;
        tRise = 0.032;
        tDec = 3.6;
      } else if (k <= 5) {
        amp = 0.64 / Math.pow(k, 0.72);
        tRise = 0.12 + 0.045 * k;
        tDec = 3.1 - 0.16 * k;
      } else {
        amp = 0.58 / Math.pow(k, 1.02);
        tRise = 0.26 + 0.035 * k;
        tDec = Math.max(1.0, 2.65 - 0.09 * k);
      }

      const phase = rand() * 2 * Math.PI;
      const omega = 2 * Math.PI * f0 * k;

      for (let n = 0; n < nNote; n++) {
        const t = n / sr;
        const attack = Math.min(1, t / 0.024);
        const env = (1 - Math.exp(-t / tRise)) * Math.exp(-t / tDec) * attack;
        wave[n] += amp * env * Math.sin(omega * t + phase);
      }
    }

    for (let i = 0; i < fadeN; i++) {
      wave[nNote - fadeN + i] *= 1 - i / fadeN;
    }
    for (let n = 0; n < nNote; n++) {
      wave[n] *= gain;
    }
    return wave;
  });

  for (let c = 0; c < totalCycles; c++) {
    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const start = Math.round((c + pluckOffsets[sIdx]) * nCyc);
      const w = stringWaves[sIdx];
      const end = Math.min(nTot, start + w.length);
      for (let i = start; i < end; i++) {
        buf[i] += w[i - start];
      }
    }
  }

  // Filter BEFORE slicing steady-state cycle so loop boundaries remain continuous
  applyBiquadForwardBackward(buf, sr, 42, 'highpass');
  applyBiquadForwardBackward(buf, sr, 3800, 'lowpass');

  const outStart = 2 * nCyc;
  const outLen = numCycles * nCyc;
  const out = new Float32Array(outLen);
  let peak = 0;
  for (let i = 0; i < outLen; i++) {
    const v = buf[outStart + i];
    const av = Math.abs(v);
    if (av > peak) peak = av;
    out[i] = v;
  }
  const norm = 0.85 / (peak + 1e-9);
  for (let i = 0; i < outLen; i++) {
    out[i] *= norm;
  }
  return out;
}

export type RagaId =
  | 'none'
  | 'brindavani_sarang'
  | 'shuddha_sarang'
  | 'bhupali'
  | 'yaman'
  | 'bhairav'
  | 'desh'
  | 'shivaranjani';

export interface RagaSpec {
  id: RagaId;
  label: string;
  thaat: string;
  swarasSummary: string;
  /** Chromatic semitones (0..11) permitted in this raga */
  semitones: number[];
  /** Just-intonation frequency ratios ascending over 1.5 octaves (0.75*Sa .. 2.25*Sa) */
  arohaRatios: number[];
  avarohaRatios: number[];
  suggestedTanpura: TanpuraTuning;
}

export const RAGA_PRESETS: Record<RagaId, RagaSpec> = {
  none: {
    id: 'none',
    label: 'Tanpura Only (No Swaramandal)',
    thaat: '—',
    swarasSummary: 'Drone only',
    semitones: [0, 7],
    arohaRatios: [1, 1.5, 2],
    avarohaRatios: [2, 1.5, 1],
    suggestedTanpura: 'Pa-Sa-Sa-Sa',
  },
  brindavani_sarang: {
    id: 'brindavani_sarang',
    label: 'Rāga Brindavani Sāraṅga',
    thaat: 'Kāfī',
    swarasSummary: 'S · R · M · P · n · S′',
    semitones: [0, 2, 5, 7, 10],
    arohaRatios: [9 / 10, 1.0, 9 / 8, 4 / 3, 3 / 2, 15 / 8, 2.0, 2 * (9 / 8)],
    avarohaRatios: [2 * (9 / 8), 2.0, 9 / 5, 3 / 2, 4 / 3, 9 / 8, 1.0],
    suggestedTanpura: 'Pa-Sa-Sa-Sa',
  },
  shuddha_sarang: {
    id: 'shuddha_sarang',
    label: 'Rāga Shuddha Sāraṅga',
    thaat: 'Kalyāṇa',
    swarasSummary: 'S · R · m · P · N · S′',
    semitones: [0, 2, 5, 6, 7, 11],
    arohaRatios: [15 / 16, 1.0, 9 / 8, 45 / 32, 3 / 2, 15 / 8, 2.0],
    avarohaRatios: [2.0, 15 / 8, 3 / 2, 45 / 32, 4 / 3, 9 / 8, 1.0],
    suggestedTanpura: 'Pa-Sa-Sa-Sa',
  },
  bhupali: {
    id: 'bhupali',
    label: 'Rāga Bhūpālī',
    thaat: 'Kalyāṇa',
    swarasSummary: 'S · R · G · P · D · S′',
    semitones: [0, 2, 4, 7, 9],
    arohaRatios: [5 / 6, 1.0, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2.0],
    avarohaRatios: [2.0, 5 / 3, 3 / 2, 5 / 4, 9 / 8, 1.0],
    suggestedTanpura: 'Pa-Sa-Sa-Sa',
  },
  yaman: {
    id: 'yaman',
    label: 'Rāga Yaman',
    thaat: 'Kalyāṇa',
    swarasSummary: 'N · R · G · m · P · D · N · S′',
    semitones: [0, 2, 4, 6, 7, 9, 11],
    arohaRatios: [15 / 16, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 5 / 3, 15 / 8, 2.0],
    avarohaRatios: [2.0, 15 / 8, 5 / 3, 3 / 2, 45 / 32, 5 / 4, 9 / 8, 1.0],
    suggestedTanpura: 'Ni-Sa-Sa-Sa',
  },
  bhairav: {
    id: 'bhairav',
    label: 'Rāga Bhairava',
    thaat: 'Bhairava',
    swarasSummary: 'S · r · G · M · P · d · N · S′',
    semitones: [0, 1, 4, 5, 7, 8, 11],
    arohaRatios: [1.0, 16 / 15, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 15 / 8, 2.0],
    avarohaRatios: [2.0, 15 / 8, 8 / 5, 3 / 2, 4 / 3, 5 / 4, 16 / 15, 1.0],
    suggestedTanpura: 'Pa-Sa-Sa-Sa',
  },
  desh: {
    id: 'desh',
    label: 'Rāga Desh',
    thaat: 'Khamāja',
    swarasSummary: 'S · R · M · P · N · S′ / n · D · P · M · G · R · S',
    semitones: [0, 2, 4, 5, 7, 9, 10, 11],
    arohaRatios: [1.0, 9 / 8, 4 / 3, 3 / 2, 15 / 8, 2.0],
    avarohaRatios: [2.0, 9 / 5, 5 / 3, 3 / 2, 4 / 3, 5 / 4, 9 / 8, 1.0],
    suggestedTanpura: 'Pa-Sa-Sa-Sa',
  },
  shivaranjani: {
    id: 'shivaranjani',
    label: 'Rāga Śivarañjanī',
    thaat: 'Kāfī',
    swarasSummary: 'S · R · g · P · D · S′',
    semitones: [0, 2, 3, 7, 9],
    arohaRatios: [5 / 6, 1.0, 9 / 8, 6 / 5, 3 / 2, 5 / 3, 2.0],
    avarohaRatios: [2.0, 5 / 3, 3 / 2, 6 / 5, 9 / 8, 1.0],
    suggestedTanpura: 'Pa-Sa-Sa-Sa',
  },
};

/**
 * Synthesizes a gentle plucked Rāga Swaramandal harp cascade locked to saHz.
 * Uses steel/bronze harmonic partials + warm-up filtering before cycle slicing for click-free loops.
 */
export function synthesizeRagaSwaramandal(
  saHz: number,
  ragaId: RagaId = 'brindavani_sarang',
  sr = 24000,
  cycleSec = 5.2,
  numCycles = 1
): Float32Array {
  const raga = RAGA_PRESETS[ragaId] || RAGA_PRESETS.brindavani_sarang;
  const nCyc = Math.round(cycleSec * sr);
  if (raga.id === 'none') {
    return new Float32Array(numCycles * nCyc);
  }

  const totalCycles = numCycles + 2;
  const buf = new Float64Array(totalCycles * nCyc);

  // Build one expressive gentle cascade: aroha sweep (0.15s..2.2s) then descending avaroha (2.75s..4.55s)
  const notes: Array<{offsetSec: number; freq: number; gain: number}> = [];
  const baseHz = Math.max(85, Math.min(350, saHz));

  const aroha = raga.arohaRatios;
  const avaroha = raga.avarohaRatios;
  const arohaSpan = 1.95;
  for (let i = 0; i < aroha.length; i++) {
    const t = 0.22 + (aroha.length > 1 ? (i / (aroha.length - 1)) * arohaSpan : 0);
    notes.push({
      offsetSec: t,
      freq: baseHz * aroha[i],
      gain: i === 0 || i === aroha.length - 1 ? 0.95 : 0.78,
    });
  }
  const avarohaSpan = 1.75;
  for (let i = 0; i < avaroha.length; i++) {
    const t = 2.85 + (avaroha.length > 1 ? (i / (avaroha.length - 1)) * avarohaSpan : 0);
    notes.push({
      offsetSec: t,
      freq: baseHz * avaroha[i],
      gain: i === avaroha.length - 1 ? 0.95 : 0.72,
    });
  }

  const noteDur = 2.4;
  const nNote = Math.round(noteDur * sr);
  const fadeN = Math.round(0.18 * sr);

  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const precomputedNotes = notes.map((note) => {
    const wave = new Float64Array(nNote);
    const maxK = Math.min(10, Math.floor(4600 / Math.max(note.freq, 60)));
    for (let k = 1; k <= maxK; k++) {
      const phase = rand() * Math.PI * 2;
      const amp = (note.gain * 0.42) / Math.pow(k, 1.15);
      const decay = 1.45 / (1 + 0.38 * (k - 1));
      const inharmonicF = note.freq * k * (1 + 0.00025 * k * k);
      const omega = 2 * Math.PI * inharmonicF;

      for (let i = 0; i < nNote; i++) {
        const t = i / sr;
        const env = (1 - Math.exp(-t / 0.008)) * Math.exp(-t / decay);
        const tailFade = i >= nNote - fadeN ? (nNote - i) / fadeN : 1;
        wave[i] += amp * env * tailFade * Math.sin(omega * t + phase);
      }
    }
    return {offsetSamples: Math.round(note.offsetSec * sr), wave};
  });

  for (let c = 0; c < totalCycles; c++) {
    const cycBase = c * nCyc;
    for (const {offsetSamples, wave} of precomputedNotes) {
      const start = cycBase + offsetSamples;
      const end = Math.min(buf.length, start + wave.length);
      for (let i = start; i < end; i++) {
        buf[i] += wave[i - start];
      }
    }
  }

  applyBiquadForwardBackward(buf, sr, 150, 'highpass');
  applyBiquadForwardBackward(buf, sr, 4600, 'lowpass');

  const outStart = nCyc;
  const outLen = numCycles * nCyc;
  const out = new Float32Array(outLen);
  let peak = 0;
  for (let i = 0; i < outLen; i++) {
    const v = buf[outStart + i];
    const av = Math.abs(v);
    if (av > peak) peak = av;
    out[i] = v;
  }
  const norm = peak > 1e-6 ? 0.72 / peak : 1;
  for (let i = 0; i < outLen; i++) {
    out[i] *= norm;
  }
  return out;
}

function measureActiveVoiceRms(voice: Float32Array): number {
  let peakVoice = 0;
  for (let i = 0; i < voice.length; i++) {
    const av = Math.abs(voice[i]);
    if (av > peakVoice) peakVoice = av;
  }
  let activeSq = 0;
  let activeCount = 0;
  const activeThresh = 0.05 * (peakVoice + 1e-9);
  for (let i = 0; i < voice.length; i++) {
    if (Math.abs(voice[i]) > activeThresh) {
      activeSq += voice[i] * voice[i];
      activeCount++;
    }
  }
  return activeCount > 0 ? Math.sqrt(activeSq / activeCount) : 0.1;
}

export function mixAccompanimentWithVoice(
  voice: Float32Array,
  sr: number,
  options: {
    tanpuraLoop?: Float32Array | null;
    tanpuraDb?: number;
    swaramandalLoop?: Float32Array | null;
    swaramandalDb?: number;
    introSec?: number;
    outroSec?: number;
  }
): Float32Array {
  const introSec = options.introSec ?? 0;
  const outroSec = options.outroSec ?? 0.35;
  const tanpuraLoop = options.tanpuraLoop && options.tanpuraLoop.length > 0 ? options.tanpuraLoop : null;
  const swaraLoop =
    options.swaramandalLoop && options.swaramandalLoop.length > 0 ? options.swaramandalLoop : null;

  if (!tanpuraLoop && !swaraLoop) {
    return voice;
  }

  const nIntro = Math.round(introSec * sr);
  const nOutro = Math.round(outroSec * sr);
  const nTotal = nIntro + voice.length + nOutro;
  const fi = Math.min(Math.max(Math.round(0.35 * sr), nIntro), Math.floor(nTotal / 4));
  const fo = Math.min(Math.max(Math.round(0.35 * sr), nOutro), Math.floor(nTotal / 2));

  const voiceRms = measureActiveVoiceRms(voice);

  const buildLayerGain = (loop: Float32Array | null, db: number) => {
    if (!loop) return {loop: null, gain: 0};
    let sq = 0;
    for (let i = 0; i < loop.length; i++) sq += loop[i] * loop[i];
    const loopRms = Math.sqrt(sq / Math.max(1, loop.length));
    if (loopRms < 1e-6) return {loop: null, gain: 0};
    return {
      loop,
      gain: (voiceRms * Math.pow(10, db / 20)) / loopRms,
    };
  };

  const tLayer = buildLayerGain(tanpuraLoop, options.tanpuraDb ?? -15.5);
  const sLayer = buildLayerGain(swaraLoop, options.swaramandalDb ?? -21.0);

  const mixed = new Float32Array(nTotal);
  let outPeak = 0;
  const tLen = tLayer.loop?.length ?? 1;
  const sLen = sLayer.loop?.length ?? 1;

  for (let i = 0; i < nTotal; i++) {
    let env = 1;
    if (i < fi) env *= i / fi;
    if (i >= nTotal - fo) env *= (nTotal - i) / fo;

    const v = i >= nIntro && i < nIntro + voice.length ? voice[i - nIntro] : 0;
    const tVal = tLayer.loop ? tLayer.loop[i % tLen] * tLayer.gain * env : 0;
    const sVal = sLayer.loop ? sLayer.loop[i % sLen] * sLayer.gain * env : 0;
    const m = v + tVal + sVal;
    mixed[i] = m;
    const am = Math.abs(m);
    if (am > outPeak) outPeak = am;
  }

  if (outPeak > 0.96) {
    const scale = 0.96 / outPeak;
    for (let i = 0; i < nTotal; i++) {
      mixed[i] *= scale;
    }
  }
  return mixed;
}

export function mixTanpuraWithVoice(
  voice: Float32Array,
  sr: number,
  tanpuraLoop: Float32Array,
  tanpuraDb = -15.5,
  introSec = 0,
  outroSec = 0.35
): Float32Array {
  return mixAccompanimentWithVoice(voice, sr, {
    tanpuraLoop,
    tanpuraDb,
    introSec,
    outroSec,
  });
}

export function mergeVoiceClips(
  clips: Float32Array[],
  sr: number,
  pauseMs = 450
): Float32Array {
  if (clips.length === 0) return new Float32Array(0);
  const pauseSamples = Math.max(0, Math.round((pauseMs / 1000) * sr));
  const totalLen =
    clips.reduce((acc, c) => acc + c.length, 0) +
    Math.max(0, clips.length - 1) * pauseSamples;
  const out = new Float32Array(totalLen);
  let cursor = 0;
  for (let i = 0; i < clips.length; i++) {
    out.set(clips[i], cursor);
    cursor += clips[i].length;
    if (i < clips.length - 1) {
      cursor += pauseSamples;
    }
  }
  return out;
}

/**
 * Trims excessive leading/trailing dead air from TTS clips and normalizes active speech RMS
 * so merged 100-shloka exports and Tanpura balances remain uniform across every verse.
 */
export function trimAndNormalizeVoice(
  samples: Float32Array,
  sr: number,
  targetActiveRms = 0.125
): Float32Array {
  if (samples.length === 0) return samples;

  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const av = Math.abs(samples[i]);
    if (av > peak) peak = av;
  }
  if (peak < 1e-5) return samples;

  const win = Math.max(1, Math.round(0.015 * sr));
  const thresh = Math.max(0.004, peak * 0.008);
  let firstActive = 0;
  let lastActive = samples.length - 1;

  for (let i = 0; i + win <= samples.length; i += win) {
    let sq = 0;
    for (let j = 0; j < win; j++) sq += samples[i + j] * samples[i + j];
    if (Math.sqrt(sq / win) >= thresh) {
      firstActive = i;
      break;
    }
  }

  for (let i = Math.max(0, samples.length - win); i >= 0; i -= win) {
    let sq = 0;
    for (let j = 0; j < win; j++) sq += samples[i + j] * samples[i + j];
    if (Math.sqrt(sq / win) >= thresh) {
      lastActive = Math.min(samples.length - 1, i + win - 1);
      break;
    }
  }

  const pad = Math.round(0.045 * sr);
  const start = Math.max(0, firstActive - pad);
  const end = Math.min(samples.length, lastActive + pad + 1);
  if (end <= start + Math.round(0.1 * sr)) return samples;

  const trimmed = new Float32Array(end - start);
  trimmed.set(samples.subarray(start, end));

  const fade = Math.min(Math.round(0.015 * sr), Math.floor(trimmed.length / 4));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    trimmed[i] *= w;
    trimmed[trimmed.length - 1 - i] *= w;
  }

  const activeThresh = peak * 0.05;
  let activeSq = 0;
  let activeCount = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (Math.abs(trimmed[i]) > activeThresh) {
      activeSq += trimmed[i] * trimmed[i];
      activeCount++;
    }
  }
  const activeRms = activeCount > 0 ? Math.sqrt(activeSq / activeCount) : 0;
  if (activeRms > 1e-4) {
    let gain = targetActiveRms / activeRms;
    gain = Math.max(0.4, Math.min(2.5, gain));
    let newPeak = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const av = Math.abs(trimmed[i] * gain);
      if (av > newPeak) newPeak = av;
    }
    if (newPeak > 0.92) {
      gain *= 0.92 / newPeak;
    }
    for (let i = 0; i < trimmed.length; i++) {
      trimmed[i] *= gain;
    }
  }

  return trimmed;
}

export function encodeWavBuffer(samples: Float32Array, sr: number): ArrayBuffer {
  const numBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + numBytes);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // linear PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buf;
}
