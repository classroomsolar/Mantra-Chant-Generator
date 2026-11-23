import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import JSZip from 'jszip';
import {ArrowDown, CheckSquare, FileAudio, RotateCcw, Search, Square, Trash2, Upload, X} from 'lucide-react';
import {CreditsSection} from './components/CreditsSection';
import {ExportBar} from './components/ExportBar';
import {Header} from './components/Header';
import {TanpuraPanel} from './components/TanpuraPanel';
import {VerseCard, VerseRuntimeState} from './components/VerseCard';
import {
  RAGA_PRESETS,
  RagaId,
  ScaleAnalysisResult,
  TanpuraTuning,
  TanpuraTuningOption,
  analyzeClipSaHz,
  analyzePitchAndScale,
  extractVoicedF0Cached,
  mergeVoiceClips,
  mixAccompanimentWithVoice,
  synthesizeJawariTanpura,
  synthesizeRagaSwaramandal,
  tuningToRatio,
} from './lib/audioEngine';
import {
  isSupportedAudioFilename,
  isZipFilename,
  matchImportedAudioFiles,
} from './lib/batchAudioMatch';
import {
  Mp3Bitrate,
  SAMPLE_STOTRAS,
  decodeAudioBufferTo24kNormalized,
  encodeAudioFile,
  reciteShloka,
} from './lib/reciteClient';
import {CHANDAS_METERS, MeterOptionId, ParsedShloka, parseBatchShlokas} from './lib/sanskritMeter';
import {
  clearAllAudioEntries,
  loadAllAudioEntries,
  loadAppState,
  saveAppState,
  saveAudioEntry,
} from './lib/storage';

type VerseFilter = 'all' | 'selected' | 'ready' | 'pending';
type QueueDensity = 'standard' | 'compact';

function audioCacheKey(text: string, meter: string): string {
  return `${meter}::vagdhenu::${text.trim()}`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function formatEta(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `~${m}m ${rem}s left` : `~${rem}s left`;
}

export default function App() {
  const initialSaved = useMemo(() => loadAppState(), []);

  const [rawText, setRawText] = useState<string>(
    () => initialSaved?.rawText || SAMPLE_STOTRAS[0].text
  );
  const [pauseMs, setPauseMs] = useState<number>(() => initialSaved?.pauseMs ?? 450);
  const [tanpuraEnabled, setTanpuraEnabled] = useState<boolean>(
    () => initialSaved?.tanpuraEnabled ?? true
  );
  const [tanpuraDb, setTanpuraDb] = useState<number>(() => initialSaved?.tanpuraDb ?? -15.5);
  const [tuningOption, setTuningOption] = useState<TanpuraTuningOption>(
    () => initialSaved?.tanpuraTuning || 'auto'
  );
  const [tonicScope, setTonicScope] = useState<'global' | 'per-verse'>(
    () => initialSaved?.tonicScope || 'global'
  );
  const [ragaId, setRagaId] = useState<RagaId>(
    () => initialSaved?.ragaId || 'brindavani_sarang'
  );
  const [swaramandalEnabled, setSwaramandalEnabled] = useState<boolean>(
    () => initialSaved?.swaramandalEnabled ?? true
  );
  const [swaramandalDb, setSwaramandalDb] = useState<number>(
    () => initialSaved?.swaramandalDb ?? -21.0
  );
  const [mp3Bitrate, setMp3Bitrate] = useState<Mp3Bitrate>(
    () => initialSaved?.mp3Bitrate || '192k'
  );
  const [manualSaHz, setManualSaHz] = useState<number | null>(
    () => initialSaved?.manualSaHz ?? null
  );
  const [manualMeters, setManualMeters] = useState<Record<string, string>>(
    () => initialSaved?.manualMeters || {}
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSaved?.selectedIds || [])
  );
  const [hasInitializedSelection, setHasInitializedSelection] = useState<boolean>(
    () => Boolean(initialSaved?.selectedIds)
  );
  const [verseFilter, setVerseFilter] = useState<VerseFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [density, setDensity] = useState<QueueDensity>('standard');

  const [audioByKey, setAudioByKey] = useState<
    Record<string, {samples: Float32Array; sampleRate: number; statusText: string}>
  >({});
  const [runtimeById, setRuntimeById] = useState<Record<string, VerseRuntimeState>>({});
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    currentIndex: number;
    etaSec: number | null;
  } | null>(null);
  const [batchMessage, setBatchMessage] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [playingVerseId, setPlayingVerseId] = useState<string | null>(null);
  const [playbackElapsedSec, setPlaybackElapsedSec] = useState(0);
  const [isTanpuraPreviewPlaying, setIsTanpuraPreviewPlaying] = useState(false);
  const [isMergedPreviewPlaying, setIsMergedPreviewPlaying] = useState(false);
  const [mergedPreviewTotalSec, setMergedPreviewTotalSec] = useState(0);
  const [bulkMeterValue, setBulkMeterValue] = useState<MeterOptionId>('__auto__');
  const [isDragOver, setIsDragOver] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const queueTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const playCtxRef = useRef<AudioContext | null>(null);
  const playSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartedAtRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioImportInputRef = useRef<HTMLInputElement | null>(null);

  const verses: ParsedShloka[] = useMemo(() => {
    const parsed = parseBatchShlokas(rawText);
    return parsed.map((v) => ({
      ...v,
      manualMeter: (manualMeters[v.id] as MeterOptionId) || '__auto__',
      selected: hasInitializedSelection ? selectedIds.has(v.id) : true,
    }));
  }, [rawText, manualMeters, selectedIds, hasInitializedSelection]);

  // Hydrate persisted audio clips from IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    loadAllAudioEntries().then((entries) => {
      if (!mounted) return;
      const loaded: Record<string, {samples: Float32Array; sampleRate: number; statusText: string}> = {};
      for (const [k, v] of Object.entries(entries)) {
        loaded[k] = {
          samples: v.samples instanceof Float32Array ? v.samples : new Float32Array(v.samples),
          sampleRate: v.sampleRate,
          statusText: v.statusText,
        };
      }
      setAudioByKey(loaded);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Track elapsed playback seconds while playing either a single verse or merged preview
  useEffect(() => {
    if (!playingVerseId && !isMergedPreviewPlaying) {
      setPlaybackElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setPlaybackElapsedSec((performance.now() - playStartedAtRef.current) / 1000);
    }, 250);
    return () => window.clearInterval(timer);
  }, [playingVerseId, isMergedPreviewPlaying]);

  // Persist website state
  useEffect(() => {
    saveAppState({
      rawText,
      pauseMs,
      tanpuraEnabled,
      tanpuraDb,
      tanpuraTuning: tuningOption,
      tonicScope,
      ragaId,
      swaramandalEnabled,
      swaramandalDb,
      mp3Bitrate,
      manualSaHz,
      manualMeters,
      selectedIds: verses.filter((v) => v.selected).map((v) => v.id),
    });
  }, [
    rawText,
    pauseMs,
    tanpuraEnabled,
    tanpuraDb,
    tuningOption,
    tonicScope,
    ragaId,
    swaramandalEnabled,
    swaramandalDb,
    mp3Bitrate,
    manualSaHz,
    manualMeters,
    verses,
  ]);

  // Build resolved runtime state per verse
  const resolvedRuntime = useMemo(() => {
    const map: Record<string, VerseRuntimeState> = {};
    for (const v of verses) {
      const chosenMeter = v.manualMeter === '__auto__' ? v.meter.bankKey : v.manualMeter;
      const key = audioCacheKey(v.text, chosenMeter);
      const cached = audioByKey[key];
      const live = runtimeById[v.id];
      if (live && (live.status === 'rendering' || live.status === 'queued' || live.status === 'error')) {
        map[v.id] = live;
      } else if (cached) {
        map[v.id] = {
          status: 'ready',
          samples: cached.samples,
          sampleRate: cached.sampleRate,
          durationSec: cached.samples.length / cached.sampleRate,
          statusText: cached.statusText,
        };
      } else {
        map[v.id] = live || {status: 'idle'};
      }
    }
    return map;
  }, [verses, audioByKey, runtimeById]);

  // Global pitch & scale analysis across recited verses (WeakMap-cached for 100-shloka speed)
  const scaleAnalysis: ScaleAnalysisResult | null = useMemo(() => {
    const f0Parts: Float32Array[] = [];
    const wParts: Float32Array[] = [];
    for (const v of verses) {
      const rt = resolvedRuntime[v.id];
      if (rt?.status === 'ready' && rt.samples && rt.sampleRate) {
        const {f0, weights} = extractVoicedF0Cached(rt.samples, rt.sampleRate);
        if (f0.length > 0) {
          f0Parts.push(f0);
          wParts.push(weights);
        }
      }
    }
    if (f0Parts.length === 0) return null;
    const totalLen = f0Parts.reduce((s, a) => s + a.length, 0);
    const allF0 = new Float32Array(totalLen);
    const allW = new Float32Array(totalLen);
    let offset = 0;
    for (let i = 0; i < f0Parts.length; i++) {
      allF0.set(f0Parts[i], offset);
      allW.set(wParts[i], offset);
      offset += f0Parts[i].length;
    }
    return analyzePitchAndScale(allF0, allW);
  }, [verses, resolvedRuntime]);

  const activeSaHz = manualSaHz ?? scaleAnalysis?.saHz ?? 130.81;
  const ragaSpec = RAGA_PRESETS[ragaId] || RAGA_PRESETS.brindavani_sarang;
  const resolvedTuning: TanpuraTuning =
    tuningOption === 'auto' ? scaleAnalysis?.tuning || 'Pa-Sa-Sa-Sa' : tuningOption;
  const activeRatio = tuningToRatio(resolvedTuning);

  const tanpuraLoop = useMemo(() => {
    if (!tanpuraEnabled) return null;
    return synthesizeJawariTanpura(activeSaHz, activeRatio, 24000, 5.2, 1);
  }, [tanpuraEnabled, activeSaHz, activeRatio]);

  const swaramandalLoop = useMemo(() => {
    if (!swaramandalEnabled || ragaId === 'none') return null;
    return synthesizeRagaSwaramandal(activeSaHz, ragaId, 24000, 5.2, 1);
  }, [swaramandalEnabled, ragaId, activeSaHz]);

  const getLoopsForVerse = useCallback(
    (samples: Float32Array, sr: number): {tanpura: Float32Array | null; swaramandal: Float32Array | null} => {
      if (tonicScope === 'global' || manualSaHz !== null) {
        return {tanpura: tanpuraLoop, swaramandal: swaramandalLoop};
      }
      const verseSa = analyzeClipSaHz(samples, sr, activeSaHz);
      if (Math.abs(verseSa - activeSaHz) < 0.75) {
        return {tanpura: tanpuraLoop, swaramandal: swaramandalLoop};
      }
      return {
        tanpura: tanpuraEnabled ? synthesizeJawariTanpura(verseSa, activeRatio, sr, 5.2, 1) : null,
        swaramandal:
          swaramandalEnabled && ragaId !== 'none'
            ? synthesizeRagaSwaramandal(verseSa, ragaId, sr, 5.2, 1)
            : null,
      };
    },
    [
      tonicScope,
      manualSaHz,
      tanpuraLoop,
      swaramandalLoop,
      activeSaHz,
      tanpuraEnabled,
      activeRatio,
      swaramandalEnabled,
      ragaId,
    ]
  );

  const stopPlayback = useCallback(() => {
    if (playSourceRef.current) {
      playSourceRef.current.onended = null;
      try {
        playSourceRef.current.stop();
      } catch {
        // already stopped
      }
      playSourceRef.current.disconnect();
      playSourceRef.current = null;
    }
    setPlayingVerseId(null);
    setPlaybackElapsedSec(0);
    setIsTanpuraPreviewPlaying(false);
    setIsMergedPreviewPlaying(false);
    setMergedPreviewTotalSec(0);
  }, []);

  const playPcm = useCallback(
    (samples: Float32Array, sr: number, loop = false) => {
      stopPlayback();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      if (!playCtxRef.current) playCtxRef.current = new AudioCtx();
      const ctx = playCtxRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const buf = ctx.createBuffer(1, samples.length, sr);
      buf.getChannelData(0).set(samples);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      src.connect(ctx.destination);
      src.onended = () => {
        if (!loop) {
          setPlayingVerseId(null);
          setPlaybackElapsedSec(0);
          setIsMergedPreviewPlaying(false);
          setMergedPreviewTotalSec(0);
        }
      };
      playStartedAtRef.current = performance.now();
      src.start();
      playSourceRef.current = src;
    },
    [stopPlayback]
  );

  // Serialized render queue ensures sequential execution across single or 100-shloka batches
  const enqueueVerseRender = useCallback(
    (verse: ParsedShloka, signal?: AbortSignal): Promise<boolean> => {
      setRuntimeById((prev) => ({...prev, [verse.id]: {status: 'queued'}}));

      const task = queueTailRef.current.then(async () => {
        if (signal?.aborted) {
          setRuntimeById((prev) => ({...prev, [verse.id]: {status: 'idle'}}));
          throw new DOMException('Aborted', 'AbortError');
        }

        const targetMeter =
          verse.manualMeter === '__auto__' ? verse.meter.bankKey : verse.manualMeter;
        const cacheKey = audioCacheKey(verse.text, targetMeter);

        setRuntimeById((prev) => ({...prev, [verse.id]: {status: 'rendering'}}));
        try {
          const res = await reciteShloka({
            text: verse.text,
            meter: targetMeter,
            signal,
          });

          await saveAudioEntry({
            key: cacheKey,
            samples: res.samples,
            sampleRate: res.sampleRate,
            statusText: res.statusText,
          });

          setAudioByKey((prev) => ({
            ...prev,
            [cacheKey]: {
              samples: res.samples,
              sampleRate: res.sampleRate,
              statusText: res.statusText,
            },
          }));
          setRuntimeById((prev) => ({
            ...prev,
            [verse.id]: {
              status: 'ready',
              samples: res.samples,
              sampleRate: res.sampleRate,
              durationSec: res.durationSec,
              statusText: res.statusText,
            },
          }));
          return true;
        } catch (err) {
          const isAbort = err instanceof DOMException && err.name === 'AbortError';
          const message = isAbort
            ? 'Stopped.'
            : err instanceof Error
            ? err.message
            : 'Recitation failed.';
          setRuntimeById((prev) => ({
            ...prev,
            [verse.id]: isAbort ? {status: 'idle'} : {status: 'error', error: message},
          }));
          throw err;
        }
      });

      queueTailRef.current = task.catch(() => undefined);
      return task;
    },
    []
  );

  const runBatchTargets = useCallback(
    async (targets: ParsedShloka[]) => {
      if (isBatchRunning) {
        abortRef.current?.abort();
        setIsBatchRunning(false);
        setBatchProgress(null);
        setBatchMessage('Queue stopped. Already recited ślokas remain saved.');
        return;
      }

      if (targets.length === 0) {
        setBatchMessage('All selected ślokas are already recited and ready to download.');
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsBatchRunning(true);
      const startedAt = performance.now();

      setRuntimeById((prev) => {
        const next = {...prev};
        for (const t of targets) next[t.id] = {status: 'queued'};
        return next;
      });

      let done = 0;
      let firstError = '';
      for (let idx = 0; idx < targets.length; idx++) {
        const v = targets[idx];
        if (controller.signal.aborted) break;
        const avgSec = done > 0 ? (performance.now() - startedAt) / 1000 / done : null;
        const etaSec = avgSec !== null ? avgSec * (targets.length - done) : null;
        setBatchProgress({
          done,
          total: targets.length,
          currentIndex: v.index,
          etaSec,
        });
        setBatchMessage(
          `Reciting śloka #${v.index} (${done + 1} of ${targets.length})${
            etaSec !== null ? ` · ${formatEta(etaSec)}` : ''
          }`
        );
        try {
          await enqueueVerseRender(v, controller.signal);
          done += 1;
          if (idx < targets.length - 1 && !controller.signal.aborted) {
            await new Promise((r) => setTimeout(r, 650));
          }
        } catch (err) {
          if (controller.signal.aborted) break;
          const msg = err instanceof Error ? err.message : 'Recitation error.';
          if (!firstError) firstError = msg;
          const isFatalBatch =
            Boolean((err as {isFatalBatch?: boolean}).isFatalBatch) ||
            /ZeroGPU|10-chants-per-day|HF_TOKEN/i.test(msg);
          if (isFatalBatch) {
            setBatchMessage(msg);
            setRuntimeById((prev) => {
              const next = {...prev};
              for (const rem of targets.slice(idx + 1)) {
                if (next[rem.id]?.status === 'queued') next[rem.id] = {status: 'idle'};
              }
              return next;
            });
            break;
          }
        }
      }

      setIsBatchRunning(false);
      setBatchProgress(null);
      if (!controller.signal.aborted) {
        if (done === targets.length) {
          setBatchMessage(`Completed all ${done} ślokas. Ready for playback and export.`);
        } else if (
          firstError &&
          !/ZeroGPU|10-chants-per-day|HF_TOKEN/i.test(firstError)
        ) {
          setBatchMessage(`Recited ${done} of ${targets.length} ślokas. Error: ${firstError}`);
        }
      }
    },
    [isBatchRunning, enqueueVerseRender]
  );

  const handleStartOrStopBatch = useCallback(async () => {
    const targets = verses.filter(
      (v) => v.selected && resolvedRuntime[v.id]?.status !== 'ready'
    );
    await runBatchTargets(targets);
  }, [verses, resolvedRuntime, runBatchTargets]);

  const handleRetryFailed = useCallback(async () => {
    const failedTargets = verses.filter((v) => resolvedRuntime[v.id]?.status === 'error');
    await runBatchTargets(failedTargets);
  }, [verses, resolvedRuntime, runBatchTargets]);

  const handleEditVerseText = (index: number, newText: string) => {
    const normalizedSingle = newText.trim().replace(/\r?\n\s*\r?\n+/g, '\n');
    const updated = verses.map((v) => (v.index === index ? normalizedSingle : v.text));
    setRawText(updated.join('\n\n'));
    setRuntimeById((prev) => {
      const next = {...prev};
      delete next[`shloka-${index}`];
      return next;
    });
  };

  const handleUploadTextFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setRawText(content);
      setManualMeters({});
      setBulkMeterValue('__auto__');
      setHasInitializedSelection(false);
      setBatchMessage(`Loaded text from ${file.name}.`);
    } finally {
      e.target.value = '';
    }
  };

  const handleImportAudioBatch = useCallback(
    async (rawFiles: FileList | File[]) => {
      const files = Array.from(rawFiles);
      if (files.length === 0) return;

      // Support dropping a plain .txt file directly onto the panel
      const textFiles = files.filter((f) => /\.(txt|text)$/i.test(f.name));
      const audioOrZipFiles = files.filter(
        (f) => isSupportedAudioFilename(f.name) || isZipFilename(f.name)
      );

      if (textFiles.length > 0 && audioOrZipFiles.length === 0) {
        const content = await textFiles[0].text();
        setRawText(content);
        setManualMeters({});
        setBulkMeterValue('__auto__');
        setHasInitializedSelection(false);
        setBatchMessage(`Loaded text from ${textFiles[0].name}.`);
        return;
      }

      if (verses.length === 0) {
        setBatchMessage('Paste your ślokas first so imported audio clips can match #1–#N.');
        return;
      }

      if (audioOrZipFiles.length === 0) {
        setBatchMessage('Select .wav, .mp3, .ogg, .m4a audio files or a .zip archive.');
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsBatchRunning(true);
      setBatchMessage('Reading audio files…');

      try {
        interface PendingAudioEntry {
          name: string;
          readBuffer: () => Promise<ArrayBuffer>;
        }
        const entries: PendingAudioEntry[] = [];

        for (const f of audioOrZipFiles) {
          if (controller.signal.aborted) break;
          if (isZipFilename(f.name)) {
            const zip = await JSZip.loadAsync(await f.arrayBuffer());
            for (const [entryName, zipObj] of Object.entries(zip.files)) {
              if (!zipObj.dir && isSupportedAudioFilename(entryName)) {
                entries.push({
                  name: entryName,
                  readBuffer: () => zipObj.async('arraybuffer'),
                });
              }
            }
          } else if (isSupportedAudioFilename(f.name)) {
            entries.push({
              name: f.name,
              readBuffer: () => f.arrayBuffer(),
            });
          }
        }

        const {matched, unmatched} = matchImportedAudioFiles(entries, verses);
        if (matched.length === 0) {
          setBatchMessage(
            entries.length === 0
              ? 'No supported audio files (.wav, .mp3, .ogg, .m4a) found.'
              : 'Could not match imported files to ślokas in the queue.'
          );
          return;
        }

        const startedAt = performance.now();
        const stagedAudio: Record<
          string,
          {samples: Float32Array; sampleRate: number; statusText: string}
        > = {};
        let importedCount = 0;
        let failedDecodeCount = 0;

        for (let i = 0; i < matched.length; i++) {
          if (controller.signal.aborted) break;
          const {entry, verse} = matched[i];
          const avgSec =
            importedCount > 0 ? (performance.now() - startedAt) / 1000 / importedCount : null;
          const etaSec = avgSec !== null ? avgSec * (matched.length - importedCount) : null;
          setBatchProgress({
            done: importedCount,
            total: matched.length,
            currentIndex: verse.index,
            etaSec,
          });
          setBatchMessage(
            `Importing śloka #${verse.index} (${importedCount + 1} of ${matched.length})${
              etaSec !== null ? ` · ${formatEta(etaSec)}` : ''
            }`
          );

          const targetMeter =
            verse.manualMeter === '__auto__' ? verse.meter.bankKey : verse.manualMeter;
          const cacheKey = audioCacheKey(verse.text, targetMeter);

          try {
            const buf = await entry.readBuffer();
            const res = await decodeAudioBufferTo24kNormalized(buf, `Imported · ${targetMeter}`);
            await saveAudioEntry({
              key: cacheKey,
              samples: res.samples,
              sampleRate: res.sampleRate,
              statusText: res.statusText,
            });
            stagedAudio[cacheKey] = {
              samples: res.samples,
              sampleRate: res.sampleRate,
              statusText: res.statusText,
            };
            importedCount += 1;

            if (Object.keys(stagedAudio).length >= 8 || i === matched.length - 1) {
              const flushCopy = {...stagedAudio};
              setAudioByKey((prev) => ({...prev, ...flushCopy}));
              for (const k of Object.keys(stagedAudio)) delete stagedAudio[k];
              await new Promise((r) => setTimeout(r, 0));
            }
          } catch {
            failedDecodeCount += 1;
            setRuntimeById((prev) => ({
              ...prev,
              [verse.id]: {status: 'error', error: `Could not decode ${entry.name}.`},
            }));
          }
        }

        if (Object.keys(stagedAudio).length > 0) {
          setAudioByKey((prev) => ({...prev, ...stagedAudio}));
        }

        if (!controller.signal.aborted) {
          const extras: string[] = [];
          if (failedDecodeCount > 0) extras.push(`${failedDecodeCount} failed to decode`);
          if (unmatched.length > 0) extras.push(`${unmatched.length} unmatched`);
          setBatchMessage(
            `Imported ${importedCount} audio clips matched to ślokas${
              extras.length > 0 ? ` (${extras.join(', ')})` : ''
            }. Ready for Tanpura mix & MP3 export.`
          );
        }
      } catch (err) {
        setBatchMessage(err instanceof Error ? err.message : 'Audio import failed.');
      } finally {
        setIsBatchRunning(false);
        setBatchProgress(null);
      }
    },
    [verses]
  );

  const handleUploadAudioFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    try {
      if (files && files.length > 0) {
        await handleImportAudioBatch(files);
      }
    } finally {
      e.target.value = '';
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const base = hasInitializedSelection ? new Set(prev) : new Set(verses.map((v) => v.id));
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
    setHasInitializedSelection(true);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(verses.map((v) => v.id)));
    setHasInitializedSelection(true);
  };

  const handleSelectNone = () => {
    setSelectedIds(new Set());
    setHasInitializedSelection(true);
  };

  const handleBulkMeter = (meterId: MeterOptionId) => {
    setBulkMeterValue(meterId);
    const next: Record<string, string> = {};
    for (const v of verses) next[v.id] = meterId;
    setManualMeters(next);
  };

  const handleTogglePlay = (verse: ParsedShloka) => {
    if (playingVerseId === verse.id) {
      stopPlayback();
      return;
    }
    const rt = resolvedRuntime[verse.id];
    if (!rt?.samples || !rt.sampleRate) return;

    const {tanpura, swaramandal} = getLoopsForVerse(rt.samples, rt.sampleRate);
    const audioToPlay = mixAccompanimentWithVoice(rt.samples, rt.sampleRate, {
      tanpuraLoop: tanpura,
      tanpuraDb,
      swaramandalLoop: swaramandal,
      swaramandalDb,
      introSec: 0,
      outroSec: 0.35,
    });
    playPcm(audioToPlay, rt.sampleRate, false);
    setPlayingVerseId(verse.id);
  };

  const handleTestTanpura = () => {
    if (isTanpuraPreviewPlaying) {
      stopPlayback();
      return;
    }
    const tLoop = synthesizeJawariTanpura(activeSaHz, activeRatio, 24000, 5.2, 1);
    const sLoop =
      swaramandalEnabled && ragaId !== 'none'
        ? synthesizeRagaSwaramandal(activeSaHz, ragaId, 24000, 5.2, 1)
        : null;

    if (!sLoop) {
      playPcm(tLoop, 24000, true);
      setIsTanpuraPreviewPlaying(true);
      return;
    }

    const preview = new Float32Array(tLoop.length);
    const swaraGain = Math.pow(10, (swaramandalDb - tanpuraDb) / 20);
    let peak = 0;
    for (let i = 0; i < tLoop.length; i++) {
      const v = (tanpuraEnabled ? tLoop[i] : 0) + sLoop[i % sLoop.length] * swaraGain;
      preview[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    if (peak > 0.92) {
      const scale = 0.92 / peak;
      for (let i = 0; i < preview.length; i++) preview[i] *= scale;
    }
    playPcm(preview, 24000, true);
    setIsTanpuraPreviewPlaying(true);
  };

  const handleTogglePreviewMerged = () => {
    if (isMergedPreviewPlaying) {
      stopPlayback();
      return;
    }
    const readyVerses = verses.filter(
      (v) => v.selected && resolvedRuntime[v.id]?.status === 'ready' && resolvedRuntime[v.id]?.samples
    );
    if (readyVerses.length === 0) return;

    const sr = resolvedRuntime[readyVerses[0].id].sampleRate || 24000;
    const clips = readyVerses.map((v) => resolvedRuntime[v.id].samples!);
    const mergedVoice = mergeVoiceClips(clips, sr, pauseMs);
    const previewAudio = mixAccompanimentWithVoice(mergedVoice, sr, {
      tanpuraLoop,
      tanpuraDb,
      swaramandalLoop,
      swaramandalDb,
      introSec: 1.0,
      outroSec: 1.5,
    });

    playPcm(previewAudio, sr, false);
    setIsMergedPreviewPlaying(true);
    setMergedPreviewTotalSec(previewAudio.length / sr);
  };

  const handleDownloadSingle = async (verse: ParsedShloka, format: 'mp3' | 'wav') => {
    const rt = resolvedRuntime[verse.id];
    if (!rt?.samples || !rt.sampleRate) return;
    setIsExporting(true);
    setExportMessage(`Encoding śloka #${verse.index} as ${format.toUpperCase()}…`);
    try {
      const {tanpura, swaramandal} = getLoopsForVerse(rt.samples, rt.sampleRate);
      const out = mixAccompanimentWithVoice(rt.samples, rt.sampleRate, {
        tanpuraLoop: tanpura,
        tanpuraDb,
        swaramandalLoop: swaramandal,
        swaramandalDb,
        introSec: 0,
        outroSec: 0.35,
      });
      const meterName = verse.manualMeter === '__auto__' ? verse.meter.bankKey : verse.manualMeter;
      const {blob, ext} = await encodeAudioFile(out, rt.sampleRate, format, {
        bitrate: mp3Bitrate,
        title: `Śloka #${String(verse.index).padStart(3, '0')} (${meterName})`,
        track: `${verse.index}/${verses.length}`,
        album: 'Chandaḥsvara',
      });
      triggerBlobDownload(blob, `shloka_${String(verse.index).padStart(3, '0')}.${ext}`);
      setExportMessage('');
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadMerged = async (format: 'mp3' | 'wav') => {
    const readyVerses = verses.filter(
      (v) => v.selected && resolvedRuntime[v.id]?.status === 'ready' && resolvedRuntime[v.id]?.samples
    );
    if (readyVerses.length === 0) return;

    setIsExporting(true);
    setExportMessage(`Merging ${readyVerses.length} ślokas into one ${format.toUpperCase()}…`);
    try {
      const sr = resolvedRuntime[readyVerses[0].id].sampleRate || 24000;
      const clips = readyVerses.map((v) => resolvedRuntime[v.id].samples!);
      const mergedVoice = mergeVoiceClips(clips, sr, pauseMs);
      const finalAudio = mixAccompanimentWithVoice(mergedVoice, sr, {
        tanpuraLoop,
        tanpuraDb,
        swaramandalLoop,
        swaramandalDb,
        introSec: 2.0,
        outroSec: 3.0,
      });

      const {blob, ext} = await encodeAudioFile(finalAudio, sr, format, {
        bitrate: mp3Bitrate,
        title: `Merged Stotra (${readyVerses.length} Ślokas)`,
        track: '1/1',
        album: 'Chandaḥsvara',
      });
      triggerBlobDownload(blob, `chandahsvara_merged_${readyVerses.length}_shlokas.${ext}`);
      setExportMessage(`Downloaded merged ${ext.toUpperCase()} (${readyVerses.length} ślokas).`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'Merge export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  // 3-worker parallel encoding pool makes 100-shloka ZIP export ~3x faster
  const handleDownloadZip = async (format: 'mp3' | 'wav') => {
    const readyVerses = verses.filter(
      (v) => v.selected && resolvedRuntime[v.id]?.status === 'ready' && resolvedRuntime[v.id]?.samples
    );
    if (readyVerses.length === 0) return;

    setIsExporting(true);
    try {
      const zip = new JSZip();
      let packed = 0;
      let cursor = 0;
      const concurrency = format === 'mp3' ? Math.min(3, readyVerses.length) : 1;

      const worker = async () => {
        while (cursor < readyVerses.length) {
          const i = cursor++;
          const v = readyVerses[i];
          const rt = resolvedRuntime[v.id];
          const {tanpura, swaramandal} = getLoopsForVerse(rt.samples!, rt.sampleRate!);
          const out = mixAccompanimentWithVoice(rt.samples!, rt.sampleRate!, {
            tanpuraLoop: tanpura,
            tanpuraDb,
            swaramandalLoop: swaramandal,
            swaramandalDb,
            introSec: 0,
            outroSec: 0.35,
          });
          const meterName = v.manualMeter === '__auto__' ? v.meter.bankKey : v.manualMeter;
          const {blob, ext} = await encodeAudioFile(out, rt.sampleRate!, format, {
            bitrate: mp3Bitrate,
            title: `Śloka #${String(v.index).padStart(3, '0')} (${meterName})`,
            track: `${i + 1}/${readyVerses.length}`,
            album: 'Chandaḥsvara',
          });
          zip.file(`shloka_${String(v.index).padStart(3, '0')}.${ext}`, blob);
          packed += 1;
          setExportMessage(`Packing ${format.toUpperCase()} ${packed} of ${readyVerses.length} into ZIP…`);
        }
      };

      await Promise.all(Array.from({length: concurrency}, () => worker()));
      setExportMessage('Finalizing ZIP archive…');
      const zipBlob = await zip.generateAsync({type: 'blob'});
      triggerBlobDownload(zipBlob, `chandahsvara_${readyVerses.length}_shlokas_${format}.zip`);
      setExportMessage(`Downloaded ZIP of ${readyVerses.length} individual ${format.toUpperCase()} files.`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'ZIP export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearAudioCache = async () => {
    stopPlayback();
    await clearAllAudioEntries();
    setAudioByKey({});
    setRuntimeById({});
    setBatchMessage('Cleared saved audio cache.');
  };

  const selectedCount = verses.filter((v) => v.selected).length;
  const readyCount = verses.filter((v) => resolvedRuntime[v.id]?.status === 'ready').length;
  const failedCount = verses.filter((v) => resolvedRuntime[v.id]?.status === 'error').length;
  const pendingCount = verses.length - readyCount;

  const selectedReadyVerses = verses.filter(
    (v) => v.selected && resolvedRuntime[v.id]?.status === 'ready'
  );
  const selectedReadyCount = selectedReadyVerses.length;
  const totalMergedDurationSec = useMemo(() => {
    if (selectedReadyVerses.length === 0) return 0;
    const voiceSec = selectedReadyVerses.reduce(
      (sum, v) => sum + (resolvedRuntime[v.id]?.durationSec || 0),
      0
    );
    const pauseTotalSec = ((selectedReadyVerses.length - 1) * pauseMs) / 1000;
    const hasBg = Boolean(tanpuraLoop || swaramandalLoop);
    const tanpuraPadSec = hasBg ? 5.0 : 0;
    return voiceSec + pauseTotalSec + tanpuraPadSec;
  }, [selectedReadyVerses, resolvedRuntime, pauseMs, tanpuraLoop, swaramandalLoop]);

  const filteredVerses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return verses.filter((v) => {
      const st = resolvedRuntime[v.id]?.status || 'idle';
      if (verseFilter === 'selected' && !v.selected) return false;
      if (verseFilter === 'ready' && st !== 'ready') return false;
      if (verseFilter === 'pending' && st === 'ready') return false;
      if (q) {
        const meterLabel = v.manualMeter === '__auto__' ? v.meter.displayName : v.manualMeter;
        const idxStr = String(v.index);
        const matches =
          idxStr.includes(q.replace(/^#/, '')) ||
          v.text.toLowerCase().includes(q) ||
          meterLabel.toLowerCase().includes(q) ||
          v.meter.detectedScript.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [verses, resolvedRuntime, verseFilter, searchQuery]);

  return (
    <div id="top" className="min-h-screen overflow-x-clip bg-[#FAFAFA] pb-16 text-[#0F172A]">
      <Header
        isBatchRunning={isBatchRunning}
        selectedCount={selectedCount}
        onStartOrStopBatch={handleStartOrStopBatch}
      />

      <main className="mx-auto max-w-6xl space-y-10 px-4 pt-7 sm:px-6 lg:px-8 lg:pt-9">
        {/* Compact Editorial Masthead */}
        <section className="border-b border-[#E4E4E7] pb-6">
          <div className="max-w-3xl">
            <p className="font-indic text-sm font-medium text-[#1E3A8A]">
              छन्दःस्वर — श्लोकपारायणम्
            </p>
            <h1
              className="font-display mt-1 text-3xl font-semibold tracking-tight text-[#0F172A] sm:text-4xl"
              style={{textWrap: 'balance'}}
            >
              Sanskrit Śloka Chanting &amp; Tanpura
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#52525B] sm:text-[15px]">
              Paste Sanskrit ślokas across Indic scripts or IAST. Detect classical <em className="mr-0.5">vṛtta</em> meters and <em className="mr-0.5">yati</em> caesura, chant with Vāgdhenu&apos;s meter-conditioned <em className="mr-0.5">pārāyaṇa</em> voice and tuned Jawari Tanpura, and export individual or merged MP3s.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-[#52525B]">Sample stotras:</span>
            {SAMPLE_STOTRAS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => {
                  setRawText(sample.text);
                  setManualMeters({});
                  setBulkMeterValue('__auto__');
                  setHasInitializedSelection(false);
                }}
                className="min-h-[34px] rounded-lg border border-[#D4D4D8] bg-white px-3 py-1 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#F4F4F5] whitespace-nowrap shrink-0"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </section>

        {/* Primary Workspace: Paste & Verse Queue */}
        <section id="reciter" className="grid scroll-mt-20 gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Sticky Editor & Global Settings */}
          <div className="min-w-0 lg:col-span-5 lg:sticky lg:top-20">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files?.length) {
                  void handleImportAudioBatch(e.dataTransfer.files);
                }
              }}
              className={`rounded-xl border bg-white p-5 transition-colors ${
                isDragOver ? 'border-[#1E3A8A] bg-[#EFF6FF]/40' : 'border-[#E4E4E7]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="shloka-batch-input"
                  className="font-display text-xl font-semibold text-[#0F172A]"
                >
                  Paste Ślokas
                </label>
                <span className="font-mono-num text-xs font-medium text-[#52525B]">
                  {verses.length} detected
                </span>
              </div>
              <p className="mt-1 text-xs text-[#52525B]">
                Separate verses with blank lines or <code className="font-mono-num">॥</code>. Drop a <code className="font-mono-num">.txt</code> or Colab audio <code className="font-mono-num">.zip</code>.
              </p>

              <textarea
                id="shloka-batch-input"
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setHasInitializedSelection(false);
                }}
                rows={8}
                placeholder="Paste one or up to 100+ Sanskrit ślokas here in any script…"
                className="font-indic mt-3 w-full rounded-lg border border-[#D4D4D8] bg-[#FAFAFA] p-3.5 text-[15px] leading-relaxed text-[#0F172A] placeholder:text-[#71717A] focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
              />

              <div className="mt-3.5">
                <label htmlFor="bulk-meter-select" className="block text-xs font-medium text-[#52525B]">
                  Set All Meters (Vāgdhenu Chant Override)
                </label>
                <select
                  id="bulk-meter-select"
                  value={bulkMeterValue}
                  onChange={(e) => handleBulkMeter(e.target.value as MeterOptionId)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-[#D4D4D8] bg-[#FAFAFA] px-2.5 py-1.5 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
                >
                  {CHANDAS_METERS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-2.5 text-[11px] leading-relaxed text-[#52525B]">
                Chanted using Vāgdhenu&apos;s meter-conditioned Sanskrit <em className="mr-0.5">pārāyaṇa</em> voice (IISc Bengaluru) with automatic per-<em className="mr-0.5">vṛtta</em> melody matching.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#E4E4E7] pt-4 sm:flex sm:flex-wrap sm:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.text,text/plain"
                  onChange={(e) => void handleUploadTextFile(e)}
                  className="hidden"
                  aria-label="Upload text file of shlokas"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F4F4F5] whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5 text-[#1E3A8A]" />
                  Upload .txt
                </button>

                <input
                  ref={audioImportInputRef}
                  type="file"
                  multiple
                  accept=".wav,.mp3,.ogg,.m4a,.flac,.aac,.webm,.zip,audio/*"
                  onChange={(e) => void handleUploadAudioFiles(e)}
                  className="hidden"
                  aria-label="Import pre-rendered shloka audio files or Colab zip"
                />
                <button
                  type="button"
                  disabled={isBatchRunning}
                  onClick={() => audioImportInputRef.current?.click()}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-[#1E3A8A]/30 bg-[#EFF6FF] px-2.5 py-1.5 text-xs font-semibold text-[#1E3A8A] hover:bg-[#DBEAFE] disabled:opacity-50 whitespace-nowrap"
                >
                  <FileAudio className="h-3.5 w-3.5" />
                  Import Audio
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRawText('');
                    setManualMeters({});
                    setBulkMeterValue('__auto__');
                  }}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear Text
                </button>

                <button
                  type="button"
                  onClick={handleClearAudioCache}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] whitespace-nowrap sm:ml-auto"
                >
                  Clear Audio ({Object.keys(audioByKey).length})
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Śloka Queue */}
          <div id="verses" className="min-w-0 space-y-4 lg:col-span-7">
            <div className="border-b border-[#E4E4E7] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
                    Śloka Queue ({verses.length})
                  </h2>
                  <p className="mt-0.5 text-xs text-[#52525B]">
                    <span className="font-mono-num">{selectedCount}</span> selected
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono-num">{readyCount}</span> recited
                    {failedCount > 0 && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-num font-medium text-[#991B1B]">
                          {failedCount} failed
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-3 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F4F4F5] whitespace-nowrap"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-[#1E3A8A]" />
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectNone}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-3 py-1 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] whitespace-nowrap"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Deselect
                  </button>
                  <a
                    href="#export"
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-3 py-1 text-xs font-semibold text-[#1E3A8A] hover:bg-[#F4F4F5] whitespace-nowrap"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Export ({selectedReadyCount})
                  </a>
                </div>
              </div>

              {verses.length > 0 && (
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div
                    className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-[#F4F4F5] p-1"
                    role="tablist"
                    aria-label="Filter ślokas"
                  >
                    {(
                      [
                        {id: 'all', label: `All (${verses.length})`},
                        {id: 'selected', label: `Selected (${selectedCount})`},
                        {id: 'ready', label: `Ready (${readyCount})`},
                        {id: 'pending', label: `Pending (${pendingCount})`},
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={verseFilter === tab.id}
                        onClick={() => setVerseFilter(tab.id)}
                        className={`min-h-[30px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          verseFilter === tab.id
                            ? 'bg-white text-[#0F172A] shadow-xs'
                            : 'text-[#52525B] hover:text-[#0F172A]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter #, text, meter"
                        aria-label="Search shlokas by number, word, or meter"
                        className="min-h-[34px] w-48 rounded-lg border border-[#D4D4D8] bg-white pl-8 pr-7 py-1 text-xs text-[#0F172A] placeholder:text-[#71717A] focus:border-[#1E3A8A] focus:outline-none sm:w-56"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#0F172A]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div
                      className="inline-flex items-center gap-1 rounded-lg bg-[#F4F4F5] p-1"
                      role="group"
                      aria-label="List density"
                    >
                      <button
                        type="button"
                        onClick={() => setDensity('standard')}
                        className={`min-h-[28px] rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          density === 'standard'
                            ? 'bg-white text-[#0F172A] shadow-xs'
                            : 'text-[#52525B] hover:text-[#0F172A]'
                        }`}
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setDensity('compact')}
                        className={`min-h-[28px] rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          density === 'compact'
                            ? 'bg-white text-[#0F172A] shadow-xs'
                            : 'text-[#52525B] hover:text-[#0F172A]'
                        }`}
                      >
                        Compact
                      </button>
                    </div>

                    {failedCount > 0 && !isBatchRunning && (
                      <button
                        type="button"
                        onClick={() => void handleRetryFailed()}
                        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-1 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retry Failed ({failedCount})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {(batchProgress || batchMessage) && (
              <div
                role="status"
                className="rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-sm text-[#0F172A]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
                  <span>{batchMessage}</span>
                  {batchProgress && (
                    <span className="font-mono-num text-[#1E3A8A]">
                      {batchProgress.done} / {batchProgress.total}
                    </span>
                  )}
                </div>
                {batchProgress && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E4E4E7]">
                    <div
                      className="h-full bg-[#1E3A8A] transition-[width] duration-200"
                      style={{
                        width: `${Math.round(
                          ((batchProgress.done + 0.25) / Math.max(1, batchProgress.total)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {verses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D4D4D8] bg-white p-10 text-center">
                <p className="font-display text-2xl font-medium text-[#0F172A]">
                  No ślokas pasted yet
                </p>
                <p className="mt-2 text-sm text-[#52525B]">
                  Paste Sanskrit verses on the left, upload a .txt file, or load a sample stotra above.
                </p>
              </div>
            ) : filteredVerses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D4D4D8] bg-white p-8 text-center">
                <p className="text-sm text-[#52525B]">
                  No ślokas match the current filter or search.
                </p>
              </div>
            ) : density === 'compact' ? (
              <div className="overflow-hidden rounded-xl border border-[#E4E4E7] divide-y divide-[#E4E4E7] bg-white">
                {filteredVerses.map((verse) => (
                  <VerseCard
                    key={verse.id}
                    verse={verse}
                    runtime={resolvedRuntime[verse.id] || {status: 'idle'}}
                    isPlaying={playingVerseId === verse.id}
                    playbackElapsedSec={playingVerseId === verse.id ? playbackElapsedSec : 0}
                    isExporting={isExporting}
                    compact
                    onToggleSelect={handleToggleSelect}
                    onChangeMeter={(id, meter) =>
                      setManualMeters((prev) => ({...prev, [id]: meter}))
                    }
                    onEditVerseText={handleEditVerseText}
                    onRenderSingle={(v) => void enqueueVerseRender(v).catch(() => undefined)}
                    onTogglePlay={handleTogglePlay}
                    onDownloadSingle={(v, fmt) => void handleDownloadSingle(v, fmt)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVerses.map((verse) => (
                  <VerseCard
                    key={verse.id}
                    verse={verse}
                    runtime={resolvedRuntime[verse.id] || {status: 'idle'}}
                    isPlaying={playingVerseId === verse.id}
                    playbackElapsedSec={playingVerseId === verse.id ? playbackElapsedSec : 0}
                    isExporting={isExporting}
                    onToggleSelect={handleToggleSelect}
                    onChangeMeter={(id, meter) =>
                      setManualMeters((prev) => ({...prev, [id]: meter}))
                    }
                    onEditVerseText={handleEditVerseText}
                    onRenderSingle={(v) => void enqueueVerseRender(v).catch(() => undefined)}
                    onTogglePlay={handleTogglePlay}
                    onDownloadSingle={(v, fmt) => void handleDownloadSingle(v, fmt)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Step 2: Jawari Tanpura & Raga Swaramandal Studio */}
        <TanpuraPanel
          tanpuraEnabled={tanpuraEnabled}
          onToggleTanpura={setTanpuraEnabled}
          tanpuraDb={tanpuraDb}
          onChangeDb={setTanpuraDb}
          tuningOption={tuningOption}
          resolvedTuning={resolvedTuning}
          onChangeTuningOption={setTuningOption}
          tonicScope={tonicScope}
          onChangeTonicScope={setTonicScope}
          pauseMs={pauseMs}
          onChangePauseMs={setPauseMs}
          scaleAnalysis={scaleAnalysis}
          manualSaHz={manualSaHz}
          onSelectSaHz={setManualSaHz}
          onTestTanpura={handleTestTanpura}
          isTanpuraPreviewPlaying={isTanpuraPreviewPlaying}
          ragaId={ragaId}
          onChangeRagaId={setRagaId}
          swaramandalEnabled={swaramandalEnabled}
          onToggleSwaramandal={setSwaramandalEnabled}
          swaramandalDb={swaramandalDb}
          onChangeSwaramandalDb={setSwaramandalDb}
        />

        {/* Step 3: Download & Merge Studio */}
        <ExportBar
          readyCount={readyCount}
          selectedReadyCount={selectedReadyCount}
          totalDurationSec={totalMergedDurationSec}
          isExporting={isExporting}
          isPreviewingMerged={isMergedPreviewPlaying}
          previewElapsedSec={isMergedPreviewPlaying ? playbackElapsedSec : 0}
          previewTotalSec={mergedPreviewTotalSec}
          mp3Bitrate={mp3Bitrate}
          onChangeMp3Bitrate={setMp3Bitrate}
          exportMessage={exportMessage}
          accompanimentSummary={
            !tanpuraEnabled && (!swaramandalEnabled || ragaId === 'none')
              ? 'Dry chant'
              : [
                  tanpuraEnabled ? 'Jawari Tanpura' : null,
                  swaramandalEnabled && ragaId !== 'none'
                    ? `${ragaSpec.label} Swaramandal`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' + ')
          }
          onTogglePreviewMerged={handleTogglePreviewMerged}
          onDownloadMerged={(fmt) => void handleDownloadMerged(fmt)}
          onDownloadZip={(fmt) => void handleDownloadZip(fmt)}
        />

        {/* Credits Section */}
        <CreditsSection />
      </main>
    </div>
  );
}
