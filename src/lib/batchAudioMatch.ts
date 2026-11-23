export interface MatchableVerse {
  id: string;
  index: number;
  selected: boolean;
}

export interface AudioFileEntry {
  name: string;
}

export interface AudioMatchAssignment<T extends AudioFileEntry, V extends MatchableVerse> {
  entry: T;
  verse: V;
  matchedBy: 'index' | 'sequence';
}

export interface BatchAudioMatchResult<T extends AudioFileEntry, V extends MatchableVerse> {
  matched: Array<AudioMatchAssignment<T, V>>;
  unmatched: T[];
}

const SUPPORTED_AUDIO_EXT_RE = /\.(wav|mp3|ogg|m4a|flac|aac|webm)$/i;
const ZIP_EXT_RE = /\.zip$/i;

export function isIgnoredArchiveEntry(name: string): boolean {
  const normalized = name.replace(/\\/g, '/');
  if (!normalized || normalized.endsWith('/')) return true;
  const parts = normalized.split('/');
  if (parts.some((p) => p === '__MACOSX' || p.startsWith('.'))) return true;
  const base = parts[parts.length - 1];
  return base.startsWith('._') || base === '.DS_Store';
}

export function isSupportedAudioFilename(name: string): boolean {
  if (isIgnoredArchiveEntry(name)) return false;
  return SUPPORTED_AUDIO_EXT_RE.test(name);
}

export function isZipFilename(name: string): boolean {
  if (isIgnoredArchiveEntry(name)) return false;
  return ZIP_EXT_RE.test(name);
}

function getFileStem(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  const base = normalized.split('/').pop() || normalized;
  return base.replace(/\.[^.]+$/, '');
}

/**
 * Extracts a 1-based verse number from common Colab / batch filenames such as
 * "shloka_001.wav", "001.mp3", "verse-12.wav", "20261123_05.wav", or "s188_raghu.wav".
 */
export function extractVerseNumberFromFilename(name: string, maxVerseIndex: number): number | null {
  if (maxVerseIndex < 1) return null;
  const stem = getFileStem(name).trim();
  if (!stem) return null;

  // 1. Pure numeric stem (e.g., "001.wav", "188.mp3")
  if (/^\d{1,4}$/.test(stem)) {
    const n = Number.parseInt(stem, 10);
    return n >= 1 && n <= maxVerseIndex ? n : null;
  }

  // 2. Explicit verse keyword prefix (shloka_12, verse-003, sloka 5, v12, s04, #12)
  const keywordMatch = stem.match(/(?:shloka|sloka|verse|track|audio|ch|vs|v|s)[_.\-\s#]*0*(\d{1,4})\b/i);
  if (keywordMatch) {
    const n = Number.parseInt(keywordMatch[1], 10);
    if (n >= 1 && n <= maxVerseIndex) return n;
  }

  // 3. Leading or trailing integer separated by delimiter (e.g., "042_vasudeva", "raghu_042")
  const leadingMatch = stem.match(/^0*(\d{1,4})(?:[_\-\s.]|$)/);
  if (leadingMatch) {
    const n = Number.parseInt(leadingMatch[1], 10);
    if (n >= 1 && n <= maxVerseIndex) return n;
  }

  const trailingMatch = stem.match(/(?:^|[_\-\s.])0*(\d{1,4})$/);
  if (trailingMatch) {
    const n = Number.parseInt(trailingMatch[1], 10);
    if (n >= 1 && n <= maxVerseIndex) return n;
  }

  return null;
}

const naturalCollator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

/**
 * Matches imported audio files (from multi-file upload or Colab ZIP) cleanly onto parsed verses.
 * Prefers explicit verse numbers in filenames when unambiguous; otherwise aligns naturally sorted
 * files sequentially across selected verses (or all verses if none are selected).
 */
export function matchImportedAudioFiles<T extends AudioFileEntry, V extends MatchableVerse>(
  entries: T[],
  verses: V[]
): BatchAudioMatchResult<T, V> {
  const validEntries = entries.filter((e) => isSupportedAudioFilename(e.name));
  if (validEntries.length === 0 || verses.length === 0) {
    return {matched: [], unmatched: validEntries};
  }

  const sorted = [...validEntries].sort((a, b) => naturalCollator.compare(a.name, b.name));
  const maxIndex = verses.reduce((mx, v) => Math.max(mx, v.index), 0);
  const byIndex = new Map<number, V>();
  for (const v of verses) byIndex.set(v.index, v);

  const extracted = sorted.map((entry) => ({
    entry,
    idx: extractVerseNumberFromFilename(entry.name, maxIndex),
  }));

  const uniqueExtracted = new Set(
    extracted.map((x) => x.idx).filter((idx): idx is number => idx !== null && byIndex.has(idx))
  );

  // Use index matching whenever filenames contain clean unique verse numbers
  const useIndexMatching =
    uniqueExtracted.size > 0 &&
    (uniqueExtracted.size >= Math.ceil(sorted.length * 0.5) || sorted.length <= 3);

  const matched: Array<AudioMatchAssignment<T, V>> = [];
  const usedVerseIds = new Set<string>();
  const remainingEntries: T[] = [];

  if (useIndexMatching) {
    for (const item of extracted) {
      if (item.idx !== null) {
        const target = byIndex.get(item.idx);
        if (target && !usedVerseIds.has(target.id)) {
          usedVerseIds.add(target.id);
          matched.push({entry: item.entry, verse: target, matchedBy: 'index'});
          continue;
        }
      }
      remainingEntries.push(item.entry);
    }
  } else {
    remainingEntries.push(...sorted);
  }

  if (remainingEntries.length > 0 && !useIndexMatching) {
    const selectedPool = verses.filter((v) => v.selected && !usedVerseIds.has(v.id));
    const sequentialPool =
      selectedPool.length >= remainingEntries.length
        ? selectedPool
        : verses.filter((v) => !usedVerseIds.has(v.id));

    const unmatched: T[] = [];
    for (let i = 0; i < remainingEntries.length; i++) {
      const target = sequentialPool[i];
      if (target) {
        usedVerseIds.add(target.id);
        matched.push({entry: remainingEntries[i], verse: target, matchedBy: 'sequence'});
      } else {
        unmatched.push(remainingEntries[i]);
      }
    }
    return {matched, unmatched};
  }

  return {matched, unmatched: remainingEntries};
}
