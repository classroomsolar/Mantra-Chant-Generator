import 'dotenv/config';
import express from 'express';
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const VAGDHENU_SPACE_BASE = (
  process.env.VAGDHENU_BASE_URL || 'https://prathoshap-vagdhenu-demo.hf.space'
).replace(/\/+$/, '');
const VAGDHENU_SUPPORTED_METERS = new Set([
  '__auto__',
  'anuṣṭubh',
  'upajāti',
  'śārdūlavikrīḍita',
  'vasantatilakā',
  'pramāṇikā',
  'indravajrā',
  'upendravajrā',
  'vaṃśastha',
  'rathoddhatā',
  'śālinī',
  'indravaṃśā',
  'drutavilambita',
  'bhujaṅgaprayāta',
  'mālinī',
  'sragdharā',
  'gadya',
]);

class VagdhenuServiceError extends Error {
  status: number;
  quotaExhausted: boolean;
  constructor(message: string, status = 502, quotaExhausted = false) {
    super(message);
    this.status = status;
    this.quotaExhausted = quotaExhausted;
  }
}

async function synthesizeWithVagdhenu(
  text: string,
  meter: string,
  seed = 60
): Promise<{wavBuffer: Buffer; detectedLabel: string}> {
  const meterChoice = VAGDHENU_SUPPORTED_METERS.has(meter) ? meter : '__auto__';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  const hfHeaders: Record<string, string> = {};
  if (process.env.HF_TOKEN) {
    hfHeaders.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  }

  try {
    const sessionHash = `ch${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const joinResp = await fetch(`${VAGDHENU_SPACE_BASE}/gradio_api/queue/join`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...hfHeaders},
      body: JSON.stringify({
        data: [text, meterChoice, seed],
        event_data: null,
        fn_index: 0,
        trigger_id: 10,
        session_hash: sessionHash,
      }),
      signal: controller.signal,
    });

    if (!joinResp.ok) {
      throw new VagdhenuServiceError(
        `Vāgdhenu service unavailable (HTTP ${joinResp.status}).`,
        joinResp.status === 429 ? 429 : 502,
        joinResp.status === 429
      );
    }

    const sseResp = await fetch(
      `${VAGDHENU_SPACE_BASE}/gradio_api/queue/data?session_hash=${encodeURIComponent(sessionHash)}`,
      {headers: hfHeaders, signal: controller.signal}
    );
    if (!sseResp.ok || !sseResp.body) {
      throw new VagdhenuServiceError(`Vāgdhenu stream failed (HTTP ${sseResp.status}).`, 502);
    }

    const reader = sseResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completedEvent: {
      success?: boolean;
      output?: {
        error?: string | null;
        data?: [{url?: string; path?: string} | null, string?];
      };
    } | null = null;

    while (true) {
      const {value, done} = await reader.read();
      if (value) {
        buffer += decoder.decode(value, {stream: !done});
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const rawJson = line.slice(5).trim();
          if (!rawJson) continue;
          try {
            const msg = JSON.parse(rawJson) as {
              msg?: string;
              success?: boolean;
              output?: {
                error?: string | null;
                data?: [{url?: string; path?: string} | null, string?];
              };
            };
            if (msg.msg === 'process_completed') {
              completedEvent = msg;
              break;
            }
          } catch {
            // ignore non-JSON SSE keepalives
          }
        }
        if (completedEvent) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
      if (done) break;
    }

    if (!completedEvent) {
      throw new VagdhenuServiceError('Vāgdhenu did not finish synthesis before stream closed.', 502);
    }

    if (!completedEvent.success) {
      const rawErr = String(completedEvent.output?.error || 'Vāgdhenu synthesis failed.').trim();
      const isQuota = /ZeroGPU quota|today's limit|daily.*limit|quota/i.test(rawErr);
      const cleanErr = isQuota
        ? 'Vāgdhenu public Space hit its shared ZeroGPU / 10-chants-per-day limit. Configure HF_TOKEN on the server or self-host prathoshap/vagdhenu on a dedicated GPU for larger batches.'
        : rawErr.replace(/^Sorry,\s*rendering failed:\s*/i, '').slice(0, 240);
      throw new VagdhenuServiceError(cleanErr, isQuota ? 429 : 502, isQuota);
    }

    const outData = completedEvent.output?.data;
    const fileMeta = outData?.[0];
    const fileUrl =
      fileMeta?.url ||
      (fileMeta?.path ? `${VAGDHENU_SPACE_BASE}/gradio_api/file=${fileMeta.path}` : '');
    if (!fileUrl) {
      throw new VagdhenuServiceError('Vāgdhenu response missing audio file URL.', 502);
    }

    const wavResp = await fetch(fileUrl, {headers: hfHeaders, signal: controller.signal});
    if (!wavResp.ok) {
      throw new VagdhenuServiceError(
        `Failed to fetch Vāgdhenu WAV audio (HTTP ${wavResp.status}).`,
        502
      );
    }
    const wavBuffer = Buffer.from(await wavResp.arrayBuffer());
    const labelRaw = typeof outData?.[1] === 'string' ? outData[1] : '';
    const detectedLabel = labelRaw.replace(/[*_`🪶🪔]/g, '').replace(/^Detected meter:\s*/i, '').trim();
    return {wavBuffer, detectedLabel};
  } finally {
    clearTimeout(timer);
  }
}

app.use('/api/encode-mp3', express.raw({type: 'application/octet-stream', limit: '250mb'}));
app.use(express.json({limit: '10mb'}));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'chandahsvara',
    reciterEngine: 'vagdhenu',
  });
});

app.post('/api/encode-mp3', (req, res) => {
  req.setTimeout(10 * 60 * 1000);
  res.setTimeout(10 * 60 * 1000);
  const inputBuf = req.body;
  if (!Buffer.isBuffer(inputBuf) || inputBuf.length < 44) {
    res.status(400).json({error: 'Expected raw WAV audio payload.'});
    return;
  }

  const bitrateRaw = String(req.query.bitrate || '192k');
  const bitrate = /^(128k|192k|256k|320k)$/.test(bitrateRaw) ? bitrateRaw : '192k';

  const cleanTag = (v: unknown, fallback: string) =>
    String(v || fallback)
      .replace(/[\r\n\0]/g, ' ')
      .trim()
      .slice(0, 120) || fallback;

  const metaTitle = req.query.title ? cleanTag(req.query.title, 'Śloka') : '';
  const metaAlbum = cleanTag(req.query.album, 'Chandaḥsvara');
  const metaTrack = req.query.track ? cleanTag(req.query.track, '') : '';

  const ffArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'wav',
    '-i',
    'pipe:0',
    '-ar',
    '44100',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    bitrate,
    '-id3v2_version',
    '3',
    '-metadata',
    'artist=Chandaḥsvara',
    '-metadata',
    `album=${metaAlbum}`,
  ];
  if (metaTitle) ffArgs.push('-metadata', `title=${metaTitle}`);
  if (metaTrack) ffArgs.push('-metadata', `track=${metaTrack}`);
  ffArgs.push('-f', 'mp3', 'pipe:1');

  const ff = spawn('ffmpeg', ffArgs);

  const chunks: Buffer[] = [];
  const errChunks: Buffer[] = [];

  ff.stdout.on('data', (d: Buffer) => chunks.push(d));
  ff.stderr.on('data', (d: Buffer) => errChunks.push(d));

  ff.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({error: `FFmpeg failed to start: ${err.message}`});
    }
  });

  ff.on('close', (code) => {
    if (res.headersSent) return;
    if (code !== 0) {
      const msg = Buffer.concat(errChunks).toString('utf8').trim() || `FFmpeg exited with code ${code}`;
      res.status(500).json({error: msg});
      return;
    }
    const mp3 = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(mp3.length));
    res.send(mp3);
  });

  ff.stdin.end(inputBuf);
});

app.post('/api/recite', async (req, res) => {
  try {
    const {text, meter, seed} = req.body as {
      text?: string;
      meter?: string;
      seed?: number;
    };

    const cleanText = (text || '').trim();
    if (!cleanText) {
      res.status(400).json({error: 'Śloka text is required.'});
      return;
    }
    if (cleanText.length > 1500) {
      res.status(400).json({error: 'Single śloka text exceeds maximum length (1500 characters).'});
      return;
    }

    const meterDesc = meter && meter !== '__auto__' ? meter : 'classical Sanskrit vṛtta';
    const safeSeed =
      typeof seed === 'number' && Number.isFinite(seed)
        ? Math.max(0, Math.min(1000, Math.round(seed)))
        : 60;

    const {wavBuffer, detectedLabel} = await synthesizeWithVagdhenu(
      cleanText,
      meter || '__auto__',
      safeSeed
    );

    res.json({
      contentType: 'audio/wav',
      audioBase64: wavBuffer.toString('base64'),
      meter: detectedLabel || meterDesc,
      voice: 'Vāgdhenu',
    });
  } catch (err) {
    if (err instanceof VagdhenuServiceError) {
      res.status(err.status).json({error: err.message, quotaExhausted: err.quotaExhausted});
      return;
    }
    const msg =
      err instanceof Error && err.name === 'AbortError'
        ? 'Vāgdhenu Space timed out (>55s). Please retry this śloka.'
        : err instanceof Error
        ? err.message
        : 'Vāgdhenu synthesis failed.';
    res.status(502).json({error: msg});
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Chandaḥsvara listening on http://localhost:${PORT}`);
  });
}

startServer();
