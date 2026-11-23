import React from 'react';
import {Archive, Download, Layers, Loader2, Play, Square} from 'lucide-react';
import {Mp3Bitrate} from '../lib/reciteClient';

interface ExportBarProps {
  readyCount: number;
  selectedReadyCount: number;
  totalDurationSec: number;
  isExporting: boolean;
  isPreviewingMerged: boolean;
  previewElapsedSec: number;
  previewTotalSec: number;
  mp3Bitrate: Mp3Bitrate;
  onChangeMp3Bitrate: (bitrate: Mp3Bitrate) => void;
  exportMessage: string;
  accompanimentSummary: string;
  onTogglePreviewMerged: () => void;
  onDownloadMerged: (format: 'mp3' | 'wav') => void;
  onDownloadZip: (format: 'mp3' | 'wav') => void;
}

function formatTotalTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export const ExportBar: React.FC<ExportBarProps> = ({
  readyCount,
  selectedReadyCount,
  totalDurationSec,
  isExporting,
  isPreviewingMerged,
  previewElapsedSec,
  previewTotalSec,
  mp3Bitrate,
  onChangeMp3Bitrate,
  exportMessage,
  accompanimentSummary,
  onTogglePreviewMerged,
  onDownloadMerged,
  onDownloadZip,
}) => {
  const previewRatio =
    isPreviewingMerged && previewTotalSec > 0
      ? Math.min(1, Math.max(0, previewElapsedSec / previewTotalSec))
      : 0;

  return (
    <section
      id="export"
      className="scroll-mt-20 rounded-xl border border-[#E4E4E7] bg-white p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0F172A]">
            Download &amp; Merge Audio
          </h2>
          <p className="text-sm text-[#52525B]">
            <span className="font-mono-num font-semibold text-[#0F172A]">{selectedReadyCount}</span> selected ready
            <span aria-hidden="true"> · </span>
            <span className="font-mono-num">{readyCount}</span> total recited
            {selectedReadyCount > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-mono-num">~{formatTotalTime(totalDurationSec)}</span>
              </>
            )}
            <span aria-hidden="true"> · </span>
            <span>{accompanimentSummary}</span>
          </p>
        </div>

        {isPreviewingMerged && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-[#1E3A8A]">
              <span>Playing merged preview</span>
              <span className="font-mono-num">
                {formatClock(previewElapsedSec)} / {formatClock(previewTotalSec)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E4E4E7]">
              <div
                className="h-full bg-[#1E3A8A] transition-[width] duration-200"
                style={{width: `${Math.round(previewRatio * 100)}%`}}
              />
            </div>
          </div>
        )}

        {exportMessage && (
          <p className="text-xs font-medium text-[#1E3A8A]" role="status">
            {exportMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExporting || selectedReadyCount === 0}
              onClick={onTogglePreviewMerged}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {isPreviewingMerged ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current text-[#1E3A8A]" />
                  Stop Preview
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current text-[#1E3A8A]" />
                  Preview Merged
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isExporting || selectedReadyCount === 0}
              onClick={() => onDownloadMerged('mp3')}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Merge Selected → Single MP3
            </button>

            <button
              type="button"
              disabled={isExporting || selectedReadyCount === 0}
              onClick={() => onDownloadZip('mp3')}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#D4D4D8] bg-[#FAFAFA] px-4 py-2 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Archive className="h-4 w-4 text-[#1E3A8A]" />
              Individual MP3s (.zip)
            </button>

            <button
              type="button"
              disabled={isExporting || selectedReadyCount === 0}
              onClick={() => onDownloadZip('wav')}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-3.5 py-2 text-xs font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Archive className="h-3.5 w-3.5" />
              WAVs (.zip)
            </button>

            <button
              type="button"
              disabled={isExporting || selectedReadyCount === 0}
              onClick={() => onDownloadMerged('wav')}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#D4D4D8] bg-white px-3.5 py-2 text-xs font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Merged WAV
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="mp3-bitrate-select" className="text-xs font-medium text-[#52525B] whitespace-nowrap">
              MP3 Quality
            </label>
            <select
              id="mp3-bitrate-select"
              value={mp3Bitrate}
              onChange={(e) => onChangeMp3Bitrate(e.target.value as Mp3Bitrate)}
              className="min-h-[38px] rounded-lg border border-[#D4D4D8] bg-[#FAFAFA] px-2.5 py-1 text-xs font-medium text-[#0F172A] focus:border-[#1E3A8A] focus:outline-none"
            >
              <option value="128k">128 kbps</option>
              <option value="192k">192 kbps</option>
              <option value="320k">320 kbps</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
};
