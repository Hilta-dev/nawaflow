import 'dotenv/config';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import agentRoutes from './routes/agent.js';
import { attachTranscribeWs } from './routes/transcribe.js';

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
});
