import React from 'react';
import {Volume2} from 'lucide-react';
import {
  RAGA_PRESETS,
  RagaId,
  STANDARD_SHRUTIS,
  ScaleAnalysisResult,
  TanpuraTuning,
  TanpuraTuningOption,
  hzToNote,
} from '../lib/audioEngine';

const SHORT_SWARAS = ['S', 'r', 'R', 'g', 'G', 'm', 'M', 'P', 'd', 'D', 'n', 'N'];

interface TanpuraPanelProps {
  tanpuraEnabled: boolean;
  onToggleTanpura: (enabled: boolean) => void;
  tanpuraDb: number;
  onChangeDb: (db: number) => void;
  tuningOption: TanpuraTuningOption;
  resolvedTuning: TanpuraTuning;
  onChangeTuningOption: (tuning: TanpuraTuningOption) => void;
  tonicScope: 'global' | 'per-verse';
  onChangeTonicScope: (scope: 'global' | 'per-verse') => void;
  pauseMs: number;
  onChangePauseMs: (ms: number) => void;
  scaleAnalysis: ScaleAnalysisResult | null;
  manualSaHz: number | null;
  onSelectSaHz: (hz: number | null) => void;
  onTestTanpura: () => void;
  isTanpuraPreviewPlaying: boolean;
  ragaId: RagaId;
  onChangeRagaId: (raga: RagaId) => void;
  swaramandalEnabled: boolean;
  onToggleSwaramandal: (enabled: boolean) => void;
  swaramandalDb: number;
  onChangeSwaramandalDb: (db: number) => void;
}

export const TanpuraPanel: React.FC<TanpuraPanelProps> = ({
  tanpuraEnabled,
  onToggleTanpura,
  tanpuraDb,
  onChangeDb,
  tuningOption,
  resolvedTuning,
  onChangeTuningOption,
  tonicScope,
  onChangeTonicScope,
  pauseMs,
  onChangePauseMs,
  scaleAnalysis,
  manualSaHz,
  onSelectSaHz,
  onTestTanpura,
  isTanpuraPreviewPlaying,
  ragaId,
  onChangeRagaId,
  swaramandalEnabled,
  onToggleSwaramandal,
  swaramandalDb,
  onChangeSwaramandalDb,
}) => {
  const activeSa = manualSaHz ?? scaleAnalysis?.saHz ?? 130.81;
  const ragaSpec = RAGA_PRESETS[ragaId] || RAGA_PRESETS.brindavani_sarang;

  return (
    <section
      id="tanpura"
      className="scroll-mt-20 overflow-hidden rounded-xl border border-[#E4E4E7] bg-white"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4E7] px-5 py-5 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
            Jawari Tanpura &amp; Rāga Swaramandal
          </h2>
          <p className="mt-1 text-sm text-[#52525B]">
            Tracks your recitation&apos;s tonic pitch (Sa) via YIN and weaves a 4-string Jawari Tanpura plus a Just-Intonation Swaramandal harp locked to the same Sa.
          </p>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTestTanpura}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] whitespace-nowrap shrink-0"
          >
            <Volume2 className="h-4 w-4 text-[#1E3A8A]" />
            {isTanpuraPreviewPlaying ? 'Stop Drone' : 'Audition'}
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={tanpuraEnabled}
            onClick={() => onToggleTanpura(!tanpuraEnabled)}
            className={`inline-flex min-h-[40px] items-center rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] whitespace-nowrap shrink-0 ${
              tanpuraEnabled
                ? 'bg-[#1E3A8A] text-white hover:bg-[#172554]'
                : 'border border-[#D4D4D8] bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]'
            }`}
          >
            {tanpuraEnabled ? 'Tanpura: On' : 'Tanpura: Off'}
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={swaramandalEnabled}
            onClick={() => onToggleSwaramandal(!swaramandalEnabled)}
            className={`inline-flex min-h-[40px] items-center rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] whitespace-nowrap shrink-0 ${
              swaramandalEnabled
                ? 'bg-[#0F172A] text-white hover:bg-[#1E293B]'
                : 'border border-[#D4D4D8] bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]'
            }`}
          >
            {swaramandalEnabled ? 'Swaramandal: On' : 'Swaramandal: Off'}
          </button>
        </div>
      </div>

      <div className="grid divide-y divide-[#E4E4E7] md:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#52525B] whitespace-nowrap">Tonic (Sa)</span>
            <div
              className="inline-flex rounded-md bg-[#F4F4F5] p-0.5 text-[11px]"
              role="group"
              aria-label="Tonic tracking mode"
            >
              <button
                type="button"
                onClick={() => onChangeTonicScope('global')}
                className={`rounded px-2 py-0.5 font-medium transition-colors whitespace-nowrap ${
                  tonicScope === 'global'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#52525B] hover:text-[#0F172A]'
                }`}
              >
                Global
              </button>
              <button
                type="button"
                onClick={() => onChangeTonicScope('per-verse')}
                className={`rounded px-2 py-0.5 font-medium transition-colors whitespace-nowrap ${
                  tonicScope === 'per-verse'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#52525B] hover:text-[#0F172A]'
                }`}
              >
                Per-Śloka
              </button>
            </div>
          </div>

          <div className="font-mono-num mt-1.5 text-lg font-semibold text-[#0F172A] whitespace-nowrap">
            {activeSa.toFixed(1)} Hz · {hzToNote(activeSa)}
          </div>
          {scaleAnalysis && scaleAnalysis.candidates.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {scaleAnalysis.candidates.map((cand, idx) => {
                const isSelected = Math.abs(activeSa - cand.saHz) < 0.5;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectSaHz(idx === 0 && manualSaHz === null ? null : cand.saHz)}
                    className={`min-h-[30px] rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                        : 'border-[#D4D4D8] bg-[#FAFAFA] text-[#0F172A] hover:bg-[#F4F4F5]'
                    }`}
                  >
                    {cand.saHz.toFixed(0)} Hz ({Math.round(cand.weightShare * 100)}%)
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#52525B]">
              Recite at least one śloka to detect pitch automatically.
            </p>
          )}
          <label htmlFor="manual-shruti-select" className="sr-only">
            Manual tonic shruti
          </label>
          <select
            id="manual-shruti-select"
            value={manualSaHz === null ? 'auto' : String(manualSaHz)}
            onChange={(e) => {
              const v = e.target.value;
              onSelectSaHz(v === 'auto' ? null : Number(v));
            }}
            className="mt-3 min-h-[38px] w-full rounded-lg border border-[#D4D4D8] bg-[#FAFAFA] px-2.5 py-1.5 text-xs text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
          >
            <option value="auto">Auto-detect from recitation</option>
            {STANDARD_SHRUTIS.map((s) => (
              <option key={s.hz} value={String(s.hz)}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          <label htmlFor="tanpura-tuning-select" className="block text-xs font-medium text-[#52525B]">
            4-String Tuning
          </label>
          <select
            id="tanpura-tuning-select"
            value={tuningOption}
            onChange={(e) => onChangeTuningOption(e.target.value as TanpuraTuningOption)}
            className="mt-2 min-h-[40px] w-full rounded-lg border border-[#D4D4D8] bg-[#FAFAFA] px-3 py-1.5 text-sm font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
          >
            <option value="auto">Auto ({resolvedTuning})</option>
            <option value="Pa-Sa-Sa-Sa">Pa – Sa – Sa – Sa (3:2)</option>
            <option value="Ma-Sa-Sa-Sa">Ma – Sa – Sa – Sa (4:3)</option>
            <option value="Ni-Sa-Sa-Sa">Ni – Sa – Sa – Sa (15:8)</option>
          </select>
          <p className="mt-2.5 text-xs text-[#52525B]">
            {scaleAnalysis
              ? `Swaras: ${scaleAnalysis.activeSwaras.join(', ')}`
              : 'Mandra Pa/Ma/Ni, Madhya Sa (×2), Kharaj Sa.'}
          </p>
          {scaleAnalysis && (
            <div className="mt-3 flex items-end gap-1" aria-label="12-swara pitch distribution">
              {scaleAnalysis.swaraWeights.map((w, idx) => {
                const maxW = Math.max(0.05, ...scaleAnalysis.swaraWeights);
                const pct = Math.max(8, Math.round((w / maxW) * 100));
                const active = idx === 0 || w >= 0.03;
                return (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-6 w-full items-end">
                      <div
                        className={`w-full rounded-t-[2px] ${
                          active ? 'bg-[#1E3A8A]' : 'bg-[#E4E4E7]'
                        }`}
                        style={{height: `${pct}%`}}
                      />
                    </div>
                    <span className="font-mono-num text-[9px] text-[#52525B]">
                      {SHORT_SWARAS[idx]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between text-xs font-medium text-[#52525B]">
            <label htmlFor="tanpura-db-range">Tanpura Level</label>
            <span className="font-mono-num font-semibold text-[#0F172A]">
              {tanpuraDb.toFixed(1)} dB
            </span>
          </div>
          <input
            id="tanpura-db-range"
            type="range"
            min={-22}
            max={-9}
            step={0.5}
            value={tanpuraDb}
            onChange={(e) => onChangeDb(Number(e.target.value))}
            className="mt-5 w-full accent-[#1E3A8A]"
          />
          <div className="mt-2 flex justify-between text-[11px] text-[#52525B]">
            <span>Subtle (-22 dB)</span>
            <span>Present (-9 dB)</span>
          </div>
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between text-xs font-medium text-[#52525B]">
            <label htmlFor="pause-ms-range">Pause Between Ślokas</label>
            <span className="font-mono-num font-semibold text-[#0F172A]">{pauseMs} ms</span>
          </div>
          <input
            id="pause-ms-range"
            type="range"
            min={150}
            max={1500}
            step={50}
            value={pauseMs}
            onChange={(e) => onChangePauseMs(Number(e.target.value))}
            className="mt-5 w-full accent-[#1E3A8A]"
          />
          <div className="mt-2 flex justify-between text-[11px] text-[#52525B]">
            <span>150 ms</span>
            <span>1500 ms</span>
          </div>
        </div>
      </div>

      {/* Swaramandal & Raga Scale Strip */}
      <div className="grid divide-y divide-[#E4E4E7] border-t border-[#E4E4E7] bg-[#FAFAFA] md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="min-w-0 p-5 sm:px-6">
          <label htmlFor="raga-select" className="block text-xs font-medium text-[#52525B]">
            Swaramandal Rāga Scale
          </label>
          <select
            id="raga-select"
            value={ragaId}
            onChange={(e) => onChangeRagaId(e.target.value as RagaId)}
            className="mt-2 min-h-[38px] w-full rounded-lg border border-[#D4D4D8] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
          >
            {Object.values(RAGA_PRESETS).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-[#52525B]">
            {ragaSpec.id === 'none'
              ? 'Swaramandal muted; pure 4-string Tanpura.'
              : `${ragaSpec.swarasSummary} · ${ragaSpec.thaat} Thāṭ (locked to detected Sa)`}
          </p>
        </div>

        <div className="min-w-0 p-5 sm:px-6">
          <div className="flex items-center justify-between text-xs font-medium text-[#52525B]">
            <label htmlFor="swaramandal-db-range">Swaramandal Level</label>
            <span className="font-mono-num font-semibold text-[#0F172A]">
              {swaramandalDb.toFixed(1)} dB
            </span>
          </div>
          <input
            id="swaramandal-db-range"
            type="range"
            min={-30}
            max={-12}
            step={0.5}
            value={swaramandalDb}
            onChange={(e) => onChangeSwaramandalDb(Number(e.target.value))}
            className="mt-4 w-full accent-[#1E3A8A]"
          />
          <div className="mt-2 flex justify-between text-[11px] text-[#52525B]">
            <span>Whisper (-30 dB)</span>
            <span>Bright (-12 dB)</span>
          </div>
        </div>
      </div>
    </section>
  );
};
