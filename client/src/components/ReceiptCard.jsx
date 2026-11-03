/**
 * ReceiptCard.jsx
 *
 * Props:
 *   text        string   the full receipt plain text
 *   phone       string   stored phone (may be empty or invalid)
 *   onDone      fn       called when user taps "Done"
 *
 * Shows Copy, WhatsApp and SMS buttons. If the phone is missing or invalid
 * shows a small one-time input so the user can type a number for this receipt.
 */
import { useState } from 'react'
import { isValidPhone } from '../lib/phone'
import { buildReceiptUrls } from '../lib/receipt'

const PHONE_INVALID_MSG =
  'That number does not look right. Namibian mobile numbers look like 081 234 5678.'

export default function ReceiptCard({ text, phone, onDone }) {
  const [oneTimePhone, setOneTimePhone] = useState('')
  const [copied,       setCopied]       = useState(false)

  // Use the stored phone if it is valid, otherwise fall through to one-time input.
  const storedKind = isValidPhone(phone)
  const hasValidStored = storedKind !== 'empty' && storedKind !== 'invalid'

  const activePhone = hasValidStored ? phone : oneTimePhone
  const otKind      = isValidPhone(oneTimePhone)
  const otInvalid   = oneTimePhone.trim() && otKind === 'invalid'

  const urls = buildReceiptUrls(activePhone, text)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select a textarea
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={cardStyle}>
      <strong style={{ fontSize: 12, color: '#166534', textTransform: 'uppercase',
                       letterSpacing: '.04em' }}>
        Saved. Send receipt?
      </strong>

      {/* receipt preview */}
      <pre style={{ margin: '8px 0', fontSize: 12, color: '#374151',
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 6, padding: '8px 10px',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
        {text}
      </pre>

      {/* one-time phone input when no valid stored number */}
      {!hasValidStored && (
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            Phone number for this receipt (optional)
          </label>
          <input
            type="tel"
            value={oneTimePhone}
            onChange={(e) => setOneTimePhone(e.target.value)}
            placeholder="e.g. 081 234 5678"
            style={{
              width: '100%', padding: '8px 10px', fontSize: 14,
              border: `1px solid ${otInvalid ? '#fca5a5' : '#d1d5db'}`,
              borderRadius: 6, boxSizing: 'border-box', minHeight: 44,
            }}
          />
          {otInvalid && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>
              {PHONE_INVALID_MSG}
            </p>
          )}
        </div>
      )}

      {/* send buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {urls && !otInvalid && (
          <>
            <a href={urls.wa} target="_blank" rel="noopener noreferrer" style={waBtn}>
              WhatsApp
            </a>
            <a href={urls.sms} style={smsBtn}>
              SMS
            </a>
          </>
        )}
        <button onClick={copy} style={copyBtn}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {urls && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9ca3af' }}>
          If WhatsApp does not open, tap SMS.
        </p>
      )}

      <button onClick={onDone} style={doneBtn}>Done</button>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────
const cardStyle = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: 12,
  padding: '12px 14px',
  marginTop: 12,
}
const labelStyle = {
  display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4,
}
const baseBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '6px 14px', fontSize: 13, borderRadius: 8,
  border: 'none', cursor: 'pointer', minHeight: 44,
  textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
}
const waBtn  = { ...baseBtn, background: '#22c55e', color: '#fff' }
const smsBtn = { ...baseBtn, background: '#3b82f6', color: '#fff' }
const copyBtn = { ...baseBtn, background: '#e5e7eb', color: '#374151' }
const doneBtn = {
  ...baseBtn, background: '#16a34a', color: '#fff', width: '100%',
}
