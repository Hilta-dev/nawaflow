import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

const CATEGORIES = [
  'Transport',
  'Stock purchases',
  'Rent',
  'Electricity and water',
  'Airtime and data',
  'Wages',
  'Other',
]

const METHODS = ['Cash', 'Card', 'Mobile money']
const QUICK_AMOUNTS = [30, 60, 100]

function fmt(n) {
  return Number(n).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatExpenseDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString('en-NA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

function emptyForm() {
  return {
    category: 'Transport',
    amount: '',
    method: 'Cash',
    note: '',
    expense_date: todayIso(),
  }
}

export default function Expenses({ userId, onGoHome }) {
  const [view, setView] = useState('list')
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadErr('')
    const { data, error } = await supabase
      .from('expenses')
      .select('id, category, amount, method, note, expense_date, created_at')
      .eq('user_id', userId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    setLoading(false)
    if (error) { setLoadErr(error.message); return }
    setExpenses(data ?? [])
  }, [userId])

  useEffect(() => { load() }, [load])

  const today = todayIso()
  const todayTotal = expenses
    .filter((e) => e.expense_date === today)
    .reduce((s, e) => s + Number(e.amount ?? 0), 0)

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setFormErr('')
  }

  function validateForm() {
    if (!form.category) return 'Please choose a category.'
    const amount = Number(form.amount)
    if (form.amount === '' || isNaN(amount) || amount <= 0) {
      return 'Enter an amount greater than 0.'
    }
    if (!form.method) return 'Please choose a payment method.'
    if (!form.expense_date) return 'Please choose a date.'
    return ''
  }

  function goReview() {
    const err = validateForm()
    if (err) { setFormErr(err); return }
    setView('review')
  }

  async function confirmSave() {
    const err = validateForm()
    if (err) { setFormErr(err); setView('form'); return }
    setSaving(true)
    setFormErr('')
    const amount = roundMoney(form.amount)
    const payload = {
      user_id: userId,
      category: form.category,
      amount,
      method: form.method,
      note: form.note.trim() || null,
      expense_date: form.expense_date,
    }
    const { data, error } = await supabase
      .from('expenses')
      .insert(payload)
      .select('id, category, amount, method, note, expense_date')
      .single()
    setSaving(false)
    if (error) {
      setFormErr('Could not save: ' + error.message)
      setView('form')
      return
    }
    setSaved(data)
    setView('success')
    load()
  }

  function startNew() {
    setForm(emptyForm())
    setFormErr('')
    setSaved(null)
    setView('form')
  }

  function backToList() {
    setForm(emptyForm())
    setFormErr('')
    setSaved(null)
    setView('list')
    load()
  }

  if (view === 'success' && saved) {
    return (
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <button onClick={backToList} style={iconBtn} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>Expense confirmation</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={successCircle}>
            <Icon name="check" size={32} />
          </div>
          <p style={{ margin: '16px 0 4px', fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
            Expense recorded.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            Your business summaries are up to date.
          </p>
        </div>

        <div style={cardStyle}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#166534',
                      textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Saved
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 32, fontWeight: 700, color: '#1a1a1a' }}>
            N$ {fmt(saved.amount)}
          </p>
          <div style={detailBar}>
            <span>Category: {saved.category}</span>
            <span style={dot}>·</span>
            <span>Method: {saved.method}</span>
            <span style={dot}>·</span>
            <span>Date: {formatExpenseDate(saved.expense_date)}</span>
          </div>
        </div>

        <button onClick={backToList} style={{ ...btnStyle('#16a34a'), width: '100%', marginTop: 16 }}>
          Back to expenses
        </button>
        <button
          onClick={() => { backToList(); onGoHome?.() }}
          style={{ ...ghostBtnFull, marginTop: 8 }}
        >
          Back to home
        </button>
      </div>
    )
  }

  if (view === 'review') {
    const amount = roundMoney(form.amount)
    return (
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setView('form')} style={iconBtn} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>Record an expense</h3>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
          Keep the small costs visible.
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
          Review, then confirm.
        </p>

        <div style={cardStyle}>
          <ReviewRow label="Category" value={form.category} />
          <ReviewRow label="Date" value={formatExpenseDate(form.expense_date)} />
          <ReviewRow label="Payment method" value={form.method} />
          <ReviewRow label="Description" value={form.note.trim() || 'No note'} last />
        </div>

        <p style={{ margin: '20px 0 4px', fontSize: 12, fontWeight: 700, color: '#374151' }}>
          Amount · N$
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 36, fontWeight: 700, color: '#1a1a1a' }}>
          N$ {fmt(amount)}
        </p>

        <div style={infoBox}>
          This expense will be included in daily, weekly and monthly summaries after you confirm.
        </div>

        {formErr && <p style={errStyle}>{formErr}</p>}

        <button
          onClick={confirmSave}
          disabled={saving}
          style={{ ...btnStyle('#16a34a'), width: '100%', marginTop: 16 }}
        >
          {saving ? 'Saving…' : 'Confirm and save expense'}
        </button>
        <button
          onClick={() => setView('form')}
          style={{ ...ghostBtnFull, marginTop: 8 }}
        >
          Edit details
        </button>
      </div>
    )
  }

  if (view === 'form') {
    return (
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={backToList} style={iconBtn} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>Record an expense</h3>
        </div>

        <label style={labelStyle}>Category</label>
        <select
          value={form.category}
          onChange={(e) => setField('category', e.target.value)}
          style={fieldStyle}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <label style={labelStyle}>Amount (N$)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(e) => setField('amount', e.target.value)}
          placeholder="0.00"
          style={fieldStyle}
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {QUICK_AMOUNTS.map((n) => {
            const active = Number(form.amount) === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => setField('amount', String(n))}
                style={quickBtn(active)}
              >
                N${n}
              </button>
            )
          })}
        </div>

        <label style={labelStyle}>Payment method</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {METHODS.map((m) => {
            const active = form.method === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setField('method', m)}
                style={quickBtn(active)}
              >
                {m}
              </button>
            )
          })}
        </div>

        <label style={labelStyle}>Note</label>
        <input
          value={form.note}
          onChange={(e) => setField('note', e.target.value)}
          placeholder="e.g. Delivery to market"
          style={fieldStyle}
        />

        <label style={labelStyle}>Date</label>
        <input
          type="date"
          value={form.expense_date}
          onChange={(e) => setField('expense_date', e.target.value)}
          style={fieldStyle}
        />

        {formErr && <p style={errStyle}>{formErr}</p>}

        <button onClick={goReview} style={{ ...btnStyle('#16a34a'), width: '100%', marginTop: 8 }}>
          Review expense
        </button>
        <button onClick={backToList} style={{ ...ghostBtnFull, marginTop: 8 }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Expenses</h3>
        <button onClick={load} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="refresh" size={20} /> Refresh
        </button>
      </div>

      <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
        Every cost, accounted for.
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        {new Date().toLocaleDateString('en-NA', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <div style={summaryCard}>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
          Recorded today
        </p>
        <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#fff' }}>
          N$ {fmt(todayTotal)}
        </p>
      </div>

      <button
        onClick={startNew}
        style={{ ...btnStyle('#16a34a'), width: '100%', marginBottom: 20 }}
      >
        + Record an expense
      </button>

      <h4 style={sectionHead}>Latest expenses</h4>

      {loading && <p style={{ color: '#6b7280', padding: '24px 0', textAlign: 'center' }}>Loading…</p>}
      {loadErr && <p style={{ color: '#dc2626', fontSize: 13 }}>Error: {loadErr}</p>}

      {!loading && !loadErr && expenses.length === 0 && (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '32px 0' }}>
          No expenses yet. Tap Record an expense to get started.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {expenses.map((e) => (
          <div key={e.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 15, color: '#1a1a1a' }}>{e.category}</strong>
                {e.note && (
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>{e.note}</p>
                )}
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                  {formatExpenseDate(e.expense_date)} · {e.method}
                </p>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', flexShrink: 0 }}>
                N${fmt(e.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReviewRow({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid #e5e7eb',
    }}>
      <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const sectionHead = {
  margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '.04em',
}
const summaryCard = {
  background: '#14532d', borderRadius: 16, padding: '20px 18px', marginBottom: 16,
}
const cardStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb',
  borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '12px 14px',
}
const fieldStyle = {
  display: 'block', width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box',
  minHeight: 44, marginBottom: 8,
}
const labelStyle = {
  display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 2,
}
const errStyle = {
  fontSize: 12, color: '#dc2626', background: '#fef2f2',
  border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 10px', margin: '8px 0 0',
}
const btnStyle = (bg) => ({
  background: bg, color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 16px', fontSize: 14,
  cursor: 'pointer', minHeight: 44, fontWeight: 500,
})
const ghostBtn = {
  background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
  padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#374151',
  minHeight: 44,
}
const ghostBtnFull = {
  ...ghostBtn, width: '100%', textAlign: 'center',
}
const iconBtn = {
  background: 'none', border: 'none', padding: 8, cursor: 'pointer',
  color: '#374151', minWidth: 44, minHeight: 44,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const quickBtn = (active) => ({
  flex: 1, minHeight: 44, borderRadius: 8, fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  border: active ? '2px solid #16a34a' : '1px solid #d1d5db',
  background: active ? '#f0fdf4' : '#fff',
  color: active ? '#166534' : '#374151',
  padding: '8px 10px',
})
const infoBox = {
  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
  padding: '12px 14px', fontSize: 13, color: '#166534',
}
const successCircle = {
  width: 72, height: 72, borderRadius: '50%',
  background: '#dcfce7', color: '#16a34a',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const detailBar = {
  display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
  background: '#f0fdf4', borderRadius: 8, padding: '10px 12px',
  fontSize: 12, color: '#166534',
}
const dot = { opacity: 0.5 }
