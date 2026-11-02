import { Router } from 'express';
import { parseTranscript } from '../services/agent.js';

const router = Router();

//parse part
router.post('/parse', async (req, res) => {
  const transcript = String(req.body?.transcript || '').trim();
  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' });
  }
  try {
    const result = await parseTranscript(transcript);
    res.json(result);
  } catch (err) {
    //log status + message; never log keys or audio content
    console.error('[agent/parse] error status=502 message=%s', err.message);
    res.status(502).json({ error: 'Could not understand that. Please try again.' });
  }
});

export default router;
