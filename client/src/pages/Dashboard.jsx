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

// ── inline phone editor for a single debtor row ──────────────────────────────

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
        style={{ padding: '2px 6px', fontSize: 12, border: '1px solid #d1d5db',
                 borderRadius: 4, width: 130 }}
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
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#57606a',
                     textTransform: 'uppercase', letterSpacing: '.04em' }}>
        Shop name
      </span>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your shop name"
            style={{ flex: 1, padding: '6px 8px', fontSize: 13,
                     border: '1px solid #d1d5db', borderRadius: 5, boxSizing: 'border-box' }}
            autoFocus
          />
          <button onClick={save} disabled={saving}
            style={{ ...smallBtn('#2563eb'), padding: '6px 12px', fontSize: 13 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setDraft(shopName); setEditing(false) }}
            style={{ ...smallBtn('#6b7280'), padding: '6px 10px', fontSize: 13 }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 14, color: shopName ? '#1f2328' : '#9ca3af' }}>
            {shopName || 'Not set — will use "Nawa"'}
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

  const { totalSales, totalOwed, customerCount, debtors, recentSales, recentPayments } = data

  // Empty state
  if (totalSales === 0) {
    return (
      <div style={wrapStyle}>
        <ShopNameSetting session={session} />
        <p style={{ color: '#57606a', textAlign: 'center', padding: '32px 0' }}>
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
        <h3 style={{ margin: 0 }}>Dashboard</h3>
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
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Customer</th>
                <th style={th}>Phone</th>
                <th style={{ ...th, textAlign: 'right' }}>Owes</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {debtors.map((d, i) => {
                const phone = getPhone(d)
                return (
                  <tr key={d.id} style={i % 2 === 1 ? { background: '#f8fafc' } : {}}>
                    <td style={td}>{d.name}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {phone
                          ? <span style={{ fontSize: 12, color: '#374151' }}>{phone}</span>
                          : <span style={{ fontSize: 12, color: '#9ca3af' }}>No number saved</span>
                        }
                        <PhoneEditor
                          debtorId={d.id}
                          userId={userId}
                          currentPhone={phone}
                          onSaved={(p) => handlePhoneSaved(d.id, p)}
                        />
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                      N${fmt(d.owed)}
                    </td>
                    <td style={td}>
                      {phone ? (
                        <a
                          href={buildWaUrl(phone, d.name, d.owed, shopName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={waBtn}
                        >
                          WhatsApp
                        </a>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* recent sales */}
      <section style={{ marginTop: 20 }}>
        <h4 style={sectionHead}>Recent sales</h4>
        {recentSales.length === 0
          ? <p style={{ fontSize: 13, color: '#57606a' }}>No sales recorded yet.</p>
          : recentSales.map((s) => (
          <div key={s.id} style={saleCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{s.customerName}</strong>
              <span style={{ fontSize: 12, color: '#57606a' }}>
                {new Date(s.createdAt).toLocaleDateString('en-NA')}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
              {s.items.length > 0
                ? s.items.map((it) => {
                    const qty  = it.qty ?? '?'
                    const name = it.product_name ?? 'item'
                    const unit = it.unit ? ` ${it.unit} of` : ''
                    return `${qty}${unit} ${name}`
                  }).join(', ')
                : 'No item detail'}
            </div>
            <div style={{ marginTop: 4, fontSize: 13 }}>
              Total: <strong>N${fmt(s.total)}</strong>
              {' · '}Paid: <strong style={{ color: '#166534' }}>N${fmt(s.paid)}</strong>
              {s.total - s.paid > 0 && (
                <span style={{ color: '#dc2626', marginLeft: 6 }}>
                  Owes N${fmt(s.total - s.paid)}
                </span>
              )}
            </div>
          </div>
        ))}
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
                <span style={{ fontSize: 12, color: '#57606a' }}>
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
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#57606a', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ─── styles ────────────────────────────────────────────────────────────────────
const wrapStyle   = { fontFamily: 'sans-serif', maxWidth: 480, marginTop: 8 }
const msgStyle    = { padding: 24, fontFamily: 'sans-serif' }
const sectionHead = { margin: '0 0 8px', fontSize: 13, fontWeight: 700,
                      color: '#57606a', textTransform: 'uppercase', letterSpacing: '.04em' }
const tableStyle  = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const th = { padding: '6px 10px', background: '#f1f5f9', color: '#374151',
             fontWeight: 600, fontSize: 12, textAlign: 'left',
             border: '1px solid #e5e7eb' }
const td = { padding: '6px 10px', border: '1px solid #e5e7eb' }
const cardRow = { display: 'flex', gap: 10 }
const statCard = { flex: 1, background: '#f0f7ff', border: '1px solid #bfdbfe',
                   borderRadius: 8, padding: '12px 14px', textAlign: 'center' }
const saleCard = { background: '#f8fafc', border: '1px solid #e2e8f0',
                   borderRadius: 6, padding: '10px 12px', marginBottom: 8 }
const ghostBtn = { background: 'none', border: '1px solid #d1d5db', borderRadius: 5,
                   padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }
const smallBtn = (bg) => ({
  background: bg, color: '#fff', border: 'none',
  borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
})
const smallLinkBtn = {
  background: 'none', border: 'none', color: '#2563eb',
  cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline',
}
const waBtn = {
  display: 'inline-block', padding: '3px 8px', fontSize: 11,
  background: '#22c55e', color: '#fff', borderRadius: 4,
  textDecoration: 'none', whiteSpace: 'nowrap',
}

export default Dashboard
