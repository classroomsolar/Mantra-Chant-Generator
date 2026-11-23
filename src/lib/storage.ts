import {RagaId} from './audioEngine';

const DB_NAME = 'chandahsvara-db';
const DB_VERSION = 1;
const STORE_AUDIO = 'verse-audio';
const STATE_KEY = 'chandahsvara-state-v1';

export interface PersistedAudioEntry {
  key: string;
  samples: Float32Array;
  sampleRate: number;
  statusText: string;
}

export interface PersistedAppState {
  rawText: string;
  pauseMs: number;
  tanpuraEnabled: boolean;
  tanpuraDb: number;
  tanpuraTuning: 'auto' | 'Pa-Sa-Sa-Sa' | 'Ma-Sa-Sa-Sa' | 'Ni-Sa-Sa-Sa';
  tonicScope?: 'global' | 'per-verse';
  ragaId?: RagaId;
  swaramandalEnabled?: boolean;
  swaramandalDb?: number;
  mp3Bitrate?: '128k' | '192k' | '320k';
  manualSaHz: number | null;
  manualMeters: Record<string, string>;
  selectedIds: string[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, {keyPath: 'key'});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudioEntry(entry: PersistedAudioEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      tx.objectStore(STORE_AUDIO).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export async function loadAllAudioEntries(): Promise<Record<string, PersistedAudioEntry>> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readonly');
      const req = tx.objectStore(STORE_AUDIO).getAll();
      req.onsuccess = () => {
        const map: Record<string, PersistedAudioEntry> = {};
        for (const item of req.result as PersistedAudioEntry[]) {
          map[item.key] = item;
        }
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return {};
  }
}

export async function clearAllAudioEntries(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      tx.objectStore(STORE_AUDIO).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export function loadAppState(): PersistedAppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedAppState) : null;
  } catch {
    return null;
  }
}

export function saveAppState(state: PersistedAppState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
