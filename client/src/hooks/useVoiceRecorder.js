import { useRef, useState, useCallback } from 'react'

/**
 * useVoiceRecorder(onChunk, onTranscript)
 *
 * onChunk(ArrayBuffer)              — called for every raw PCM frame
 * onTranscript({ type, transcript }) — called for every message from /ws/transcribe
 *
 * Returned extra state:
 *   wsStatus  'idle' | 'connecting' | 'connected' | 'closed' | 'error'
 */
export function useVoiceRecorder(onChunk, onTranscript) {
  const [isRecording, setIsRecording] = useState(false)
  const [error,       setError]       = useState('')
  const [wsStatus,    setWsStatus]    = useState('idle')   // ← new

  const ctxRef    = useRef(null)
  const streamRef = useRef(null)
  const nodeRef   = useRef(null)
  const wsRef     = useRef(null)

  //keep the newest callbacks without causing re-renders
  const onChunkRef      = useRef(onChunk)
  const onTranscriptRef = useRef(onTranscript)
  onChunkRef.current      = onChunk
  onTranscriptRef.current = onTranscript

  //start part
  const start = useCallback(async () => {
    setError('')
    setWsStatus('connecting')
    try {
      //1. open WebSocket first so PCM can start flowing immediately
      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${wsProto}://${location.host}/ws/transcribe`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[transcribe] WebSocket connected')
        setWsStatus('connected')
      }

      ws.onclose = (e) => {
        console.log('[transcribe] WebSocket closed', e.code, e.reason)
        setWsStatus('closed')
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          console.log('transcribe msg', msg)   // ← required debug line
          onTranscriptRef.current?.(msg)
        } catch {
          console.warn('[transcribe] unparseable frame:', e.data)
        }
      }

      ws.onerror = (e) => {
        console.error('[transcribe] WebSocket error', e)
        setWsStatus('error')
        setError('WebSocket error — is the server running?')
      }

      //2. get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      // Force 24000 Hz so the graph runs at the target rate natively.
      // This paces chunk delivery at real-time and makes ratio=1 in the worklet.
      const ctx = new AudioContext({ sampleRate: 24000 })
      console.log('[recorder] AudioContext sampleRate:', ctx.sampleRate)
      await ctx.audioWorklet.addModule('/pcm-worklet.js')

      const source = ctx.createMediaStreamSource(stream)
      const node   = new AudioWorkletNode(ctx, 'pcm-processor')

      node.port.onmessage = (e) => {
        const buf = e.data
        console.log('[recorder] chunk bytes:', buf.byteLength)
        //pass chunk to the local consumer (for WAV preview)
        onChunkRef.current?.(buf)
        //stream to server over WebSocket
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(buf)
        }
      }

      //silent output so the browser keeps the worker alive
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(node)
      node.connect(mute)
      mute.connect(ctx.destination)

      streamRef.current = stream
      ctxRef.current    = ctx
      nodeRef.current   = node
      setIsRecording(true)
    } catch (err) {
      setWsStatus('error')
      setError(err.name + ': ' + err.message)
    }
  }, [])

  //stop part
  const stop = useCallback(() => {
    //flush any remaining PCM samples from the worklet
    nodeRef.current?.port.postMessage('flush')

    //tell the server we are done
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('stop')
    }

    setIsRecording(false)

    setTimeout(() => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      ctxRef.current?.close()
      streamRef.current = null
      ctxRef.current    = null
      nodeRef.current   = null
      wsRef.current     = null
    }, 150)
  }, [])

  return { isRecording, error, wsStatus, start, stop }
}
