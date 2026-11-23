import {encodeWavBuffer, trimAndNormalizeVoice} from './audioEngine';

export interface ReciteResult {
  samples: Float32Array;
  sampleRate: number;
  statusText: string;
  durationSec: number;
}

let sharedAudioCtx: AudioContext | null = null;
function getDecodeCtx(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

async function decodeToMono24k(
  arrayBuf: ArrayBuffer
): Promise<{samples: Float32Array; sampleRate: number}> {
  const ctx = getDecodeCtx();
  const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
  const targetSr = 24000;

  if (decoded.sampleRate === targetSr) {
    const ch0 = decoded.getChannelData(0);
    if (decoded.numberOfChannels === 1) {
      return {samples: new Float32Array(ch0), sampleRate: targetSr};
    }
    const ch1 = decoded.getChannelData(1);
    const mono = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
    return {samples: mono, sampleRate: targetSr};
  }

  const outLen = Math.max(1, Math.round(decoded.duration * targetSr));
  const offline = new OfflineAudioContext(1, outLen, targetSr);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return {samples: new Float32Array(rendered.getChannelData(0)), sampleRate: targetSr};
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      {once: true}
    );
  });
}

export async function decodeAudioBufferTo24kNormalized(
  arrayBuf: ArrayBuffer,
  statusText: string
): Promise<ReciteResult> {
  const {samples: rawSamples, sampleRate} = await decodeToMono24k(arrayBuf);
  const samples = trimAndNormalizeVoice(rawSamples, sampleRate);
  return {
    samples,
    sampleRate,
    statusText,
    durationSec: samples.length / sampleRate,
  };
}

export async function reciteShloka(params: {
  text: string;
  meter: string;
  signal?: AbortSignal;
}): Promise<ReciteResult> {
  const maxAttempts = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch('/api/recite', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: params.text,
          meter: params.meter,
        }),
        signal: params.signal,
      });

      const payload = (await resp.json().catch(() => ({}))) as {
        error?: string;
        quotaExhausted?: boolean;
        retryAfterSec?: number;
        audioBase64?: string;
        meter?: string;
        voice?: string;
      };

      if (!resp.ok || !payload.audioBase64) {
        const msg = payload.error || `Recitation failed (HTTP ${resp.status}).`;
        const isQuotaExhausted = Boolean(payload.quotaExhausted);
        const isRetryable = !isQuotaExhausted && (resp.status === 429 || resp.status >= 500);
        if (isRetryable && attempt < maxAttempts) {
          const waitMs =
            payload.retryAfterSec && payload.retryAfterSec <= 20
              ? payload.retryAfterSec * 1000
              : attempt * 1500;
          await sleepWithAbort(waitMs, params.signal);
          continue;
        }
        const err = new Error(msg) as Error & {isFatalBatch?: boolean};
        if (isQuotaExhausted) err.isFatalBatch = true;
        throw err;
      }

      const rawBuf = base64ToArrayBuffer(payload.audioBase64);
      return await decodeAudioBufferTo24kNormalized(
        rawBuf,
        `${payload.voice || 'Vāgdhenu'} · ${payload.meter || params.meter}`
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error('Recitation failed.');
      const isFatalBatch = Boolean((err as {isFatalBatch?: boolean}).isFatalBatch);
      if (isFatalBatch || attempt >= maxAttempts) {
        throw lastError;
      }
      await sleepWithAbort(attempt * 1500, params.signal);
    }
  }

  throw lastError || new Error('Recitation failed.');
}

export type Mp3Bitrate = '128k' | '192k' | '320k';

export async function encodeAudioFile(
  samples: Float32Array,
  sampleRate: number,
  format: 'mp3' | 'wav',
  options?: {
    bitrate?: Mp3Bitrate;
    title?: string;
    track?: string;
    album?: string;
  }
): Promise<{blob: Blob; ext: 'mp3' | 'wav'}> {
  const wavBuf = encodeWavBuffer(samples, sampleRate);
  if (format === 'wav') {
    return {blob: new Blob([wavBuf], {type: 'audio/wav'}), ext: 'wav'};
  }

  const params = new URLSearchParams();
  params.set('bitrate', options?.bitrate || '192k');
  if (options?.title) params.set('title', options.title);
  if (options?.track) params.set('track', options.track);
  if (options?.album) params.set('album', options.album);

  const resp = await fetch(`/api/encode-mp3?${params.toString()}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/octet-stream'},
    body: wavBuf,
  });
  if (!resp.ok) {
    throw new Error(`MP3 encoding failed (HTTP ${resp.status}).`);
  }
  const mp3Buf = await resp.arrayBuffer();
  return {blob: new Blob([mp3Buf], {type: 'audio/mpeg'}), ext: 'mp3'};
}

export const SAMPLE_STOTRAS: Array<{id: string; label: string; text: string}> = [
  {
    id: 'classics',
    label: '4 Classics (Multi-Vṛtta)',
    text: `वसुदेवसुतं देवं कंसचाणूरमर्दनम् ।
देवकीपरमानन्दं कृष्णं वन्दे जगद्गुरुम् ॥

या कुन्देन्दुतुषारहारधवला या शुभ्रवस्त्रावृता
या वीणावरदण्डमण्डितकरा या श्वेतपद्मासना ।
या ब्रह्माच्युतशङ्करप्रभृतिभिर्देवैः सदा वन्दिता
सा मां पातु सरस्वती भगवती निःशेषजाड्यापहा ॥

अतुलितबलधामं हेमशैलाभदेहं
दनुजवनकृशानुं ज्ञानिनामग्रगण्यम् ।
सकलगुणनिधानं वानराणामधीशं
रघुपतिप्रियभक्तं वातजातं नमामि ॥

शुक्लाम्बरधरं विष्णुं शशिवर्णं चतुर्भुजम् ।
प्रसन्नवदनं ध्यायेत् सर्वविघ्नोपशान्तये ॥`,
  },
  {
    id: 'multi-script',
    label: 'Multi-Script (Devanagari · Kannada · Telugu)',
    text: `कराग्रे वसते लक्ष्मीः करमध्ये सरस्वती ।
करमूले तु गोविन्दः प्रभाते करदर्शनम् ॥

ಗುರುರ್ಬ್ರಹ್ಮಾ ಗುರುರ್ವಿಷ್ಣುಃ ಗುರುರ್ದೇವೋ ಮಹೇಶ್ವರಃ ।
ಗುರುಃ ಸಾಕ್ಷಾತ್ ಪರಂ ಬ್ರಹ್ಮ ತಸ್ಮೈ ಶ್ರೀಗುರವೇ ನಮಃ ॥

సరస్వతి నమస్తుభ్యం వరదే కామరూపిణి ।
విద్యారంభం కరిష్యామి సిద్ధిర్భవతు మే సదా ॥`,
  },
  {
    id: 'krishna-ramayana',
    label: '19-Śloka Kṛṣṇa–Rāmāyaṇa Stotra',
    text: `हे रामा पुरुषोत्तमा नरहरे नारायणा केशवा।
हे गोविन्दा गरुडध्वजा गुणनिधो दामोदरा माधवा॥

हे कृष्ण कमलापते यदुपते सीतापते श्रीपते।
हे वैकुण्ठाधिपते चराचरपते लक्ष्मीपते पाहि माम्॥

हे गोपालक हे कृपा जलनिधे हे सिंधु कन्यापते।
हे कंसान्तक हे गजेन्द्र करुणापारीण हे माधव॥

हे रामानुज हे जगत्त्रय गुरो हे पुण्डरीकाक्ष माम्।
हे गोपीजननाथ पालय परम जानामि न त्वां विना॥

कस्तूरी तिलकं ललाटपटले वक्षःस्थले कौस्तुभं।
नासाग्रे नवमौक्तिकं करतले वेणुं करे कङ्कणम्॥

सर्वाङ्गे हरिचन्दनं सुललितं कण्ठे च मुक्तावली।
गोपस्त्री परिवेष्टितो विजयते गोपालचूडामणिः॥

आदौ रामतपोवनादिगमनं हत्वा मृगं काञ्चनम्।
वैदेहीहरणं जटायुमरणं सुग्रीवसम्भाषणम्॥

वालीनिग्रहणं समुद्रतरणं लङ्कापुरीदाहनम्।
पश्चाद् रावणकुम्भकर्णहननम् एतद्धि रामायणम्॥

आदौ देवकीदेवगर्भजननं गोपीगृहे वर्धनम्।
मायापूतनाजीवितहरणं गोवर्धनोद्धारणम्॥

कंसच्छेदनं कौरवादिहननं कुन्तीसुतानां पालनम्।
एतद् श्रीमद्भागवतपुराणकथितं श्रीकृष्णलीलामृतम्॥

श्रीरङ्गं श्रीशैलं अञ्जनगिरिं शेषाचले संस्थितम्।
श्रीकूर्मं पुरुषोत्तमं च बद्रीनारायणं नैमिषम्॥

श्रीमद् द्वारवती प्रयाग मथुरा अयोध्या गया पुष्करम्।
शालिग्रामनिवासनो विजयते रामानुजोऽयं मुनिः॥

विष्णोः पदं वनाटिका गुणवती मध्य च काञ्चीपुरी।
नभो द्वारवती तथा हृदये मायापुरी पुण्यदा॥

ग्रीवामूलमुदाहरन्ति मथुरां नासां च वाराणसीम्।
एतद् ब्रह्मपदं वदन्ति मुनयो अयोध्यापुरी मस्तकम्॥

तूणे नेकशरान् करे दशधा सन्धानकाले शतम्।
चापेऽभूत् सहस्रलक्षागमने कोटि कोटि वर्धते॥

आन्तेऽसवार्व निखर्वबाणनिकरैः सीतापते शोभित।
एतद् बाणपराक्रमस्य महिमा सत्पात्रदानं यथा॥

पार्थाय प्रतिबोधितां भगवता नारायणेन स्वयम्।
व्यासेन ग्रथितां पुराणमुनिना मध्ये महाभारतम्॥

अद्वैतामृतवर्षिणीं भगवतीमष्टादशाध्यायिनीम्।
अम्ब त्वामनुसन्दधामि भगवद्गीते भवद्वेषिणीम्॥

नमस्तुते व्यास विशालबुद्धे।
फुल्लारविन्दायतपत्रनेत्र।
येन त्वया भारततैलपूर्णः।
प्रज्वलितो ज्ञानमयः प्रदीपः॥`,
  },
];
