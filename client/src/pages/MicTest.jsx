import { useRef, useState, useCallback } from 'react'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { supabase } from '../lib/supabase'
import { saveSale } from '../lib/saveSale'

//wav helper part (only so you can hear the recording)
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
  const chunksRef       = useRef([])
  const silenceTimerRef = useRef(null)
  const autoStopRef     = useRef(null)

  const [stats,       setStats]       = useState({ chunks: 0, bytes: 0 })
  const [audioUrl,    setAudioUrl]    = useState('')

  //typed input
  const [typedText,   setTypedText]   = useState('')

  //transcript state
  const [liveText,    setLiveText]    = useState('')
  const [finalText,   setFinalText]   = useState('')
  const [noSpeech,    setNoSpeech]    = useState(false)

  //parse state
  const [parsedSale,  setParsedSale]  = useState(null)
  const [parseError,  setParseError]  = useState('')
  const [parsing,     setParsing]     = useState(false)
  const [parseSource, setParseSource] = useState('')

  //save state
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState('')

  //chunk callback
  const handleChunk = useCallback((buffer) => {
    chunksRef.current.push(buffer)
    setStats((s) => ({ chunks: s.chunks + 1, bytes: s.bytes + buffer.byteLength }))
  }, [])

  //transcript messages from the server WS
  const handleTranscript = useCallback((msg) => {
    clearTimeout(silenceTimerRef.current)
    setNoSpeech(false)
    if (msg.type === 'partial') {
      setLiveText(msg.transcript)
    } else if (msg.type === 'final') {
      setFinalText(msg.transcript)
      setLiveText('')
    } else if (msg.type === 'error') {
      setLiveText('')
    }
  }, [])

  const { isRecording, error, wsStatus, start, stop } = useVoiceRecorder(handleChunk, handleTranscript)

  //reset parse + save state
  function resetResult() {
    setParsedSale(null)
    setParseError('')
    setParseSource('')
    setSaveMsg('')
  }

  //begin recording
  async function begin() {
    chunksRef.current = []
    clearTimeout(silenceTimerRef.current)
    clearTimeout(autoStopRef.current)
    setStats({ chunks: 0, bytes: 0 })
    setAudioUrl('')
    setLiveText('')
    setFinalText('')
    setNoSpeech(false)
    resetResult()
    await start()
    autoStopRef.current = setTimeout(() => finish(), 30000)
  }

  //stop recording
  async function finish() {
    clearTimeout(autoStopRef.current)
    stop()
    setTimeout(() => {
      setAudioUrl(URL.createObjectURL(makeWav(chunksRef.current)))
    }, 400)
    silenceTimerRef.current = setTimeout(() => setNoSpeech(true), 5000)
  }

  //shared parse function — used by both voice and typed input
  async function parseSale(text) {
    if (!text) return
    setParsing(true)
    resetResult()
    try {
      const res = await fetch('/api/agent/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      })
      let data
      try { data = await res.json() }
      catch { throw new Error(`Server returned non-JSON (status ${res.status})`) }
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
      setParseSource(data.source || '')
      if (!data.actions?.length && data.clarifying_question) {
        setParseError(data.clarifying_question)
      } else {
        setParsedSale(data)
      }
    } catch (err) {
      setParseError(err.message)
    } finally {
      setParsing(false)
    }
  }

  //confirm and save to Supabase
  async function confirmSave() {
    if (!parsedSale) return
    setSaving(true)
    setSaveMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      await saveSale(parsedSale, user.id)
      setSaveMsg('✓ Saved')
    } catch (err) {
      setSaveMsg('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const seconds = (stats.bytes / 2 / 24000).toFixed(1)
  const displayText = finalText || liveText
  const hasSale = parsedSale?.actions?.some((a) => a.type === 'record_sale')

  const wsStatusColor = {
    idle: '#888', connecting: '#b45309', connected: '#166534',
    closed: '#555', error: '#dc2626',
  }[wsStatus] ?? '#888'

  return (
    <div style={{ border: '1px solid #ccc', padding: 16, marginTop: 16, maxWidth: 480, fontFamily: 'sans-serif' }}>
      <h3 style={{ marginTop: 0 }}>Voice recorder</h3>

      {/* typed input */}
      <p style={{ margin: '0 0 4px', fontSize: 12, color: '#57606a' }}>Or type a sale:</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <input
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') parseSale(typedText) }}
          placeholder="e.g. Sold 2 bags of sugar to Alice, paid 150"
          style={{ flex: 1, padding: '6px 8px', fontSize: 13, borderRadius: 5,
                   border: '1px solid #d1d5db' }}
        />
        <button
          onClick={() => parseSale(typedText)}
          disabled={parsing || !typedText.trim()}
          style={btnStyle('#16a34a')}
        >
          {parsing ? 'Parsing…' : 'Parse'}
        </button>
      </div>

      {/* record button */}
      {!isRecording ? (
        <button onClick={begin} style={btnStyle('#2563eb')}>🎙 Start recording</button>
      ) : (
        <button onClick={finish} style={btnStyle('#dc2626')}>⏹ Stop recording</button>
      )}

      {/* ws status */}
      <p style={{ margin: '6px 0 2px', fontSize: 12, color: wsStatusColor }}>
        Transcription: <strong>{wsStatus}</strong>
      </p>

      {/* stats */}
      <p style={{ margin: '2px 0 6px', color: '#555', fontSize: 13 }}>
        Chunks: {stats.chunks} | Audio: {seconds} s
      </p>

      {error && <p style={{ color: 'red', margin: '4px 0' }}>{error}</p>}

      {/* silence fallback */}
      {noSpeech && !displayText && (
        <p style={{ color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d',
                    borderRadius: 6, padding: '8px 12px', margin: '8px 0', fontSize: 13 }}>
          No speech detected or no response from Meta. Check the server console logs.
        </p>
      )}

      {/* live transcript */}
      {(isRecording || displayText) && (
        <div style={boxStyle}>
          <strong style={{ fontSize: 12, color: '#555' }}>
            {isRecording && !finalText ? 'LIVE TRANSCRIPT' : 'TRANSCRIPT'}
          </strong>
          <p style={{ margin: '4px 0 0' }}>
            {displayText || <span style={{ color: '#aaa' }}>Listening…</span>}
          </p>
        </div>
      )}

      {/* parse button (voice path) */}
      {finalText && !parsedSale && (
        <button
          onClick={() => parseSale(finalText)}
          disabled={parsing}
          style={{ ...btnStyle('#16a34a'), marginTop: 8 }}
        >
          {parsing ? 'Parsing…' : '✓ Parse sale'}
        </button>
      )}

      {/* parse error */}
      {parseError && <p style={{ color: '#b45309', margin: '6px 0' }}>{parseError}</p>}

      {/* parsed result */}
      {parsedSale && (
        <div style={boxStyle}>
          <strong style={{ fontSize: 12, color: '#555' }}>
            PARSED SALE
            {parseSource && (
              <span style={{
                marginLeft: 8, padding: '1px 6px', borderRadius: 4,
                background: parseSource === 'meta' ? '#dcfce7' : '#fef9c3',
                color: parseSource === 'meta' ? '#166534' : '#854d0e',
                fontWeight: 'normal',
              }}>
                {parseSource === 'meta' ? '✓ Meta AI' : '⚡ mock'}
              </span>
            )}
          </strong>
          <pre style={{ margin: '6px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(parsedSale, null, 2)}
          </pre>
        </div>
      )}

      {/* clarifying question */}
      {parsedSale?.clarifying_question && (
        <p style={{ marginTop: 8, fontStyle: 'italic', color: '#555' }}>
          ❓ {parsedSale.clarifying_question}
        </p>
      )}

      {/* confirm + save — only shown when there is an actual sale */}
      {hasSale && !saveMsg && (
        <button
          onClick={confirmSave}
          disabled={saving}
          style={{ ...btnStyle('#1d4ed8'), marginTop: 10 }}
        >
          {saving ? 'Saving…' : '💾 Confirm and save'}
        </button>
      )}

      {/* save result */}
      {saveMsg && (
        <p style={{
          margin: '8px 0 0', fontWeight: 600,
          color: saveMsg.startsWith('✓') ? '#166534' : '#dc2626',
        }}>
          {saveMsg}
        </p>
      )}

      {/* playback */}
      {audioUrl && (
        <div style={{ marginTop: 12 }}>
          <strong style={{ fontSize: 12, color: '#555' }}>PLAYBACK</strong>
          <audio controls src={audioUrl} style={{ display: 'block', marginTop: 4, width: '100%' }} />
        </div>
      )}
    </div>
  )
}

const btnStyle = (bg) => ({
  background: bg, color: '#fff', border: 'none',
  borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 14,
})

const boxStyle = {
  background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 6, padding: '10px 12px', marginTop: 10,
}

export default MicTest
