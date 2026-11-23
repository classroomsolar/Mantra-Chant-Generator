import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAGA_PRESETS,
  analyzeClipSaHz,
  analyzePitchAndScale,
  encodeWavBuffer,
  extractVoicedF0,
  extractVoicedF0Cached,
  mergeVoiceClips,
  mixAccompanimentWithVoice,
  mixTanpuraWithVoice,
  synthesizeJawariTanpura,
  synthesizeRagaSwaramandal,
  trimAndNormalizeVoice,
} from './audioEngine';

test('YIN detects synthetic 146.83 Hz (D3) + fifth 220.0 Hz correctly', () => {
  const sr = 24000;
  const dur = 2.0;
  const n = Math.round(sr * dur);
  const sig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = t < 1.3 ? 146.83 : 220.0;
    sig[i] = 0.4 * Math.sin(2 * Math.PI * f * t) + 0.12 * Math.sin(4 * Math.PI * f * t);
  }
  const {f0, weights} = extractVoicedF0(sig, sr);
  assert.ok(f0.length > 20);
  const scale = analyzePitchAndScale(f0, weights);
  assert.ok(Math.abs(scale.saHz - 146.83) < 2.0, `Expected ~146.83 Hz, got ${scale.saHz}`);
  assert.equal(scale.tuning, 'Pa-Sa-Sa-Sa');
  assert.equal(scale.swaraWeights.length, 12);
  assert.ok(scale.swaraWeights[0] > 0.4);
  assert.ok(scale.swaraWeights[7] > 0.2);
});

test('analyzePitchAndScale picks Ma-Sa-Sa-Sa when Shuddha Ma dominates over absent Pa', () => {
  const sr = 24000;
  const n = sr * 2;
  const sig = new Float32Array(n);
  // 146.83 Hz (Sa) for 1.3s + 195.99 Hz (Shuddha Ma = 4/3 * 146.83) for 0.7s
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = t < 1.3 ? 146.83 : 195.99;
    sig[i] = 0.4 * Math.sin(2 * Math.PI * f * t);
  }
  const {f0, weights} = extractVoicedF0(sig, sr);
  const scale = analyzePitchAndScale(f0, weights);
  assert.equal(scale.tuning, 'Ma-Sa-Sa-Sa');
  assert.ok(scale.swaraWeights[5] > 0.2);
});

test('analyzeClipSaHz estimates per-clip tonic and falls back on silence', () => {
  const sr = 24000;
  const silent = new Float32Array(sr);
  assert.equal(analyzeClipSaHz(silent, sr, 138.59), 138.59);

  const tone = new Float32Array(sr);
  for (let i = 0; i < sr; i++) {
    tone[i] = 0.35 * Math.sin((2 * Math.PI * 164.81 * i) / sr);
  }
  const est = analyzeClipSaHz(tone, sr, 130.81);
  assert.ok(Math.abs(est - 164.81) < 2.0, `Expected ~164.81 Hz, got ${est}`);
});

test('synthesizeJawariTanpura produces exact cycle length with smooth loop seam', () => {
  const sr = 24000;
  const loop = synthesizeJawariTanpura(130.81, 1.5, sr, 5.2, 1);
  assert.equal(loop.length, Math.round(5.2 * sr));
  const seamJump = Math.abs(loop[0] - loop[loop.length - 1]);
  assert.ok(seamJump < 0.08, `Loop seam jump too large: ${seamJump}`);
});

test('synthesizeRagaSwaramandal produces Brindavani Sarang cascade with smooth loop seam', () => {
  const sr = 24000;
  assert.deepEqual(RAGA_PRESETS.brindavani_sarang.semitones, [0, 2, 5, 7, 10]);
  const swara = synthesizeRagaSwaramandal(146.83, 'brindavani_sarang', sr, 5.2, 1);
  assert.equal(swara.length, Math.round(5.2 * sr));
  let rms = 0;
  for (let i = 0; i < swara.length; i++) rms += swara[i] * swara[i];
  rms = Math.sqrt(rms / swara.length);
  assert.ok(rms > 0.02, `Expected non-silent Swaramandal loop, got rms=${rms}`);
  const seamJump = Math.abs(swara[0] - swara[swara.length - 1]);
  assert.ok(seamJump < 0.12, `Swaramandal loop seam jump too large: ${seamJump}`);

  const muted = synthesizeRagaSwaramandal(146.83, 'none', sr, 5.2, 1);
  assert.equal(muted.reduce((a, b) => a + Math.abs(b), 0), 0);
});

test('mixAccompanimentWithVoice weaves both Tanpura and Swaramandal safely within bounds', () => {
  const sr = 24000;
  const voice = new Float32Array(sr).fill(0.15);
  const tanpura = synthesizeJawariTanpura(146.83, 1.5, sr, 5.2, 1);
  const swaramandal = synthesizeRagaSwaramandal(146.83, 'brindavani_sarang', sr, 5.2, 1);
  const mixed = mixAccompanimentWithVoice(voice, sr, {
    tanpuraLoop: tanpura,
    tanpuraDb: -15.5,
    swaramandalLoop: swaramandal,
    swaramandalDb: -21.0,
    introSec: 0.5,
    outroSec: 0.5,
  });
  assert.equal(mixed.length, voice.length + sr);
  for (let i = 0; i < mixed.length; i++) {
    assert.ok(Math.abs(mixed[i]) <= 0.961);
  }
});

test('mergeVoiceClips and mixTanpuraWithVoice respect pause and bounds', () => {
  const sr = 24000;
  const a = new Float32Array(12000).fill(0.2);
  const b = new Float32Array(12000).fill(-0.2);
  const merged = mergeVoiceClips([a, b], sr, 500);
  assert.equal(merged.length, 12000 + 12000 + 12000);

  const loop = synthesizeJawariTanpura(130.81, 1.5, sr, 5.2, 1);
  const mixed = mixTanpuraWithVoice(merged, sr, loop, -15.5, 1.0, 1.0);
  assert.equal(mixed.length, merged.length + 2 * sr);
  for (let i = 0; i < mixed.length; i++) {
    assert.ok(Math.abs(mixed[i]) <= 0.961);
  }
  const wav = encodeWavBuffer(mixed, sr);
  assert.equal(wav.byteLength, 44 + mixed.length * 2);
});

test('trimAndNormalizeVoice trims long silence padding and normalizes active RMS', () => {
  const sr = 24000;
  const sig = new Float32Array(sr * 3); // 1s silence + 1s tone + 1s silence
  for (let i = sr; i < sr * 2; i++) {
    sig[i] = 0.06 * Math.sin((2 * Math.PI * 140 * i) / sr);
  }
  const out = trimAndNormalizeVoice(sig, sr, 0.125);
  assert.ok(out.length < sr * 1.4, `Expected trimmed length < 1.4s, got ${out.length / sr}s`);
  assert.ok(out.length > sr * 0.95);
});

test('100-clip cached F0, continuous Tanpura mix, and merged WAV scale cleanly', () => {
  const sr = 24000;
  const clipLen = sr * 1;
  const clip = new Float32Array(clipLen);
  for (let i = 0; i < clipLen; i++) {
    clip[i] = 0.25 * Math.sin((2 * Math.PI * 146.83 * i) / sr);
  }
  const first = extractVoicedF0Cached(clip, sr);
  const second = extractVoicedF0Cached(clip, sr);
  assert.equal(first, second);

  const clips = Array.from({length: 100}, () => clip);
  const merged = mergeVoiceClips(clips, sr, 250);
  const loop = synthesizeJawariTanpura(146.83, 1.5, sr, 5.2, 1);
  const mixed = mixTanpuraWithVoice(merged, sr, loop, -15.5, 1.0, 1.0);
  const wav = encodeWavBuffer(mixed, sr);
  assert.ok(wav.byteLength > 4_000_000);
});

test('188 distinct 4-second clips compute F0 and tonic Sa rapidly without stall', () => {
  const sr = 24000;
  const len = sr * 4;
  const t0 = performance.now();
  const f0Parts: Float32Array[] = [];
  const wParts: Float32Array[] = [];
  for (let c = 0; c < 188; c++) {
    const buf = new Float32Array(len);
    const freq = 146.83 + (c % 3) * 0.25;
    for (let i = 0; i < len; i++) {
      buf[i] = 0.2 * Math.sin((2 * Math.PI * freq * i) / sr);
    }
    const res = extractVoicedF0Cached(buf, sr);
    f0Parts.push(res.f0);
    wParts.push(res.weights);
  }
  const total = f0Parts.reduce((s, a) => s + a.length, 0);
  const allF0 = new Float32Array(total);
  const allW = new Float32Array(total);
  let off = 0;
  for (let i = 0; i < f0Parts.length; i++) {
    allF0.set(f0Parts[i], off);
    allW.set(wParts[i], off);
    off += f0Parts[i].length;
  }
  const scale = analyzePitchAndScale(allF0, allW);
  const elapsedMs = performance.now() - t0;
  assert.ok(Math.abs(scale.saHz - 147.08) < 2.0);
  assert.ok(elapsedMs < 6000, `Expected 188 distinct 4s clips under 6s, took ${elapsedMs.toFixed(0)}ms`);
});

test('188 distinct 4-second clips compute F0 and tonic Sa rapidly without stall', () => {
  const sr = 24000;
  const len = sr * 4;
  const t0 = performance.now();
  const f0Parts: Float32Array[] = [];
  const wParts: Float32Array[] = [];
  for (let c = 0; c < 188; c++) {
    const buf = new Float32Array(len);
    const freq = 146.83 + (c % 3) * 0.25;
    for (let i = 0; i < len; i++) {
      buf[i] = 0.2 * Math.sin((2 * Math.PI * freq * i) / sr);
    }
    const res = extractVoicedF0Cached(buf, sr);
    f0Parts.push(res.f0);
    wParts.push(res.weights);
  }
  const total = f0Parts.reduce((s, a) => s + a.length, 0);
  const allF0 = new Float32Array(total);
  const allW = new Float32Array(total);
  let off = 0;
  for (let i = 0; i < f0Parts.length; i++) {
    allF0.set(f0Parts[i], off);
    allW.set(wParts[i], off);
    off += f0Parts[i].length;
  }
  const scale = analyzePitchAndScale(allF0, allW);
  const elapsedMs = performance.now() - t0;
  assert.ok(Math.abs(scale.saHz - 147.08) < 2.0);
  assert.ok(elapsedMs < 6000, `Expected 188 distinct 4s clips under 6s, took ${elapsedMs.toFixed(0)}ms`);
});


