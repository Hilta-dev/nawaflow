import 'dotenv/config';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import agentRoutes from './routes/agent.js';
import { attachTranscribeWs } from './routes/transcribe.js';

//startup check: list available models once so logs show what the key can access
async function logAvailableModels() {
  const base  = process.env.META_API_BASE || 'https://api.meta.ai/v1';
  const key   = String(process.env.META_API_KEY || '').trim().replace(/^["']+|["']+$/g, '');
  const model = process.env.META_MODEL || 'muse-spark-1.1';
  if (!key) {
    console.log('[meta startup] no META_API_KEY set, running in mock mode');
    return;
  }
  try {
    const res  = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    let names = [];
    if (res.ok) {
      const data = await res.json();
      names = (data.data ?? data.models ?? []).map((m) => m.id ?? m.name ?? JSON.stringify(m));
    }
    console.log('[meta startup] models status=%d count=%d names=%s configured_model=%s base=%s',
      res.status, names.length, names.join(', ') || '(none)', model, base);
  } catch (err) {
    console.log('[meta startup] could not reach models endpoint: %s', err.message);
  }
}

const app  = express();
const PORT = process.env.PORT || 3001;
const __dirname = dirname(fileURLToPath(import.meta.url));

//middleware part
app.use(cors());
app.use(express.json());

//api routes part
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Nawa' });
});
app.use('/api/agent', agentRoutes);
//catch unknown /api/* paths before the SPA fallback
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown API route: ${req.method} ${req.path}` });
});

//serve the built React app so one process handles everything
const distDir = join(__dirname, '../client/dist');
app.use(express.static(distDir));
//SPA fallback — Express 5 requires a named wildcard, not bare '*'
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

//http + ws share the same port
const httpServer = createServer(app);
const wsServer   = new WebSocketServer({ server: httpServer });
attachTranscribeWs(wsServer);

httpServer.listen(PORT, () => {
  console.log(`Nawa server running on port ${PORT}`);
  logAvailableModels();
});
