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
  res.json({ status: 'ok', app: 'NawaFlow' });
});
app.use('/api/agent', agentRoutes);

//serve the built React app so one process handles everything
const distDir = join(__dirname, '../client/dist');
app.use(express.static(distDir));
//SPA fallback: any non-API path returns index.html
app.get('*', (req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

//http + ws share the same port
const httpServer = createServer(app);
const wsServer   = new WebSocketServer({ server: httpServer });
attachTranscribeWs(wsServer);

httpServer.listen(PORT, () => {
  console.log(`NawaFlow server running on port ${PORT}`);
});
