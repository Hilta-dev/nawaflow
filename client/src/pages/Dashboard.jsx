import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDashboard } from '../hooks/useDashboard'

function fmt(n) {
  return Number(n).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * normalisePhone(raw)
 *
 * Namibian number rules:
 *   - Remove spaces and dashes
 *   - If it already starts with +264 or 264, strip leading + and return as-is
 *   - If it starts with 0, remove the leading 0 and prepend 264
 *   - Otherwise just prepend 264
 *
 * e.g.  081 234 5678   →  264812345678
 *       +264812345678  →  264812345678
 */
function normalisePhone(raw) {
  if (!raw) return ''
  const clean = raw.replace(/[\s\-]/g, '')
  if (clean.startsWith('+264')) return clean.slice(1)       // +264... → 264...
  if (clean.startsWith('264'))  return clean                 // already correct
  if (clean.startsWith('0'))    return '264' + clean.slice(1) // 0... → 264...
  return '264' + clean
}

function buildWaUrl(phone, name, owed, shopName) {
  const number = normalisePhone(phone)
  const shop   = shopName?.trim() || 'Nawa'
  const text   = `Hi ${name}, a friendly reminder that you owe N$${fmt(owed)} to ${shop}. Thank you!`
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

// ── inline phone editor for a single debtor card ──────────────────────────────

function PhoneEditor({ debtorId, userId, currentPhone, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(currentPhone)
  const [saving,  setSaving]  = useState(false)

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('customers')
      .update({ phone: value.trim() || null })
      .eq('id', debtorId)
      .eq('user_id', userId)
    setSaving(false)
    if (!error) {
      setEditing(false)
      onSaved(value.trim())
    }
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={smallLinkBtn}>
        {currentPhone ? 'Edit' : 'Add number'}
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 081 234 5678"
        style={{ padding: '6px 8px', fontSize: 13, border: '1px solid #d1d5db',
                 borderRadius: 6, width: 140, minHeight: 36 }}
        autoFocus
      />
      <button onClick={save} disabled={saving} style={smallBtn('#166534')}>
        {saving ? '…' : 'Save'}
      </button>
      <button onClick={() => { setValue(currentPhone); setEditing(false) }} style={smallBtn('#6b7280')}>
        ✕
      </button>
    </span>
  )
}

// ── shop name settings box ────────────────────────────────────────────────────

function ShopNameSetting({ session }) {
  const initial = session?.user?.user_metadata?.shop_name ?? ''
  const [shopName, setShopName] = useState(initial)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(initial)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  async function save() {
    setSaving(true)
    setMsg('')
    const { error } = await supabase.auth.updateUser({
      data: { shop_name: draft.trim() },
    })
    setSaving(false)
    if (error) {
      setMsg('Could not save: ' + error.message)
    } else {
      setShopName(draft.trim())
      setEditing(false)
    }
  }

  return (
    <div style={{ marginBottom: 16, padding: '10px 14px',
                  background: '#ffffff', border: '1px solid #e5e7eb',
                  borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
                     textTransform: 'uppercase', letterSpacing: '.04em' }}>
        Shop name
      </span>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your shop name"
            style={{ flex: 1, padding: '8px 10px', fontSize: 14,
                     border: '1px solid #d1d5db', borderRadius: 6,
                     boxSizing: 'border-box', minHeight: 44 }}
            autoFocus
          />
          <button onClick={save} disabled={saving}
            style={{ ...smallBtn('#16a34a'), padding: '8px 14px', fontSize: 13, minHeight: 44 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setDraft(shopName); setEditing(false) }}
            style={{ ...smallBtn('#6b7280'), padding: '8px 12px', fontSize: 13, minHeight: 44 }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 14, color: shopName ? '#1a1a1a' : '#9ca3af' }}>
            {shopName || 'Not set. Will use "Nawa"'}
          </span>
          <button onClick={() => setEditing(true)} style={smallLinkBtn}>Edit</button>
        </div>
      )}
      {msg && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{msg}</p>}
    </div>
  )
}

// ── main dashboard ────────────────────────────────────────────────────────────

function Dashboard({ userId, session }) {
  const { data, loading, error, refresh } = useDashboard(userId)

  // local phone state so the UI updates without a full reload
  const [phoneMap, setPhoneMap] = useState({})   // { [customerId]: phone }

  function getPhone(debtor) {
    return phoneMap[debtor.id] !== undefined ? phoneMap[debtor.id] : debtor.phone
  }

  function handlePhoneSaved(debtorId, newPhone) {
    setPhoneMap((m) => ({ ...m, [debtorId]: newPhone }))
  }

  const shopName = session?.user?.user_metadata?.shop_name || 'Nawa'

  if (loading) return <p style={msgStyle}>Loading…</p>
  if (error)   return <p style={{ ...msgStyle, color: '#dc2626' }}>Error: {error}</p>

  const { totalSales, totalOwed, customerCount, debtors, recentSales, recentPayments, customerBalanceMap } = data

  // Empty state
  if (totalSales === 0) {
    return (
      <div style={wrapStyle}>
        <ShopNameSetting session={session} />
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '32px 0' }}>
          No sales yet. Record your first sale.
        </p>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      {/* shop name setting */}
      <ShopNameSetting session={session} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Dashboard</h3>
        <button onClick={refresh} style={ghostBtn}>↺ Refresh</button>
      </div>

      {/* totals */}
      <div style={cardRow}>
        <StatCard label="Total sales"    value={totalSales} />
        <StatCard label="Total owed"     value={`N$${fmt(totalOwed)}`} />
        <StatCard label="Customers"      value={customerCount} />
      </div>

      {/* debtors */}
      {debtors.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h4 style={sectionHead}>Who owes you money</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {debtors.map((d) => {
              const phone = getPhone(d)
              return (
                <div key={d.id} style={debtorCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <strong style={{ fontSize: 15, color: '#1a1a1a' }}>{d.name}</strong>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>
                      N${fmt(d.owed)}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 8px', fontSize: 12, color: '#6b7280' }}>
                    {phone || 'No number saved'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <PhoneEditor
                      debtorId={d.id}
                      userId={userId}
                      currentPhone={phone}
                      onSaved={(p) => handlePhoneSaved(d.id, p)}
                    />
                    {phone && (
                      <a
                        href={buildWaUrl(phone, d.name, d.owed, shopName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={waBtn}
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* recent sales */}
      <section style={{ marginTop: 20 }}>
        <h4 style={sectionHead}>Recent sales</h4>
        {recentSales.length === 0
          ? <p style={{ fontSize: 13, color: '#6b7280' }}>No sales recorded yet.</p>
          : recentSales.map((s) => {
            const isWalkIn = s.customerName?.toLowerCase() === 'walk-in'
            const currentBalance = (s.customerId && customerBalanceMap)
              ? (customerBalanceMap[s.customerId] ?? null)
              : null
            return (
              <div key={s.id} style={saleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong>{s.customerName}</strong>
                    {!isWalkIn && currentBalance !== null && (
                      currentBalance <= 0
                        ? <span style={chipGreen}>Settled ✓</span>
                        : <span style={chipAmber}>Still owes N${fmt(currentBalance)}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0, marginLeft: 8 }}>
                    {new Date(s.createdAt).toLocaleDateString('en-NA')}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                  {s.items.length > 0
                    ? s.items.map((it) => {
                        const qty  = Number(it.qty ?? 0)
                        const name = it.product_name ?? 'item'
                        const unit = it.unit
                          ? ` ${qty === 1
                              ? (it.unit.endsWith('s') ? it.unit.slice(0, -1) : it.unit)
                              : (!it.unit.endsWith('s') ? it.unit + 's' : it.unit)} of`
                          : ''
                        return `${qty}${unit} ${name}`
                      }).join(', ')
                    : 'No item detail'}
                </div>
                <div style={{ marginTop: 4, fontSize: 13 }}>
                  Total: <strong>N${fmt(s.total)}</strong>
                  {', '}Paid: <strong style={{ color: '#166534' }}>N${fmt(s.paid)}</strong>
                  {!isWalkIn && currentBalance !== null && currentBalance > 0 && (
                    <span style={{ color: '#92400e', marginLeft: 6 }}>
                      Still unpaid: N${fmt(currentBalance)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
      </section>

      {/* recent payments */}
      {recentPayments.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h4 style={sectionHead}>Recent payments received</h4>
          {recentPayments.map((p) => (
            <div key={p.id} style={{ ...saleCard, borderColor: '#bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13 }}>
                  <strong>{p.customerName}</strong> paid{' '}
                  <strong style={{ color: '#166534' }}>N${fmt(p.amount)}</strong>
                </span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {new Date(p.createdAt).toLocaleDateString('en-NA')}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4,
                    textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{value}</div>
    </div>
  )
}

// ─── styles ────────────────────────────────────────────────────────────────────
const wrapStyle   = { padding: '16px 16px 8px' }
const msgStyle    = { padding: 24 }
const sectionHead = { margin: '0 0 8px', fontSize: 11, fontWeight: 700,
                      color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }
const cardRow = { display: 'flex', gap: 10 }
const statCard = { flex: 1, background: '#ffffff', border: '1px solid #e5e7eb',
                   borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                   padding: '12px 10px', textAlign: 'center', minHeight: 80 }
const debtorCard = { background: '#ffffff', border: '1px solid #e5e7eb',
                     borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                     padding: '12px 14px' }
const saleCard = { background: '#f8fafc', border: '1px solid #e2e8f0',
                   borderRadius: 10, padding: '10px 12px', marginBottom: 8 }
const ghostBtn = { background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
                   padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#374151',
                   minHeight: 36 }
const smallBtn = (bg) => ({
  background: bg, color: '#fff', border: 'none',
  borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
  minHeight: 36,
})
const smallLinkBtn = {
  background: 'none', border: 'none', color: '#16a34a',
  cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline',
  minHeight: 36,
}
const waBtn = {
  display: 'inline-block', padding: '6px 12px', fontSize: 13,
  background: '#22c55e', color: '#fff', borderRadius: 6,
  textDecoration: 'none', whiteSpace: 'nowrap', minHeight: 36,
}
const chipGreen = {
  display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 11,
  background: '#dcfce7', color: '#166534', fontWeight: 600,
}
const chipAmber = {
  display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 11,
  background: '#fef9c3', color: '#854d0e', fontWeight: 600,
}

export default Dashboard
