/**
 * /ws/transcribe  — browser WebSocket proxy to Meta Muse Voice Transcribe.
 *
 * Handshake (official schema: dev.meta.ai/docs/api-reference/voice/schemas):
 *   1.  Open wss://api.meta.ai/v1/asr/realtime — NO auth header on the upgrade
 *   2.  Send ONE JSON text frame immediately:
 *         { authorization: { accessToken: "Bearer <key>" },
 *           audioEncoding: "PCM_24KHZ",
 *           model: "muse-voice-transcribe-1.0",
 *           mode: "PUSH_TO_TALK",
 *           partialMode: "CUMULATIVE" }
 *   3.  Wait for ANY message that has a "sessionId" field — that is the ack.
 *   4.  Only then send binary PCM16 frames (24 kHz mono).
 *   5.  Signal end-of-stream with { "type": "endStream" }.
 *   6.  Meta sends transcript messages; log the raw JSON to learn the exact shape.
 *
 * Protocol (browser → this server):
 *   binary frames  : raw Int16 PCM chunks at 24 kHz mono
 *   text "stop"    : browser is done speaking
 *
 * Protocol (this server → browser):
 *   { type: "partial", transcript }
 *   { type: "final",   transcript }
 *   { type: "error",   message    }
 */

import { WebSocket } from 'ws';

const UPSTREAM = 'wss://api.meta.ai/v1/asr/realtime';
const MODEL    = 'muse-voice-transcribe-1.0';

export function attachTranscribeWs(wsServer) {
  wsServer.on('connection', (clientWs, req) => {
    //only handle our path
    if (req.url !== '/ws/transcribe') return;

    console.log('[transcribe] browser connected');

    const apiKey = process.env.META_API_KEY;

    // ─── mock mode ─────────────────────────────────────────────────────────────
    if (!apiKey) {
      console.log('[transcribe] no META_API_KEY — running in mock mode');
      let mockTimer = null;

      clientWs.on('message', (data) => {
        if (typeof data === 'string' && data === 'stop') {
          console.log('[transcribe] mock: browser sent stop');
          clearInterval(mockTimer);
          mockTimer = null;
          clientWs.send(JSON.stringify({
            type: 'final',
            transcript: 'Sold 2 bags of maize to Grace, she paid 100 and owes 50.',
          }));
          return;
        }
        if (!mockTimer) {
          mockTimer = setInterval(() => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'partial', transcript: '…listening…' }));
            }
          }, 500);
        }
      });

      clientWs.on('close', () => {
        console.log('[transcribe] mock: browser disconnected');
        clearInterval(mockTimer);
      });
      return;
    }

    // ─── real mode ──────────────────────────────────────────────────────────────
    let sessionReady  = false;
    let endStreamSent = false;            // true after we signal stop to Meta
    let closeTimer    = null;             // 5-s safety timeout after endStream
    const pending     = [];              // PCM frames buffered before sessionId ack

    // Open the upstream connection with NO auth headers on the HTTP upgrade.
    const upstream = new WebSocket(UPSTREAM);

    upstream.on('open', () => {
      console.log('[transcribe] upstream socket open — sending credential frame');

      // ── First (and only) config frame — exact schema from official docs ─────
      // No extra fields: no sampleRate, no channels, no language.
      upstream.send(JSON.stringify({
        authorization: { accessToken: `Bearer ${apiKey}` },
        audioEncoding: 'PCM_24KHZ',
        model:         MODEL,
        mode:          'PUSH_TO_TALK',
        partialMode:   'CUMULATIVE',
      }));
      // Do NOT send audio yet — wait for the sessionId ack message first.
    });

    upstream.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        // Non-JSON frame from Meta — ignore silently
        return;
      }

      // ── Always print the full raw JSON (requirement 4) ─────────────────────
      // This lets us see exactly what field names Meta uses in production.
      // The key is never present in these messages so this is safe to log.
      console.log('[transcribe] upstream raw:', JSON.stringify(msg));

      // ── Session ack: any message that carries sessionId ────────────────────
      // The official docs do not give this message a "type" field; the
      // only reliable signal is the presence of sessionId.
      if (!sessionReady && msg.sessionId) {
        console.log('[transcribe] session ready (sessionId present), flushing',
          pending.length, 'buffered frame(s)');
        sessionReady = true;
        for (const frame of pending) upstream.send(frame);
        pending.length = 0;
        return;
      }

      // ── Transcript messages ────────────────────────────────────────────────
      // Confirmed shape from the server log: { type:"transcript", transcript:"...", final:true/false }
      // Also handle older guessed shapes so nothing is silently dropped.
      const text = msg.transcript ?? msg.text ?? '';

      const isPartial =
        (msg.type === 'transcript' && msg.final === false) ||
        msg.type === 'transcript.partial' ||
        (msg.type === 'TRANSCRIPT' && msg.isFinal === false) ||
        msg.type === 'partial';

      const isFinal =
        (msg.type === 'transcript' && msg.final === true) ||
        msg.type === 'transcript.final' ||
        msg.type === 'transcript.done'  ||
        (msg.type === 'TRANSCRIPT' && msg.isFinal === true);

      if (isPartial && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'partial', transcript: text }));
        return;
      }
      if (isFinal && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'final', transcript: text }));
        // Final received — cancel the safety timer and close cleanly
        clearTimeout(closeTimer);
        if (upstream.readyState === WebSocket.OPEN) upstream.close(1000, 'done');
        return;
      }

      // ── Error message from Meta ────────────────────────────────────────────
      if (msg.type === 'error' || msg.error) {
        const detail = JSON.stringify(msg.error ?? msg.message ?? msg);
        console.error('[transcribe] Meta error message:', detail);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', message: 'Meta error: ' + detail }));
        }
      }
      // All other message types are logged by the raw line above; no crash.
    });

    upstream.on('error', (err) => {
      // WebSocket 'error' events from the 'ws' library rarely carry a useful
      // message — the real reason arrives in the 'close' event's reason buffer.
      console.error('[transcribe] upstream socket error:', err.message || '(no message)');
    });

    upstream.on('close', (code, reasonBuf) => {
      clearTimeout(closeTimer);
      const reason = reasonBuf ? reasonBuf.toString() : '';
      console.log('[transcribe] upstream closed — code:', code, '| reason:', reason || '(none)');
      if (clientWs.readyState !== WebSocket.OPEN) return;
      // 1000 = normal close, OR we already sent endStream (Meta closes with 1008
      // "ingress slower than real-time" when it receives endStream — treat that
      // as normal too, because the final transcript was already delivered above).
      const isNormal = code === 1000 || endStreamSent;
      if (!isNormal) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: `Upstream closed ${code}: ${reason || 'no reason given'}`,
        }));
      }
      clientWs.close();
    });

    // ── Forward messages from the browser to Meta ───────────────────────────
    clientWs.on('message', (data, isBinary) => {
      // The 'ws' library delivers BOTH text and binary frames as Buffer objects,
      // so typeof checks are unreliable. Use the isBinary flag instead.
      if (!isBinary) {
        // Text frame — decode and check for the stop command
        const text = data.toString();
        if (text === 'stop') {
          console.log('[transcribe] browser sent stop — signalling endStream');
          if (upstream.readyState === WebSocket.OPEN) {
            endStreamSent = true;
            upstream.send(JSON.stringify({ type: 'endStream' }));
            // Safety: force-close after 5 s if Meta never sends the final transcript
            closeTimer = setTimeout(() => {
              console.log('[transcribe] endStream timeout — forcing close');
              if (upstream.readyState === WebSocket.OPEN) upstream.close();
            }, 5000);
          }
        }
        return;
      }

      // Binary: raw PCM16 chunk — forward to Meta
      console.log('[transcribe] chunk bytes:', data.byteLength);
      if (sessionReady && upstream.readyState === WebSocket.OPEN) {
        upstream.send(data);
      } else {
        pending.push(data);
      }
    });

    clientWs.on('close', () => {
      console.log('[transcribe] browser disconnected');
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    clientWs.on('error', (err) => {
      console.error('[transcribe] client error:', err.message);
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });
  });
}
