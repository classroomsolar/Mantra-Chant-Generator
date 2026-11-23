import React, {useState} from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import {CHANDAS_METERS, MeterOptionId, ParsedShloka} from '../lib/sanskritMeter';

export type VerseRenderStatus = 'idle' | 'queued' | 'rendering' | 'ready' | 'error';

export interface VerseRuntimeState {
  status: VerseRenderStatus;
  error?: string;
  samples?: Float32Array;
  sampleRate?: number;
  durationSec?: number;
  statusText?: string;
}

interface VerseCardProps {
  verse: ParsedShloka;
  runtime: VerseRuntimeState;
  isPlaying: boolean;
  playbackElapsedSec?: number;
  isExporting: boolean;
  compact?: boolean;
  onToggleSelect: (id: string) => void;
  onChangeMeter: (id: string, meter: MeterOptionId) => void;
  onEditVerseText: (index: number, newText: string) => void;
  onRenderSingle: (verse: ParsedShloka) => void;
  onTogglePlay: (verse: ParsedShloka) => void;
  onDownloadSingle: (verse: ParsedShloka, format: 'mp3' | 'wav') => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export const VerseCard: React.FC<VerseCardProps> = ({
  verse,
  runtime,
  isPlaying,
  playbackElapsedSec = 0,
  isExporting,
  compact = false,
  onToggleSelect,
  onChangeMeter,
  onEditVerseText,
  onRenderSingle,
  onTogglePlay,
  onDownloadSingle,
}) => {
  const [showPattern, setShowPattern] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(verse.text);

  const effectiveMeter =
    verse.manualMeter === '__auto__' ? verse.meter.displayName : verse.manualMeter;

  const statusLabel =
    runtime.status === 'ready'
      ? isPlaying && runtime.durationSec
        ? `Playing ${formatClock(playbackElapsedSec)} / ${formatClock(runtime.durationSec)}`
        : `Ready · ${runtime.durationSec?.toFixed(1)}s`
      : runtime.status === 'rendering'
      ? 'Reciting…'
      : runtime.status === 'queued'
      ? 'Queued'
      : runtime.status === 'error'
      ? 'Failed'
      : 'Pending';

  const playbackRatio =
    isPlaying && runtime.durationSec && runtime.durationSec > 0
      ? Math.min(1, Math.max(0, playbackElapsedSec / runtime.durationSec))
      : 0;

  const handleSaveEdit = () => {
    const cleaned = draftText.trim();
    if (cleaned) {
      onEditVerseText(verse.index, cleaned);
    }
    setIsEditing(false);
  };

  return (
    <article
      data-testid={`verse-card-${verse.index}`}
      className={`transition-colors ${
        compact
          ? `${verse.selected ? 'bg-white' : 'bg-[#FAFAFA]'} px-4 py-3.5 sm:px-5`
          : `rounded-xl border ${
              verse.selected ? 'border-[#D4D4D8] bg-white' : 'border-[#E4E4E7] bg-[#FAFAFA]'
            } p-4 sm:p-5`
      }`}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={verse.selected}
          aria-label={`Select shloka ${verse.index}`}
          onClick={() => onToggleSelect(verse.id)}
          className="-ml-1.5 mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1E3A8A]"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
              verse.selected
                ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                : 'border-[#A1A1AA] bg-white text-transparent hover:border-[#1E3A8A]'
            }`}
          >
            <Check className="h-3.5 w-3.5 stroke-[2.75]" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#52525B]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono-num font-semibold text-[#0F172A]">
                #{String(verse.index).padStart(2, '0')}
              </span>
              <span aria-hidden="true">·</span>
              <span>{verse.meter.detectedScript}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{verse.meter.syllableCount} syl</span>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1 ${
                  runtime.status === 'ready'
                    ? 'font-medium text-[#166534]'
                    : runtime.status === 'error'
                    ? 'font-medium text-[#991B1B]'
                    : runtime.status === 'rendering' || runtime.status === 'queued'
                    ? 'font-medium text-[#1E3A8A]'
                    : 'text-[#52525B]'
                }`}
              >
                {runtime.status === 'ready' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {(runtime.status === 'rendering' || runtime.status === 'queued') && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {runtime.status === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
                {statusLabel}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraftText(verse.text);
                  setIsEditing((e) => !e);
                }}
                aria-label={`Edit shloka ${verse.index}`}
                className="inline-flex min-h-[28px] items-center gap-1 text-xs font-medium text-[#52525B] hover:text-[#0F172A] whitespace-nowrap"
              >
                {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3 w-3" />}
                <span>{isEditing ? 'Cancel' : 'Edit'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPattern((v) => !v)}
                aria-expanded={showPattern}
                className="inline-flex min-h-[28px] items-center gap-1 text-xs font-medium text-[#1E3A8A] hover:underline underline-offset-2 whitespace-nowrap shrink-0"
              >
                <span>{effectiveMeter}</span>
                {showPattern ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="mt-2.5 space-y-2">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={4}
                aria-label={`Edit text for shloka ${verse.index}`}
                className="font-indic w-full rounded-lg border border-[#1E3A8A] bg-[#FAFAFA] p-2.5 text-base leading-relaxed text-[#0F172A] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="inline-flex min-h-[34px] items-center rounded-lg bg-[#1E3A8A] px-3 py-1 text-xs font-semibold text-white hover:bg-[#172554]"
                >
                  Save Verse
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="inline-flex min-h-[34px] items-center rounded-lg border border-[#D4D4D8] bg-white px-3 py-1 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`font-indic whitespace-pre-line text-[#0F172A] ${
                compact
                  ? 'mt-1.5 text-base leading-[1.65]'
                  : 'mt-2.5 text-lg leading-[1.85] sm:text-[19px]'
              }`}
            >
              {verse.text}
            </p>
          )}

          {isPlaying && (
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-[#E4E4E7]">
              <div
                className="h-full bg-[#1E3A8A] transition-[width] duration-200"
                style={{width: `${Math.round(playbackRatio * 100)}%`}}
              />
            </div>
          )}

          {showPattern && (
            <div className="mt-3 border-t border-[#E4E4E7] pt-3 text-xs text-[#52525B]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Meter: <strong className="text-[#0F172A]">{verse.meter.displayName}</strong>
                  {verse.meter.padaLength ? ` (${verse.meter.padaLength} syl/pāda)` : ''}
                  {verse.meter.yati ? ` · Yati ${verse.meter.yati}` : ''}
                </span>
                <span>L = laghu (short) · G = guru (heavy)</span>
              </div>

              {verse.meter.syllables.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-[#F4F4F5] pt-2">
                  {(() => {
                    const groups: Array<typeof verse.meter.syllables> = [];
                    let current: typeof verse.meter.syllables = [];
                    const padaLen = verse.meter.padaLength;
                    verse.meter.syllables.forEach((syl, idx) => {
                      current.push(syl);
                      const atFixedPada = padaLen && current.length === padaLen;
                      if (syl.isPadaFinal || atFixedPada || idx === verse.meter.syllables.length - 1) {
                        groups.push(current);
                        current = [];
                      }
                    });
                    return groups.map((grp, pIdx) => (
                      <div key={pIdx} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-mono-num text-[11px] font-medium text-[#52525B] shrink-0">
                          P{pIdx + 1}:
                        </span>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          {grp.map((s, sIdx) => (
                            <span
                              key={sIdx}
                              title={`${s.iast} — ${s.weight === 'G' ? 'Guru' : 'Laghu'} (${s.cause.replace(/_/g, ' ')})`}
                              className="inline-flex items-baseline gap-0.5 text-[12px]"
                            >
                              <span className="text-[#0F172A]">{s.iast}</span>
                              <sup
                                className={`font-mono-num text-[10px] font-semibold ${
                                  s.weight === 'G' ? 'text-[#1E3A8A]' : 'text-[#71717A]'
                                }`}
                              >
                                {s.weight}
                              </sup>
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {verse.meter.padas.length > 0 && (
                <div className="font-mono-num mt-2 flex flex-wrap gap-x-4 gap-y-0.5 border-t border-[#F4F4F5] pt-2 text-[11px] text-[#52525B]">
                  {verse.meter.padas.map((p, i) => (
                    <span key={i}>
                      Pāda {i + 1}: <strong className="text-[#0F172A]">{p}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {runtime.status === 'error' && runtime.error && (
            <p className="mt-2.5 border-t border-[#FECACA] pt-2 text-xs text-[#991B1B]">
              {runtime.error}
            </p>
          )}

          <div className={`${compact ? 'mt-2.5' : 'mt-3.5'} flex flex-wrap items-center gap-2`}>
            <label className="sr-only" htmlFor={`meter-select-${verse.id}`}>
              Meter override for shloka {verse.index}
            </label>
            <select
              id={`meter-select-${verse.id}`}
              value={verse.manualMeter}
              onChange={(e) => onChangeMeter(verse.id, e.target.value as MeterOptionId)}
              className="min-h-[36px] max-w-[168px] rounded-lg border border-[#D4D4D8] bg-[#FAFAFA] px-2.5 py-1 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
            >
              {CHANDAS_METERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === '__auto__' ? `Auto: ${verse.meter.bankKey}` : m.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onRenderSingle(verse)}
              disabled={runtime.status === 'rendering' || runtime.status === 'queued'}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-3 py-1 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {runtime.status === 'rendering' || runtime.status === 'queued' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1E3A8A]" />
                  {runtime.status === 'queued' ? 'Queued' : 'Reciting…'}
                </>
              ) : runtime.status === 'ready' ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 text-[#52525B]" />
                  Re-recite
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 text-[#1E3A8A]" />
                  Recite
                </>
              )}
            </button>

            {runtime.status === 'ready' && (
              <>
                <button
                  type="button"
                  onClick={() => onTogglePlay(verse)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#0F172A] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#1E293B] whitespace-nowrap shrink-0"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5 fill-current" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Listen
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => onDownloadSingle(verse, 'mp3')}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1E3A8A]/25 bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1E3A8A] transition-colors hover:bg-[#DBEAFE] disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  MP3
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => onDownloadSingle(verse, 'wav')}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-3 py-1 text-xs font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5] disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  WAV
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
