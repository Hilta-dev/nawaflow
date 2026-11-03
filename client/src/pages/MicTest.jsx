import { useRef, useState, useCallback } from 'react'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { supabase } from '../lib/supabase'
import { saveSaleAction, savePayment } from '../lib/saveSale'

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

// ─── editable sale card helpers ──────────────────────────────────────────────

// initialise editable state from a record_sale action
function initDraft(action) {
  return {
    customer: action.customer ?? '',
    phone:    action.phone    ?? '',
    items: (action.items ?? []).map((it, i) => ({
      key: i,
      product: it.product ?? '',
      qty:     String(it.qty ?? ''),
      unit:    it.unit ?? '',
    })),
    total:   String(action.total ?? ''),
    paid:    String(action.paid  ?? ''),
  }
}

// returns an error string or '' — validates all business rules
function validateDraft(draft) {
  const name = draft.customer.trim().toLowerCase()
  if (!draft.customer.trim() || name === 'unknown') {
    return 'Please enter a customer name, or choose "Walk-in (cash sale)".'
  }
  const total = Number(draft.total)
  if (!draft.total.trim() || isNaN(total) || total <= 0) {
    return 'Total must be greater than 0.'
  }
  const paid = Number(draft.paid)
  if (draft.paid.trim() === '' || isNaN(paid) || paid < 0 || paid > total) {
    return 'Amount paid must be between 0 and the total.'
  }
  for (const it of draft.items) {
    const qty = Number(it.qty)
    if (!it.qty.trim() || isNaN(qty) || qty <= 0) {
      return `Quantity for "${it.product || 'item'}" must be greater than 0.`
    }
  }
  return ''
}

// ─── main component ───────────────────────────────────────────────────────────

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

  //editable draft for the sale card
  const [draft,       setDraft]       = useState(null)   // null = no card shown
  // true once the user has resolved the clarifying question by picking Walk-in or typing a real name
  const [clarifyingDismissed, setClarifyingDismissed] = useState(false)

  //save state
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState('')
  const [validationMsg, setValidationMsg] = useState('')

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
    setValidationMsg('')
    setDraft(null)
    setClarifyingDismissed(false)
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
        // initialise editable draft for sale actions
        const saleAction = data.actions?.find((a) => a.type === 'record_sale')
        if (saleAction) setDraft(initDraft(saleAction))
      }
    } catch (err) {
      setParseError(err.message)
    } finally {
      setParsing(false)
    }
  }

  // ── draft editors ──────────────────────────────────────────────────────────

  function setDraftField(field, value) {
    setDraft((d) => ({ ...d, [field]: value }))
    setValidationMsg('')
    // dismiss the clarifying question once the user types a real customer name
    if (field === 'customer') {
      const trimmed = value.trim().toLowerCase()
      if (trimmed && trimmed !== 'unknown') setClarifyingDismissed(true)
      else setClarifyingDismissed(false)
    }
  }

  function setItemField(key, field, value) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => it.key === key ? { ...it, [field]: value } : it),
    }))
    setValidationMsg('')
  }

  // set customer to Walk-in and force paid = total (no debt); dismiss any clarifying question
  function applyWalkIn() {
    setDraft((d) => {
      const total = d.total
      return { ...d, customer: 'Walk-in', paid: total }
    })
    setValidationMsg('')
    setClarifyingDismissed(true)
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function confirmSave() {
    if (!parsedSale) return

    // run validation before touching Supabase
    if (draft) {
      // block if parser returned a clarifying question that the user has not resolved
      if (parsedSale.clarifying_question && !clarifyingDismissed) {
        setValidationMsg('Please answer the question above before saving.')
        return
      }
      const vErr = validateDraft(draft)
      if (vErr) {
        setValidationMsg(vErr)
        return
      }
      // Walk-in: paid must equal total (no debt allowed)
      if (draft.customer.trim().toLowerCase() === 'walk-in') {
        const total = Number(draft.total)
        const paid  = Number(draft.paid)
        if (paid < total) {
          setValidationMsg(
            'A walk-in (cash) sale must be fully paid. Enter a customer name to record a debt.'
          )
          return
        }
      }
    }

    setSaving(true)
    setSaveMsg('')
    setValidationMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      if (draft) {
        // build the action from edited draft values and pass it directly
        const editedAction = {
          type:     'record_sale',
          customer: draft.customer.trim(),
          phone:    draft.phone.trim(),
          total:    Number(draft.total),
          paid:     Number(draft.paid),
          items:    draft.items.map((it) => ({
            product: it.product.trim(),
            qty:     Number(it.qty),
            unit:    it.unit,
          })),
        }
        await saveSaleAction(editedAction, user.id)
      }

      const hasPayment = parsedSale?.actions?.some((a) => a.type === 'record_payment')
      if (hasPayment) await savePayment(parsedSale, user.id)

      // clear the review card and show success
      setSaveMsg('✓ Saved')
      setParsedSale(null)
      setDraft(null)
    } catch (err) {
      setSaveMsg('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const seconds = (stats.bytes / 2 / 24000).toFixed(1)
  const displayText   = finalText || liveText
  const hasSale       = parsedSale?.actions?.some((a) => a.type === 'record_sale')
  const hasPayment    = parsedSale?.actions?.some((a) => a.type === 'record_payment')
  const paymentAction = parsedSale?.actions?.find((a) => a.type === 'record_payment')

  // confirm button is disabled when there is a clarifying question, or customer is empty/unknown
  const nameBlocked = draft &&
    (!draft.customer.trim() || draft.customer.trim().toLowerCase() === 'unknown')
  const hasClarifyingQuestion = !!parsedSale?.clarifying_question && !clarifyingDismissed
  const confirmDisabled = saving || nameBlocked || hasClarifyingQuestion

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

      {/* ── editable sale card ── */}
      {hasSale && draft && (
        <div style={boxStyle}>
          <SourceBadge label="SALE REVIEW" source={parseSource} />

          {/* clarifying question — blocks save */}
          {hasClarifyingQuestion && (
            <p style={{ margin: '8px 0 4px', fontSize: 13,
                        color: '#92400e', background: '#fef3c7',
                        border: '1px solid #fcd34d', borderRadius: 5,
                        padding: '6px 10px' }}>
              ❓ {parsedSale.clarifying_question}
            </p>
          )}

          {/* customer name */}
          <label style={labelStyle}>Customer name</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <input
              value={draft.customer}
              onChange={(e) => setDraftField('customer', e.target.value)}
              placeholder="Customer name"
              style={{ ...fieldStyle, flex: 1,
                borderColor: nameBlocked ? '#fca5a5' : '#d1d5db' }}
            />
            <button
              onClick={applyWalkIn}
              title="No customer — fully paid cash sale"
              style={ghostSmallBtn}
            >
              Walk-in (cash)
            </button>
          </div>

          {/* customer phone (optional) */}
          <label style={labelStyle}>Customer phone (optional)</label>
          <input
            type="tel"
            value={draft.phone}
            onChange={(e) => setDraftField('phone', e.target.value)}
            placeholder="e.g. 081 234 5678"
            style={{ ...fieldStyle, marginBottom: 8 }}
          />

          {/* items */}
          {draft.items.map((it) => (
            <div key={it.key} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input
                value={it.product}
                onChange={(e) => setItemField(it.key, 'product', e.target.value)}
                placeholder="Product"
                style={{ ...fieldStyle, flex: 2 }}
              />
              <input
                type="number"
                min="0"
                value={it.qty}
                onChange={(e) => setItemField(it.key, 'qty', e.target.value)}
                placeholder="Qty"
                style={{ ...fieldStyle, width: 64 }}
              />
              <input
                value={it.unit}
                onChange={(e) => setItemField(it.key, 'unit', e.target.value)}
                placeholder="Unit"
                style={{ ...fieldStyle, width: 60 }}
              />
            </div>
          ))}

          {/* total + paid */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Total (N$)</label>
              <input
                type="number"
                min="0"
                value={draft.total}
                onChange={(e) => setDraftField('total', e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Paid (N$)</label>
              <input
                type="number"
                min="0"
                value={draft.paid}
                onChange={(e) => setDraftField('paid', e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>

          {/* debt preview */}
          {(() => {
            const t = Number(draft.total)
            const p = Number(draft.paid)
            const owes = t - p
            if (!isNaN(t) && !isNaN(p) && owes > 0) {
              return (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#dc2626' }}>
                  Owes N${owes.toFixed(2)}
                </p>
              )
            }
            return null
          })()}
        </div>
      )}

      {/* parsed payment result (read-only, no editing needed) */}
      {hasPayment && (
        <div style={{ ...boxStyle, borderColor: '#bbf7d0' }}>
          <SourceBadge label="PARSED PAYMENT" source={parseSource} />
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            <strong>{paymentAction.customer}</strong> paid{' '}
            <strong>N${paymentAction.amount}</strong>
          </p>
        </div>
      )}

      {/* validation error */}
      {validationMsg && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626',
                    background: '#fef2f2', border: '1px solid #fca5a5',
                    borderRadius: 5, padding: '6px 10px' }}>
          {validationMsg}
        </p>
      )}

      {/* confirm + save — shown for sale or payment */}
      {(hasSale || hasPayment) && !saveMsg && (
        <button
          onClick={confirmSave}
          disabled={confirmDisabled}
          style={{
            ...btnStyle('#1d4ed8'),
            marginTop: 10,
            opacity: confirmDisabled ? 0.5 : 1,
            cursor: confirmDisabled ? 'not-allowed' : 'pointer',
          }}
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

function SourceBadge({ label, source }) {
  return (
    <strong style={{ fontSize: 12, color: '#555' }}>
      {label}
      {source && (
        <span style={{
          marginLeft: 8, padding: '1px 6px', borderRadius: 4,
          background: source === 'meta' ? '#dcfce7' : '#fef9c3',
          color: source === 'meta' ? '#166534' : '#854d0e',
          fontWeight: 'normal',
        }}>
          {source === 'meta' ? '✓ Meta AI' : '⚡ mock'}
        </span>
      )}
    </strong>
  )
}

const btnStyle = (bg) => ({
  background: bg, color: '#fff', border: 'none',
  borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 14,
})

const ghostSmallBtn = {
  background: 'none', border: '1px solid #d1d5db', borderRadius: 5,
  padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: '#374151',
  whiteSpace: 'nowrap',
}

const boxStyle = {
  background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 6, padding: '10px 12px', marginTop: 10,
}

const fieldStyle = {
  width: '100%', padding: '5px 8px', fontSize: 13,
  border: '1px solid #d1d5db', borderRadius: 5, boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block', fontSize: 11, color: '#57606a', marginBottom: 2,
}

export default MicTest
