import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import agentRoutes from './routes/agent.js';
import { attachTranscribeWs } from './routes/transcribe.js';

const app = express();
const PORT = process.env.PORT || 3001;

//middleware part
app.use(cors());
app.use(express.json());

//health check part
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'NawaFlow' });
});

//agent routes part
app.use('/api/agent', agentRoutes);

//http + ws share the same port so the Vite proxy can forward both
const httpServer = createServer(app);
const wsServer = new WebSocketServer({ server: httpServer });
attachTranscribeWs(wsServer);

//start server part
httpServer.listen(PORT, () => {
  console.log(`NawaFlow server running on port ${PORT}`);
});
