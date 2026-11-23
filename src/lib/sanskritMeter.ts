/**
 * Sanskrit text normalizer, multi-script transliterator (Indic -> SLP1),
 * Pāṇinian syllable weight (Laghu/Guru) analyzer, Vṛtta meter detector, and batch shloka splitter.
 * Meter classification rules follow classical Sanskrit prosody and Vāgdhenu (Apache-2.0).
 */

export const CHANDAS_METERS = [
  {id: '__auto__', label: 'Auto-detect meter'},
  {id: 'anuṣṭubh', label: 'anuṣṭubh (8 × 4)'},
  {id: 'upajāti', label: 'upajāti (11 × 4)'},
  {id: 'indravajrā', label: 'indravajrā (11 × 4)'},
  {id: 'upendravajrā', label: 'upendravajrā (11 × 4)'},
  {id: 'śālinī', label: 'śālinī (11 × 4)'},
  {id: 'rathoddhatā', label: 'rathoddhatā (11 × 4)'},
  {id: 'svāgatā', label: 'svāgatā (11 × 4)'},
  {id: 'vaṃśastha', label: 'vaṃśastha (12 × 4)'},
  {id: 'indravaṃśā', label: 'indravaṃśā (12 × 4)'},
  {id: 'drutavilambita', label: 'drutavilambita (12 × 4)'},
  {id: 'bhujaṅgaprayāta', label: 'bhujaṅgaprayāta (12 × 4)'},
  {id: 'toṭaka', label: 'toṭaka (12 × 4)'},
  {id: 'puṣpitāgrā', label: 'puṣpitāgrā (12/13 × 2)'},
  {id: 'vasantatilakā', label: 'vasantatilakā (14 × 4)'},
  {id: 'mālinī', label: 'mālinī (15 × 4)'},
  {id: 'pajjhaṭikā', label: 'pajjhaṭikā (16 mātrā)'},
  {id: 'śikhariṇī', label: 'śikhariṇī (17 × 4)'},
  {id: 'mandākrāntā', label: 'mandākrāntā (17 × 4)'},
  {id: 'hariṇī', label: 'hariṇī (17 × 4)'},
  {id: 'pṛthvī', label: 'pṛthvī (17 × 4)'},
  {id: 'śārdūlavikrīḍita', label: 'śārdūlavikrīḍita (19 × 4)'},
  {id: 'sragdharā', label: 'sragdharā (21 × 4)'},
  {id: 'pramāṇikā', label: 'pramāṇikā (8 × 4)'},
  {id: 'gadya', label: 'gadya (prose)'},
] as const;

export type MeterOptionId = (typeof CHANDAS_METERS)[number]['id'];

interface VruttaSpec {
  bankKey: string;
  name: string;
  padaLen: number;
  templates: string[];
  yati?: string;
}

const VRUTTA_SPECS: VruttaSpec[] = [
  {bankKey: 'pramāṇikā', name: 'pramāṇikā', padaLen: 8, templates: ['LGLGLGLG']},
  {bankKey: 'indravajrā', name: 'indravajrā', padaLen: 11, templates: ['GGLGGLLGLGG'], yati: '5+6'},
  {bankKey: 'upendravajrā', name: 'upendravajrā', padaLen: 11, templates: ['LGLGGLLGLGG'], yati: '5+6'},
  {bankKey: 'upajāti', name: 'upajāti', padaLen: 11, templates: ['GGLGGLLGLGG', 'LGLGGLLGLGG'], yati: '5+6'},
  {bankKey: 'śālinī', name: 'śālinī', padaLen: 11, templates: ['GGGGLLGGLGG'], yati: '4+7'},
  {bankKey: 'rathoddhatā', name: 'rathoddhatā', padaLen: 11, templates: ['GLGLLLGLGLG']},
  {bankKey: 'svāgatā', name: 'svāgatā', padaLen: 11, templates: ['GLGLLLGLLGG']},
  {bankKey: 'vaṃśastha', name: 'vaṃśastha', padaLen: 12, templates: ['LGLGGLLGLGLG'], yati: '5+7'},
  {bankKey: 'indravaṃśā', name: 'indravaṃśā', padaLen: 12, templates: ['GGLGGLLGLGLG'], yati: '5+7'},
  {bankKey: 'drutavilambita', name: 'drutavilambita', padaLen: 12, templates: ['LLLGLLGLLGLG']},
  {bankKey: 'bhujaṅgaprayāta', name: 'bhujaṅgaprayāta', padaLen: 12, templates: ['LGGLGGLGGLGG'], yati: '6+6'},
  {bankKey: 'toṭaka', name: 'toṭaka', padaLen: 12, templates: ['LLGLLGLLGLLG']},
  {bankKey: 'vasantatilakā', name: 'vasantatilakā', padaLen: 14, templates: ['GGLGLLLGLLGLGG'], yati: '8+6'},
  {bankKey: 'mālinī', name: 'mālinī', padaLen: 15, templates: ['LLLLLLGGGLGGLGG', 'LLLLLLGGLGGLGGG'], yati: '8+7'},
  {bankKey: 'śikhariṇī', name: 'śikhariṇī', padaLen: 17, templates: ['LGGGGGLLLLLGGGGLG'], yati: '6+11'},
  {bankKey: 'mandākrāntā', name: 'mandākrāntā', padaLen: 17, templates: ['GGGGLLLLLGGLGGLGG'], yati: '4+6+7'},
  {bankKey: 'hariṇī', name: 'hariṇī', padaLen: 17, templates: ['LLLLLGGGGGLGLLGLG'], yati: '6+4+7'},
  {bankKey: 'pṛthvī', name: 'pṛthvī', padaLen: 17, templates: ['LGLLLGLGLLLGGLGGL'], yati: '8+9'},
  {bankKey: 'śārdūlavikrīḍita', name: 'śārdūlavikrīḍita', padaLen: 19, templates: ['GGGLLGLGLLLGGGLGGLG'], yati: '12+7'},
  {bankKey: 'sragdharā', name: 'sragdharā', padaLen: 21, templates: ['GGGGLGGGLLLLLLGGLGGLG'], yati: '7+7+7'},
];

export interface Syllable {
  text: string;
  onset: string;
  vowel: string;
  coda: string;
  isWordFinal: boolean;
  isPadaFinal: boolean;
  weight: 'L' | 'G';
  weightCause: string;
  isSutra: boolean;
}

export interface SyllableChip {
  iast: string;
  weight: 'L' | 'G';
  cause: string;
  isPadaFinal: boolean;
}

export interface MeterDetectionResult {
  bankKey: string;
  displayName: string;
  recognized: boolean;
  syllableCount: number;
  padaLength: number | null;
  padas: string[];
  pattern: string;
  detectedScript: string;
  yati?: string;
  syllables: SyllableChip[];
}

export interface ParsedShloka {
  id: string;
  index: number;
  text: string;
  meter: MeterDetectionResult;
  manualMeter: MeterOptionId;
  selected: boolean;
}

const INDIC_BLOCKS: Array<{name: string; start: number; end: number}> = [
  {name: 'Devanagari', start: 0x0900, end: 0x097f},
  {name: 'Bengali', start: 0x0980, end: 0x09ff},
  {name: 'Gurmukhi', start: 0x0a00, end: 0x0a7f},
  {name: 'Gujarati', start: 0x0a80, end: 0x0aff},
  {name: 'Oriya', start: 0x0b00, end: 0x0b7f},
  {name: 'Tamil', start: 0x0b80, end: 0x0bff},
  {name: 'Telugu', start: 0x0c00, end: 0x0c7f},
  {name: 'Kannada', start: 0x0c80, end: 0x0cff},
  {name: 'Malayalam', start: 0x0d00, end: 0x0d7f},
];

export function detectScript(text: string): string {
  const nfc = text.normalize('NFC');
  const counts: Record<string, number> = {};
  for (const ch of nfc) {
    const cp = ch.codePointAt(0) ?? 0;
    for (const blk of INDIC_BLOCKS) {
      if (cp >= blk.start && cp <= blk.end) {
        counts[blk.name] = (counts[blk.name] || 0) + 1;
        break;
      }
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) return best[0];
  return /[āīūṛṝḷṃḥśṣṇṭḍṅñ]/i.test(nfc) ? 'IAST' : 'Latin';
}

/**
 * Normalize any Indic Unicode block (Kannada, Telugu, Malayalam, Bengali, Gujarati, etc.)
 * into Devanagari codepoints using the shared ISCII-derived Unicode block offsets.
 */
const MALAYALAM_CHILLU: Record<number, string> = {
  0x0d7a: 'ण्',
  0x0d7b: 'न्',
  0x0d7c: 'र्',
  0x0d7d: 'ल्',
  0x0d7e: 'ळ्',
  0x0d7f: 'क्',
};

export function indicToDevanagari(input: string): string {
  let out = '';
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    if (MALAYALAM_CHILLU[cp]) {
      out += MALAYALAM_CHILLU[cp];
      continue;
    }
    if (cp === 0x09f0) {
      out += 'र';
      continue;
    }
    if (cp === 0x09f1) {
      out += 'व';
      continue;
    }
    let mapped = false;
    for (const blk of INDIC_BLOCKS) {
      if (cp >= blk.start && cp <= blk.end) {
        const offset = cp - blk.start;
        if (blk.name === 'Devanagari') {
          out += ch;
        } else if (offset === 0x0e) {
          out += 'ए';
        } else if (offset === 0x12) {
          out += 'ओ';
        } else if (offset === 0x46) {
          out += 'े';
        } else if (offset === 0x4a) {
          out += 'ो';
        } else if (offset === 0x31) {
          out += 'र';
        } else if (offset === 0x34) {
          out += 'ल';
        } else if (offset >= 0x66 && offset <= 0x6f) {
          out += String.fromCodePoint(0x0966 + (offset - 0x66));
        } else if (offset >= 0x01 && offset <= 0x4d) {
          out += String.fromCodePoint(0x0900 + offset);
        } else {
          out += ch;
        }
        mapped = true;
        break;
      }
    }
    if (!mapped) out += ch;
  }
  return out;
}

const INDEP_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'A', 'इ': 'i', 'ई': 'I', 'उ': 'u', 'ऊ': 'U',
  'ऋ': 'f', 'ॠ': 'F', 'ऌ': 'x', 'ॡ': 'X',
  'ए': 'e', 'ऐ': 'E', 'ओ': 'o', 'औ': 'O',
  'ऎ': 'e', 'ऒ': 'o',
};

const MATRAS: Record<string, string> = {
  'ा': 'A', 'ि': 'i', 'ी': 'I', 'ु': 'u', 'ू': 'U',
  'ृ': 'f', 'ॄ': 'F', 'ॢ': 'x', 'ॣ': 'X',
  'े': 'e', 'ै': 'E', 'ो': 'o', 'ौ': 'O',
  'ॆ': 'e', 'ॊ': 'o',
};

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'K', 'ग': 'g', 'घ': 'G', 'ङ': 'N',
  'च': 'c', 'छ': 'C', 'ज': 'j', 'झ': 'J', 'ञ': 'Y',
  'ट': 'w', 'ठ': 'W', 'ड': 'q', 'ढ': 'Q', 'ण': 'R',
  'त': 't', 'थ': 'T', 'द': 'd', 'ध': 'D', 'न': 'n',
  'प': 'p', 'फ': 'P', 'ब': 'b', 'भ': 'B', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'L', 'व': 'v',
  'श': 'S', 'ष': 'z', 'स': 's', 'ह': 'h',
  'क़': 'k', 'ख़': 'K', 'ग़': 'g', 'ज़': 'j', 'ड़': 'q', 'ढ़': 'Q', 'फ़': 'P', 'य़': 'y',
};

const IAST_TO_SLP1_PAIRS: Array<[string, string]> = [
  ['kh', 'K'], ['gh', 'G'], ['ch', 'C'], ['jh', 'J'],
  ['ṭh', 'W'], ['ḍh', 'Q'], ['th', 'T'], ['dh', 'D'],
  ['ph', 'P'], ['bh', 'B'], ['ai', 'E'], ['au', 'O'],
  ['ā', 'A'], ['ī', 'I'], ['ū', 'U'], ['ṛ', 'f'], ['ṝ', 'F'],
  ['ḷ', 'x'], ['ḹ', 'X'], ['ṅ', 'N'], ['ñ', 'Y'],
  ['ṭ', 'w'], ['ḍ', 'q'], ['ṇ', 'R'], ['ś', 'S'], ['ṣ', 'z'],
  ['ṃ', 'M'], ['ṁ', 'M'], ['ḥ', 'H'], ['ḻ', 'L'],
];

function iastToSlp1(text: string): string {
  let s = text.toLowerCase();
  for (const [src, dst] of IAST_TO_SLP1_PAIRS) {
    s = s.split(src).join(dst);
  }
  return s;
}

export function toSlp1(rawInput: string): string {
  const raw = rawInput.normalize('NFC');
  const script = detectScript(raw);
  if (script === 'IAST' || script === 'Latin') {
    const cleaned = raw
      .replace(/\|\|/g, '|')
      .replace(/[\r\n]+/g, ' | ')
      .replace(/[0-9०-९"'“”‘’().,;:!?-]/g, ' ');
    return iastToSlp1(cleaned).replace(/\s+/g, ' ').trim();
  }

  let deva = indicToDevanagari(raw);
  // Expand ॐ -> ओम् and preserve jihvāmūlīya/upadhmānīya (ᳵ/ᳶ) as half-visarga
  deva = deva.replace(/ॐ/g, 'ओम्');
  deva = deva
    .replace(/[\u0951-\u0954\u1CD0-\u1CF4\u1CF7-\u1CFF\uA8E0-\uA8FF]/g, '')
    .replace(/\u093c/g, '')
    .replace(/॥/g, '|')
    .replace(/।/g, '|')
    .replace(/\|\|/g, '|')
    .replace(/\n/g, ' | ')
    .replace(/[0-9०-९"'“”‘’(),;:!?-]/g, ' ');

  let slp = '';
  const chars = Array.from(deva);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (INDEP_VOWELS[c]) {
      slp += INDEP_VOWELS[c];
    } else if (CONSONANTS[c]) {
      const nxt = chars[i + 1] ?? '';
      if (nxt === '्') {
        slp += CONSONANTS[c];
        i += 1;
      } else if (MATRAS[nxt]) {
        slp += CONSONANTS[c] + MATRAS[nxt];
        i += 1;
      } else {
        slp += CONSONANTS[c] + 'a';
      }
    } else if (c === 'ं') {
      slp += 'M';
    } else if (c === 'ः' || c === '\u1CF5' || c === '\u1CF6') {
      slp += 'H';
    } else if (c === 'ँ') {
      slp += '~';
    } else if (c === 'ऽ') {
      slp += "'";
    } else if (c === '|' || c === ' ') {
      slp += c;
    }
  }
  return slp.replace(/\s+/g, ' ').trim();
}

const SLP_VOWELS = new Set(['a', 'A', 'i', 'I', 'u', 'U', 'f', 'F', 'x', 'X', 'e', 'E', 'o', 'O']);
const LONG_VOWELS = new Set(['A', 'I', 'U', 'F', 'X', 'e', 'E', 'o', 'O']);

export function syllabify(slp1: string): Syllable[] {
  const syllables: Syllable[] = [];
  let onsetBuf: string[] = [];
  const n = slp1.length;

  const attachTrailingToLast = (buf: string[]) => {
    if (buf.length > 0 && syllables.length > 0) {
      const last = syllables[syllables.length - 1];
      const extra = buf.join('');
      last.coda += extra;
      last.text += extra;
    }
  };

  let i = 0;
  while (i < n) {
    const c = slp1[i];
    if (c === "'") {
      i += 1;
      continue;
    }
    if (c === ' ' || c === '|') {
      attachTrailingToLast(onsetBuf);
      onsetBuf = [];
      if (c === '|' && syllables.length > 0) {
        syllables[syllables.length - 1].isPadaFinal = true;
        syllables[syllables.length - 1].isWordFinal = true;
      } else if (c === ' ' && syllables.length > 0) {
        syllables[syllables.length - 1].isWordFinal = true;
      }
      i += 1;
      continue;
    }

    if (SLP_VOWELS.has(c)) {
      const syl: Syllable = {
        text: onsetBuf.join('') + c,
        onset: onsetBuf.join(''),
        vowel: c,
        coda: '',
        isWordFinal: false,
        isPadaFinal: false,
        weight: 'L',
        weightCause: 'light',
        isSutra: false,
      };
      syllables.push(syl);
      onsetBuf = [];
      i += 1;

      const consBetween: string[] = [];
      while (i < n && !SLP_VOWELS.has(slp1[i]) && slp1[i] !== ' ' && slp1[i] !== '|' && slp1[i] !== "'") {
        const cc = slp1[i];
        if (cc === '~' && consBetween.length > 0) {
          consBetween[consBetween.length - 1] += '~';
        } else {
          consBetween.push(cc);
        }
        i += 1;
      }

      if (i < n && SLP_VOWELS.has(slp1[i])) {
        if (consBetween.length >= 2) {
          const codaPart = consBetween.slice(0, -1).join('');
          syl.coda = codaPart;
          syl.text += codaPart;
          onsetBuf = [consBetween[consBetween.length - 1]];
        } else if (consBetween.length === 1) {
          onsetBuf = consBetween;
        }
      } else {
        syl.coda = consBetween.join('');
        syl.text += syl.coda;
        onsetBuf = [];
      }
      continue;
    }

    if (c === '~' && onsetBuf.length > 0) {
      onsetBuf[onsetBuf.length - 1] += '~';
    } else {
      onsetBuf.push(c);
    }
    i += 1;
  }

  attachTrailingToLast(onsetBuf);
  if (syllables.length > 0) {
    syllables[syllables.length - 1].isWordFinal = true;
    syllables[syllables.length - 1].isPadaFinal = true;
  }
  return syllables;
}

function clusterChars(s: string): string[] {
  return Array.from(s).filter((ch) => ch !== '~');
}

export function tagWeights(syllables: Syllable[]): void {
  for (let k = 0; k < syllables.length; k++) {
    const s = syllables[k];
    if (LONG_VOWELS.has(s.vowel)) {
      s.weight = 'G';
      s.weightCause = 'long_vowel';
      continue;
    }

    const gap = clusterChars(s.coda);
    if (!s.isPadaFinal && k + 1 < syllables.length) {
      gap.push(...clusterChars(syllables[k + 1].onset));
    }

    if (gap[0] === 'H') {
      s.weight = 'G';
      s.weightCause = 'visarga';
      continue;
    }
    if (gap[0] === 'M') {
      s.weight = 'G';
      s.weightCause = 'anusvara';
      continue;
    }
    if (gap.length >= 2) {
      s.weight = 'G';
      s.weightCause = 'cluster';
      continue;
    }
    if (s.isPadaFinal) {
      s.weight = 'G';
      s.weightCause = 'pada_final_anceps';
      continue;
    }
    s.weight = 'L';
    s.weightCause = 'light';
  }
}

export function markSutras(syllables: Syllable[]): void {
  const n = syllables.length;
  for (const s of syllables) s.isSutra = false;
  if (n === 0) return;

  if (syllables[0].text === 'om' && syllables[0].isPadaFinal) {
    syllables[0].isSutra = true;
  }

  let i = 0;
  while (i < n) {
    const isPhraseStart = i === 0 || syllables[i - 1].isPadaFinal;
    if (syllables[i].text === 'om' && isPhraseStart && !syllables[i].isPadaFinal) {
      let closed = false;
      for (let j = i + 1; j < n; j++) {
        if (syllables[j].text === 'om' && syllables[j].isPadaFinal) {
          for (let k = i; k <= j; k++) syllables[k].isSutra = true;
          i = j + 1;
          closed = true;
          break;
        }
      }
      if (closed) continue;
    }
    i += 1;
  }
}

function matchPada(observed: string, template: string): boolean {
  if (observed.length !== template.length) return false;
  for (let i = 0; i < template.length - 1; i++) {
    if (observed[i] !== template[i]) return false;
  }
  return true; // last position is anceps
}

const SLP1_TO_IAST_CHAR: Record<string, string> = {
  A: 'ā', I: 'ī', U: 'ū', f: 'ṛ', F: 'ṝ', x: 'ḷ', X: 'ḹ',
  E: 'ai', O: 'au', M: 'ṃ', H: 'ḥ', L: 'ḻ',
  K: 'kh', G: 'gh', N: 'ṅ', C: 'ch', J: 'jh', Y: 'ñ',
  w: 'ṭ', W: 'ṭh', q: 'ḍ', Q: 'ḍh', R: 'ṇ',
  T: 'th', D: 'dh', P: 'ph', B: 'bh',
  S: 'ś', z: 'ṣ',
};

function slp1ToIast(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch === '~') continue;
    out += SLP1_TO_IAST_CHAR[ch] ?? ch;
  }
  return out;
}

export function detectMeter(rawText: string): MeterDetectionResult {
  const detectedScript = detectScript(rawText);
  const slp = toSlp1(rawText);
  const syls = syllabify(slp);
  tagWeights(syls);
  markSutras(syls);

  const shlokaSyls = syls.filter((s) => !s.isSutra);
  const syllables: SyllableChip[] = shlokaSyls.map((s) => ({
    iast: slp1ToIast(s.text),
    weight: s.weight,
    cause: s.weightCause,
    isPadaFinal: s.isPadaFinal,
  }));
  const pattern = shlokaSyls.map((s) => s.weight).join('');
  const n = pattern.length;

  for (const spec of VRUTTA_SPECS) {
    if (n === 4 * spec.padaLen || n === 2 * spec.padaLen) {
      const numPadas = n / spec.padaLen;
      const padas: string[] = [];
      let allMatch = true;
      for (let i = 0; i < numPadas; i++) {
        const pada = pattern.slice(i * spec.padaLen, (i + 1) * spec.padaLen);
        padas.push(pada);
        if (!spec.templates.some((tpl) => matchPada(pada, tpl))) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        return {
          bankKey: spec.bankKey,
          displayName: numPadas === 2 ? `${spec.name} (half)` : spec.name,
          recognized: true,
          syllableCount: n,
          padaLength: spec.padaLen,
          padas,
          pattern,
          detectedScript,
          yati: spec.yati,
          syllables,
        };
      }
    }
  }

  // Puṣpitāgrā ardhasamavṛtta (12 + 13 + 12 + 13 = 50 syllables)
  if (n === 50) {
    const p1 = pattern.slice(0, 12);
    const p2 = pattern.slice(12, 25);
    const p3 = pattern.slice(25, 37);
    const p4 = pattern.slice(37, 50);
    if (
      matchPada(p1, 'LLLLLLGLGLGG') &&
      matchPada(p2, 'LLLLGLGGLGLGG') &&
      matchPada(p3, 'LLLLLLGLGLGG') &&
      matchPada(p4, 'LLLLGLGGLGLGG')
    ) {
      return {
        bankKey: 'puṣpitāgrā',
        displayName: 'puṣpitāgrā',
        recognized: true,
        syllableCount: n,
        padaLength: null,
        padas: [p1, p2, p3, p4],
        pattern,
        detectedScript,
        yati: '12+13',
        syllables,
      };
    }
  }

  if (n === 32) {
    return {
      bankKey: 'anuṣṭubh',
      displayName: 'anuṣṭubh',
      recognized: true,
      syllableCount: n,
      padaLength: 8,
      padas: [pattern.slice(0, 8), pattern.slice(8, 16), pattern.slice(16, 24), pattern.slice(24, 32)],
      pattern,
      detectedScript,
      yati: '8+8',
      syllables,
    };
  }

  if (n === 16) {
    return {
      bankKey: 'anuṣṭubh',
      displayName: 'anuṣṭubh (half)',
      recognized: true,
      syllableCount: n,
      padaLength: 8,
      padas: [pattern.slice(0, 8), pattern.slice(8, 16)],
      pattern,
      detectedScript,
      yati: '8+8',
      syllables,
    };
  }

  // Line-by-line pāda similarity check for devotional verses (both 4-pāda and 2-pāda) with minor poetic license
  const lineTexts = rawText
    .replace(/॥/g, '।')
    .split(/[\n।]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lineTexts.length >= 2) {
    const linePatterns = lineTexts.map((lt) => {
      const ls = syllabify(toSlp1(lt));
      tagWeights(ls);
      return ls.map((s) => s.weight).join('');
    });
    for (const spec of VRUTTA_SPECS) {
      const isFourPadaNear = Math.abs(n - 4 * spec.padaLen) <= 3;
      const isTwoPadaNear = Math.abs(n - 2 * spec.padaLen) <= 2;
      if ((isFourPadaNear || isTwoPadaNear) && spec.padaLen >= 11) {
        const matchedLines = linePatterns.filter(
          (lp) => Math.abs(lp.length - spec.padaLen) <= 1 &&
            spec.templates.some((tpl) => {
              const cmpLen = Math.min(lp.length, tpl.length) - 1;
              let hits = 0;
              for (let i = 0; i < cmpLen; i++) {
                if (lp[i] === tpl[i]) hits++;
              }
              return cmpLen > 0 && hits / cmpLen >= 0.72;
            })
        );
        const minNeeded = isFourPadaNear ? 2 : 1;
        if (matchedLines.length >= minNeeded) {
          return {
            bankKey: spec.bankKey,
            displayName: isTwoPadaNear ? `${spec.name} (half)` : `${spec.name} (near match)`,
            recognized: true,
            syllableCount: n,
            padaLength: spec.padaLen,
            padas: linePatterns,
            pattern,
            detectedScript,
            yati: spec.yati,
            syllables,
          };
        }
      }
    }

    // 16-mātrā Pajjhaṭikā / Mātrāvṛtta check (e.g. Bhaja Govindam: 15-17 mātrās per pāda × 4)
    if (linePatterns.length === 4) {
      const matras = linePatterns.map((lp) =>
        Array.from(lp).reduce((sum, ch) => sum + (ch === 'G' ? 2 : 1), 0)
      );
      if (matras.every((m) => m >= 14 && m <= 17) && matras.reduce((a, b) => a + b, 0) >= 60) {
        return {
          bankKey: 'pajjhaṭikā',
          displayName: 'pajjhaṭikā (16-mātrā)',
          recognized: true,
          syllableCount: n,
          padaLength: null,
          padas: linePatterns,
          pattern,
          detectedScript,
          syllables,
        };
      }
    }
  }

  return {
    bankKey: 'vasantatilakā',
    displayName: 'vasantatilakā (general fit)',
    recognized: false,
    syllableCount: n,
    padaLength: null,
    padas: pattern ? [pattern] : [],
    pattern,
    detectedScript,
    syllables,
  };
}

const PURE_HEADINGS = new Set([
  'पूर्वन्यासः',
  'स्तोत्रम्-',
  'स्तोत्रम्',
  'उत्तरन्यासः',
  'अथ ध्यानम्-',
  'अथ ध्यानम्',
]);

const INDIC_DIGIT_REGEX =
  /[०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯0-9]/;
const INDIC_NUMERAL_GROUP =
  '(?:[०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯0-9]+)';

export function parseBatchShlokas(rawText: string, maxLinesPerChunk = 5): ParsedShloka[] {
  const raw = rawText
    .normalize('NFC')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\u0951-\u0954\u1CD0-\u1CF4\u1CF7-\u1CFF\uA8E0-\uA8FF]/g, '')
    .replace(/\u093c/g, '')
    .replace(/,/g, ' ')
    .replace(/\|\|/g, '॥')
    .replace(/\|/g, '।')
    .replace(new RegExp(`॥\\s*[(\\[]?\\s*${INDIC_NUMERAL_GROUP}\\s*[)\\]]?\\s*(?:॥|$)`, 'gm'), '॥');

  const trimmed = raw.trim();
  if (!trimmed) return [];

  const paragraphBlocks = trimmed
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  // Split any block that packs multiple verses separated by ॥ (handles 100-shloka dense pastes too)
  const rawBlocks: string[] = [];
  for (const blk of paragraphBlocks) {
    const dandaCount = (blk.match(/॥/g) || []).length;
    if (dandaCount >= 2) {
      const parts = blk
        .split('॥')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `${p} ॥`);
      rawBlocks.push(...parts);
    } else {
      rawBlocks.push(blk);
    }
  }

  const items: string[] = [];
  for (const blk of rawBlocks) {
    const lines = blk
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    while (lines.length > 0 && PURE_HEADINGS.has(lines[0])) {
      lines.shift();
    }
    if (lines.length === 0) continue;

    const cleanedLines = lines.map((ln) => ln.replace(/-\s*$/, '।').replace(/\s+/g, ' ').trim());

    if (cleanedLines.length > maxLinesPerChunk) {
      let idx = 0;
      if (cleanedLines[0].length < 25 && !/[।॥]$/.test(cleanedLines[0])) {
        cleanedLines[0] = `${cleanedLines[0]} ।`;
        items.push(cleanedLines.slice(0, 3).join('\n'));
        idx = 3;
      }
      while (idx < cleanedLines.length) {
        const chunk = cleanedLines.slice(idx, idx + 3);
        if (chunk.length === 1 && items.length > 0) {
          items[items.length - 1] = `${items[items.length - 1]}\n${chunk[0]}`;
        } else {
          items.push(chunk.join('\n'));
        }
        idx += 3;
      }
    } else {
      if (cleanedLines[0] === '॥ हरिः ओम् ॥' || cleanedLines[0] === 'हरिः ओम्' || cleanedLines[0] === '॥ हरिः ॐ ॥') {
        items.push(cleanedLines[0]);
        cleanedLines.shift();
      }
      if (cleanedLines.length > 0) {
        items.push(cleanedLines.join('\n'));
      }
    }
  }

  const finalTexts: string[] = [];
  const leadNumRe = new RegExp(`^\\s*[(\\[]?${INDIC_NUMERAL_GROUP}[)\\].\\-:]?\\s*`);
  const trailNumRe = new RegExp(`\\s*[(\\[]?${INDIC_NUMERAL_GROUP}[)\\]]?\\s*$`);
  for (let it of items) {
    it = it.replace(leadNumRe, '');
    it = it.replace(trailNumRe, '');
    const bodyChars = it.replace(/[।॥\s]/g, '');
    if (bodyChars.length >= 4 && (!INDIC_DIGIT_REGEX.test(bodyChars) || bodyChars.length > 4)) {
      finalTexts.push(it.trim());
    }
  }

  return finalTexts.map((text, idx) => {
    const meter = detectMeter(text);
    return {
      id: `shloka-${idx + 1}`,
      index: idx + 1,
      text,
      meter,
      manualMeter: '__auto__',
      selected: true,
    };
  });
}
