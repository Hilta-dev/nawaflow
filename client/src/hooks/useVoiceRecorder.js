import { useRef, useState } from 'react'

export function useVoiceRecorder(onChunk) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState('')
  const ctxRef = useRef(null)
  const streamRef = useRef(null)
  const nodeRef = useRef(null)

  //keep the newest callback
  const onChunkRef = useRef(onChunk)
  onChunkRef.current = onChunk

  //start part
  async function start() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const ctx = new AudioContext()
      await ctx.audioWorklet.addModule('/pcm-worklet.js')

      const source = ctx.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(ctx, 'pcm-processor')
      node.port.onmessage = (e) => onChunkRef.current(e.data)

      //silent output so the browser keeps the worker running
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(node)
      node.connect(mute)
      mute.connect(ctx.destination)

      streamRef.current = stream
      ctxRef.current = ctx
      nodeRef.current = node
      setIsRecording(true)
    } catch (err) {
      setError(err.name + ': ' + err.message)
    }
  }

  //stop part
  function stop() {
    nodeRef.current?.port.postMessage('flush')
    setIsRecording(false)
    setTimeout(() => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      ctxRef.current?.close()
      streamRef.current = null
      ctxRef.current = null
      nodeRef.current = null
    }, 150)
  }

  return { isRecording, error, start, stop }
}