import React from 'react';
import {Play, Square} from 'lucide-react';

interface HeaderProps {
  isBatchRunning: boolean;
  selectedCount: number;
  onStartOrStopBatch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isBatchRunning,
  selectedCount,
  onStartOrStopBatch,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E4E4E7] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          className="font-display text-2xl font-semibold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0"
        >
          Chandaḥsvara
        </a>

        <nav
          className="hidden items-center gap-7 text-sm font-medium text-[#52525B] md:flex"
          aria-label="Website navigation"
        >
          <a
            href="#reciter"
            className="transition-colors hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            Reciter
          </a>
          <a
            href="#tanpura"
            className="transition-colors hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            Tanpura
          </a>
          <a
            href="#export"
            className="transition-colors hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            Export
          </a>
          <a
            href="#credits"
            className="transition-colors hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            Credits
          </a>
        </nav>

        <button
          type="button"
          onClick={onStartOrStopBatch}
          disabled={!isBatchRunning && selectedCount === 0}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#172554] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0 sm:text-sm"
        >
          {isBatchRunning ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop Queue
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              Recite Selected ({selectedCount})
            </>
          )}
        </button>
      </div>
    </header>
  );
};
