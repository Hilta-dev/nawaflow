import { useRef, useState, useCallback, useEffect } from 'react'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { supabase } from '../lib/supabase'
import { saveSaleAction, savePaymentAction } from '../lib/saveSale'

// ─── payment draft helpers ────────────────────────────────────────────────────

// Given a record_payment action and a matched customer, build the paymentDraft.
// amount_mode: "exact" → use action.amount; "all" → balance; "half" → balance/2
function buildPaymentDraft(action, customer) {
  const balance = Number(customer.balance_owed ?? 0)
  let amount, amountLabel
  if (action.amount_mode === 'all') {
    amount = balance
    amountLabel = 'full balance'
  } else if (action.amount_mode === 'half') {
    amount = Math.round(balance / 2 * 100) / 100
    amountLabel = 'half of balance'
  } else {
    amount = Number(action.amount ?? 0)
    amountLabel = ''
  }
  return {
    customer:    customer.name,
    customerId:  customer.id,
    amount:      String(amount),
    amountLabel,
    balance,
  }
}

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

// ─── customer matching helpers ───────────────────────────────────────────────

// Strip possessive "'s", lowercase, trim
function normName(s) {
  return (s ?? '').toLowerCase().replace(/['']s\b/g, '').trim()
}

// Simple edit-distance (Levenshtein) for typo tolerance
function editDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Returns array of customers whose name is a close match to `parsedName`.
// Exact (case-insensitive) first; then edit-distance ≤ 2 for short names,
// ≤ 3 for longer names.
function matchCustomers(parsedName, customers) {
  const norm = normName(parsedName)
  if (!norm) return []
  const exact = customers.filter((c) => normName(c.name) === norm)
  if (exact.length) return exact
  const threshold = norm.length <= 5 ? 1 : 2
  return customers.filter((c) => editDistance(normName(c.name), norm) <= threshold)
}

// ─── greeting helper ─────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ─── main component ───────────────────────────────────────────────────────────

function MicTest({ session }) {
  const chunksRef       = useRef([])
  const silenceTimerRef = useRef(null)
  const autoStopRef     = useRef(null)

  const userId = session?.user?.id
  const shopName = session?.user?.user_metadata?.shop_name || 'Nawa'

  // ── mini stats ──────────────────────────────────────────────────────────────
  const [todaySalesCount, setTodaySalesCount] = useState(0)
  const [todayCollected,  setTodayCollected]  = useState(0)
  const [totalOwed,       setTotalOwed]       = useState(0)

  useEffect(() => {
    if (!userId) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    // today sales count
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'sale')
      .gte('created_at', todayISO)
      .then(({ count }) => setTodaySalesCount(count ?? 0))

    // today collected (sum of paid)
    supabase
      .from('transactions')
      .select('paid')
      .eq('user_id', userId)
      .eq('type', 'sale')
      .gte('created_at', todayISO)
      .then(({ data }) => {
        const sum = (data ?? []).reduce((s, r) => s + Number(r.paid ?? 0), 0)
        setTodayCollected(sum)
      })

    // total owed across all customers
    supabase
      .from('customers')
      .select('balance_owed')
      .eq('user_id', userId)
      .then(({ data }) => {
        const sum = (data ?? []).reduce((s, r) => s + Number(r.balance_owed ?? 0), 0)
        setTotalOwed(sum)
      })
  }, [userId])

  // ── audio / recording state ──────────────────────────────────────────────────
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
  const [draft,       setDraft]       = useState(null)
  const [clarifyingDismissed, setClarifyingDismissed] = useState(false)

  // payment review state
  // paymentDraft = { customer, amount (string), amountLabel, balance }
  const [paymentDraft,  setPaymentDraft]  = useState(null)
  // customerMatches: array of {name, balance_owed, id} shown as pick buttons
  const [customerMatches, setCustomerMatches] = useState(null) // null = not in pick state

  //save state
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState('')
  const [validationMsg, setValidationMsg] = useState('')
  const [dupWarning,  setDupWarning]  = useState(false)
  const forceSaveRef  = useRef(false)

  // ── load all customers once for matching ──────────────────────────────────
  const [myCustomers, setMyCustomers] = useState([])
  useEffect(() => {
    if (!userId) return
    supabase
      .from('customers')
      .select('id, name, balance_owed')
      .eq('user_id', userId)
      .then(({ data }) => setMyCustomers(data ?? []))
  }, [userId])

  //chunk callback
  const handleChunk = useCallback((buffer) => {
    chunksRef.current.push(buffer)
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

  const { isRecording, error, start, stop } = useVoiceRecorder(handleChunk, handleTranscript)

  //reset parse + save state
  function resetResult() {
    setParsedSale(null)
    setParseError('')
    setParseSource('')
    setSaveMsg('')
    setValidationMsg('')
    setDraft(null)
    setClarifyingDismissed(false)
    setPaymentDraft(null)
    setCustomerMatches(null)
    setDupWarning(false)
    forceSaveRef.current = false
  }

  //begin recording
  async function begin() {
    chunksRef.current = []
    clearTimeout(silenceTimerRef.current)
    clearTimeout(autoStopRef.current)
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
      const actions    = data.actions ?? []
      const saleAction = actions.find((a) => a.type === 'record_sale')
      const payAction  = actions.find((a) => a.type === 'record_payment')

      if (saleAction || payAction) {
        setParsedSale(data)
        if (saleAction) setDraft(initDraft(saleAction))
        if (payAction) {
          // match the parsed customer name against known customers
          const matches = matchCustomers(payAction.customer, myCustomers)
          if (matches.length === 0) {
            // no match — show friendly error, block save
            setParseError(`I don't know a customer called "${payAction.customer}". Check the name and try again.`)
            // clear the payment part of parsedSale so the save button doesn't appear
            setParsedSale({ ...data, actions: saleAction ? [saleAction] : [] })
          } else if (matches.length === 1) {
            setPaymentDraft(buildPaymentDraft(payAction, matches[0]))
          } else {
            // multiple matches — let user pick
            setCustomerMatches(matches.map((c) => ({ ...c, _payAction: payAction })))
          }
        }
      } else if (data.clarifying_question) {
        setParseError(data.clarifying_question)
      } else {
        setParseError(
          "I didn't quite catch that. Try something like:\n" +
          '  "Sold 2 bags of sugar to Alice, paid 50"\n' +
          '  "John paid 20 dollars"'
        )
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
    if (!parsedSale && !paymentDraft) return

    if (draft) {
      if (parsedSale.clarifying_question && !clarifyingDismissed) {
        setValidationMsg('Please answer the question above before saving.')
        return
      }
      const vErr = validateDraft(draft)
      if (vErr) {
        setValidationMsg(vErr)
        return
      }
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

    if (paymentDraft) {
      const amt = Number(paymentDraft.amount)
      if (!amt || amt <= 0) {
        setValidationMsg('Payment amount must be greater than zero.')
        return
      }
    }

    setSaving(true)
    setSaveMsg('')
    setValidationMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      if (draft) {
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

        // Duplicate sale check: same customer, same total, same items in last 10 minutes
        if (!forceSaveRef.current) {
          const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
          const { data: recentSales } = await supabase
            .from('transactions')
            .select('id, total, customer_id, transaction_items(product_name, qty), customers!inner(name)')
            .eq('user_id', user.id)
            .eq('type', 'sale')
            .eq('total', editedAction.total)
            .gte('created_at', tenMinsAgo)
            .ilike('customers.name', editedAction.customer)
            .limit(5)

          if (recentSales?.length > 0) {
            const draftItemKeys = editedAction.items
              .map((i) => `${i.product.toLowerCase()}:${i.qty}`)
              .sort()
              .join('|')
            const isDup = recentSales.some((s) => {
              const saleItemKeys = (s.transaction_items ?? [])
                .map((i) => `${(i.product_name ?? '').toLowerCase()}:${i.qty}`)
                .sort()
                .join('|')
              return saleItemKeys === draftItemKeys
            })
            if (isDup) {
              setSaving(false)
              setDupWarning(true)
              forceSaveRef.current = false
              return
            }
          }
        }
        forceSaveRef.current = false

        await saveSaleAction(editedAction, user.id)
      }

      if (paymentDraft) {
        await savePaymentAction(
          { customer: paymentDraft.customer, amount: Number(paymentDraft.amount) },
          user.id
        )
      }

      setSaveMsg('✓ Saved')
      setParsedSale(null)
      setDraft(null)
      setPaymentDraft(null)
    } catch (err) {
      setSaveMsg('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const displayText           = finalText || liveText
  const hasSale               = parsedSale?.actions?.some((a) => a.type === 'record_sale')

  const nameBlocked           = draft &&
    (!draft.customer.trim() || draft.customer.trim().toLowerCase() === 'unknown')
  const hasClarifyingQuestion = !!parsedSale?.clarifying_question && !clarifyingDismissed
  const paymentOverpaid       = paymentDraft && paymentDraft.balance > 0 &&
    Number(paymentDraft.amount) > paymentDraft.balance
  const confirmDisabled       = saving || nameBlocked || hasClarifyingQuestion ||
    (paymentDraft && (!Number(paymentDraft.amount) || Number(paymentDraft.amount) <= 0)) ||
    paymentOverpaid

  const fmtCurrency = (n) => `N$${Number(n).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div style={{ padding: '16px 16px 8px' }}>

      {/* ── greeting ── */}
      <p style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
        {greeting()}, {shopName}!
      </p>

      {/* ── mini stats row ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <MiniStat label="Today's sales" value={todaySalesCount} />
        <MiniStat label="Collected"     value={fmtCurrency(todayCollected)} />
        <MiniStat label="Owed"          value={fmtCurrency(totalOwed)} />
      </div>

      {/* ── large mic button ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
        <button
          onClick={isRecording ? finish : begin}
          style={micBtnStyle(isRecording)}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? '⏹' : '🎙'}
        </button>
        <span style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
          {isRecording ? 'Tap to stop' : 'Tap to record'}
        </span>
      </div>

      {/* ── type a sale ── */}
      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>or type a sale</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') parseSale(typedText) }}
          placeholder="e.g. Sold 2 bags of sugar to Alice, paid 150"
          style={{ flex: 1, padding: '10px 12px', fontSize: 14, borderRadius: 8,
                   border: '1px solid #d1d5db', minHeight: 44 }}
        />
        <button
          onClick={() => parseSale(typedText)}
          disabled={parsing || !typedText.trim()}
          style={{ ...btnStyle('#16a34a'), minWidth: 72, minHeight: 44 }}
        >
          {parsing ? 'Reviewing…' : 'Review'}
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', margin: '4px 0', fontSize: 13 }}>{error}</p>}

      {/* ── transcript box ── */}
      {(isRecording || displayText) && (
        <div style={boxStyle}>
          <p style={{ margin: 0, fontSize: 14 }}>
            {displayText || <span style={{ color: '#9ca3af' }}>Listening…</span>}
          </p>
        </div>
      )}

      {/* silence fallback */}
      {noSpeech && !displayText && (
        <p style={{ color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d',
                    borderRadius: 8, padding: '8px 12px', margin: '8px 0', fontSize: 13 }}>
          No speech detected or no response from Meta. Check the server console logs.
        </p>
      )}

      {/* review button (voice path) */}
      {finalText && !parsedSale && (
        <button
          onClick={() => parseSale(finalText)}
          disabled={parsing}
          style={{ ...btnStyle('#16a34a'), marginTop: 8, width: '100%', minHeight: 44 }}
        >
          {parsing ? 'Reviewing…' : '✓ Review'}
        </button>
      )}

      {/* parse error */}
      {parseError && (
        <p style={{ color: '#b45309', margin: '8px 0', fontSize: 13, whiteSpace: 'pre-line' }}>
          {parseError}
        </p>
      )}

      {/* ── editable sale card ── */}
      {hasSale && draft && (
        <div style={cardStyle}>
          <SourceBadge label="SALE REVIEW" source={parseSource} />

          {hasClarifyingQuestion && (
            <p style={{ margin: '8px 0 4px', fontSize: 13,
                        color: '#92400e', background: '#fef3c7',
                        border: '1px solid #fcd34d', borderRadius: 6,
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
              title="No customer, fully paid cash sale"
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

      {/* ── customer pick buttons (multiple fuzzy matches) ── */}
      {customerMatches && (
        <div style={{ ...cardStyle, borderColor: '#bfdbfe' }}>
          <strong style={{ fontSize: 12, color: '#6b7280' }}>PAYMENT: CHOOSE CUSTOMER</strong>
          <p style={{ margin: '6px 0 8px', fontSize: 13 }}>
            Several customers match that name. Who did you mean?
          </p>
          {customerMatches.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setPaymentDraft(buildPaymentDraft(c._payAction, c))
                setCustomerMatches(null)
              }}
              style={{ ...ghostSmallBtn, display: 'block', width: '100%',
                       marginBottom: 6, textAlign: 'left' }}
            >
              <strong>{c.name}</strong>
              <span style={{ marginLeft: 8, color: '#6b7280', fontSize: 12 }}>
                owes N${Number(c.balance_owed).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── payment review card ── */}
      {paymentDraft && (
        <div style={{ ...cardStyle, borderColor: '#bbf7d0' }}>
          <SourceBadge label="PAYMENT REVIEW" source={parseSource} />

          {/* zero balance notice */}
          {paymentDraft.balance <= 0 ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#166534',
                        background: '#dcfce7', border: '1px solid #bbf7d0',
                        borderRadius: 6, padding: '6px 10px' }}>
              {paymentDraft.customer} owes nothing right now.
            </p>
          ) : (
            <>
              <p style={{ margin: '8px 0 4px', fontSize: 13 }}>
                <strong>{paymentDraft.customer}</strong>
                <span style={{ marginLeft: 8, color: '#6b7280', fontSize: 12 }}>
                  balance: N${paymentDraft.balance.toFixed(2)}
                </span>
              </p>

              <label style={labelStyle}>
                Amount paid (N$)
                {paymentDraft.amountLabel && (
                  <span style={{ marginLeft: 6, color: '#16a34a', fontWeight: 600 }}>
                    ({paymentDraft.amountLabel})
                  </span>
                )}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentDraft.amount}
                onChange={(e) => {
                  setPaymentDraft((d) => ({ ...d, amount: e.target.value, amountLabel: '' }))
                  setValidationMsg('')
                }}
                style={{ ...fieldStyle, marginBottom: 4 }}
              />

              {/* overpayment warning + fix button */}
              {Number(paymentDraft.amount) > paymentDraft.balance && (
                <div style={{ margin: '4px 0 0', background: '#fef3c7',
                              border: '1px solid #fcd34d', borderRadius: 6, padding: '7px 8px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#92400e' }}>
                    This is more than the balance owed. Please correct the amount.
                  </p>
                  <button
                    onClick={() => setPaymentDraft((d) => ({
                      ...d, amount: String(d.balance), amountLabel: 'full balance',
                    }))}
                    style={{ ...btnStyle('#92400e'), fontSize: 12, padding: '5px 10px', minHeight: 0 }}
                  >
                    Pay the full balance (N${paymentDraft.balance.toFixed(2)})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* validation error */}
      {validationMsg && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626',
                    background: '#fef2f2', border: '1px solid #fca5a5',
                    borderRadius: 6, padding: '8px 10px' }}>
          {validationMsg}
        </p>
      )}

      {/* duplicate sale warning */}
      {dupWarning && (
        <div style={{ marginTop: 12, background: '#fef3c7', border: '1px solid #fcd34d',
                      borderRadius: 8, padding: '10px 12px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#92400e' }}>
            You already saved this sale a moment ago. Save it again?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { forceSaveRef.current = true; setDupWarning(false); confirmSave() }}
              style={{ ...btnStyle('#16a34a'), minHeight: 44, flex: 1 }}
            >
              Save again
            </button>
            <button
              onClick={resetResult}
              style={{ ...btnStyle('#6b7280'), minHeight: 44, flex: 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* confirm + save */}
      {(hasSale || paymentDraft) && !saveMsg && !dupWarning && (
        <button
          onClick={confirmSave}
          disabled={confirmDisabled}
          style={{
            ...btnStyle('#16a34a'),
            marginTop: 12,
            width: '100%',
            minHeight: 44,
            opacity: confirmDisabled ? 0.5 : 1,
            cursor: confirmDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : '💾 Confirm and save'}
        </button>
      )}

      {/* cancel */}
      {(hasSale || paymentDraft) && !saveMsg && !dupWarning && (
        <button
          onClick={resetResult}
          style={{ ...btnStyle('#6b7280'), marginTop: 8, width: '100%', minHeight: 44 }}
        >
          Cancel
        </button>
      )}

      {/* save result */}
      {saveMsg && (
        <p style={{
          margin: '10px 0 0', fontWeight: 600, fontSize: 15,
          color: saveMsg.startsWith('✓') ? '#166534' : '#dc2626',
        }}>
          {saveMsg}
        </p>
      )}

      {/* playback */}
      {audioUrl && (
        <div style={{ marginTop: 12 }}>
          <audio controls src={audioUrl} style={{ display: 'block', width: '100%' }} />
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div style={miniStatStyle}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{value}</div>
    </div>
  )
}

function SourceBadge({ label, source }) {
  return (
    <strong style={{ fontSize: 12, color: '#6b7280' }}>
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

// ── styles ────────────────────────────────────────────────────────────────────

const micBtnStyle = (recording) => ({
  width: 72,
  height: 72,
  borderRadius: '50%',
  background: recording ? '#dc2626' : '#16a34a',
  color: '#fff',
  border: 'none',
  fontSize: 28,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  minWidth: 72,
  minHeight: 72,
})

const miniStatStyle = {
  flex: 1,
  background: '#ffffff',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  padding: '10px 8px',
  textAlign: 'center',
  minWidth: 0,
}

const btnStyle = (bg) => ({
  background: bg, color: '#fff', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14,
})

const ghostSmallBtn = {
  background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
  padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: '#374151',
  whiteSpace: 'nowrap', minHeight: 44,
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  padding: '12px 14px',
  marginTop: 12,
}

const boxStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '10px 12px',
  marginTop: 10,
}

const fieldStyle = {
  width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box',
  minHeight: 44,
}

const labelStyle = {
  display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 2,
}

export default MicTest
