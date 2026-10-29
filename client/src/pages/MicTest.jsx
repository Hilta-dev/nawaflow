import { useRef, useState } from 'react'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'

//wav helper part (only so you can hear the result)
function makeWav(chunks) {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const buffer = new ArrayBuffer(44 + total)
  const view = new DataView(buffer)
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + total, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 24000, true)
  view.setUint32(28, 24000 * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, total, true)
  let offset = 44
  for (const c of chunks) {
    new Uint8Array(buffer, offset, c.byteLength).set(new Uint8Array(c))
    offset += c.byteLength
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

function MicTest() {
  const chunksRef = useRef([])
  const [stats, setStats] = useState({ chunks: 0, bytes: 0 })
  const [audioUrl, setAudioUrl] = useState('')

  //chunk part
  function handleChunk(buffer) {
    chunksRef.current.push(buffer)
    setStats((s) => ({ chunks: s.chunks + 1, bytes: s.bytes + buffer.byteLength }))
  }

  const { isRecording, error, start, stop } = useVoiceRecorder(handleChunk)

  //begin part
  async function begin() {
    chunksRef.current = []
    setStats({ chunks: 0, bytes: 0 })
    setAudioUrl('')
    await start()
  }

  //finish part
  function finish() {
    stop()
    setTimeout(() => {
      setAudioUrl(URL.createObjectURL(makeWav(chunksRef.current)))
    }, 400)
  }

  const seconds = (stats.bytes / 2 / 24000).toFixed(1)

  return (
    <div style={{ border: '1px solid #ccc', padding: 12, marginTop: 16, maxWidth: 360 }}>
      <h3>Mic test</h3>
      {!isRecording ? (
        <button onClick={begin}>Start recording</button>
      ) : (
        <button onClick={finish}>Stop recording</button>
      )}
      <p>Chunks: {stats.chunks} | Audio length: {seconds} s</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {audioUrl && <audio controls src={audioUrl} />}
    </div>
  )
}

export default MicTest