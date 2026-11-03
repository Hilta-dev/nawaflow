import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDashboard } from '../hooks/useDashboard'
import { isValidPhone, normalisePhone, formatPhone, buildContactUrls } from '../lib/phone'
import { buildSaleReceiptText, buildPaymentReceiptText } from '../lib/receipt'
import ReceiptCard from '../components/ReceiptCard'

function fmt(n) {
  return Number(n).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PHONE_INVALID_MSG =
  'That number does not look right. Namibian mobile numbers look like 081 234 5678.'

// ── inline phone editor for a single debtor card ──────────────────────────────

function PhoneEditor({ debtorId, userId, currentPhone, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(currentPhone ?? '')
  const [saving,  setSaving]  = useState(false)

  const kind    = isValidPhone(value)
  const invalid = kind === 'invalid'
  const canSave = !saving && !invalid

  async function save() {
    if (invalid) return
    setSaving(true)
    const stored = normalisePhone(value) || (value.trim() ? value.trim() : null)
    const { error } = await supabase
      .from('customers')
      .update({ phone: stored || null })
      .eq('id', debtorId)
      .eq('user_id', userId)
    setSaving(false)
    if (!error) {
      setEditing(false)
      onSaved(stored || '')
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
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 081 234 5678"
          style={{ padding: '6px 8px', fontSize: 13,
                   border: `1px solid ${invalid ? '#fca5a5' : '#d1d5db'}`,
                   borderRadius: 6, width: 148, minHeight: 44 }}
          autoFocus
        />
        <button onClick={save} disabled={!canSave}
          style={{ ...smallBtn('#166534'), minHeight: 44, opacity: canSave ? 1 : 0.5 }}>
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={() => { setValue(currentPhone ?? ''); setEditing(false) }}
          style={{ ...smallBtn('#6b7280'), minHeight: 44 }}>
          Cancel
        </button>
      </div>
      {invalid && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>
          {PHONE_INVALID_MSG}
        </p>
      )}
      {kind === 'landline' && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#92400e' }}>
          Landline. WhatsApp may not work.
        </p>
      )}
    </div>
  )
}

// ── main dashboard ────────────────────────────────────────────────────────────

function Dashboard({ userId, session }) {
  const { data, loading, error, refresh } = useDashboard(userId)

  const [phoneMap,       setPhoneMap]       = useState({})
  const [showAllDebtors, setShowAllDebtors] = useState(false)
  const [showAllActivity,setShowAllActivity]= useState(false)
  // receiptState: { itemId, text, phone } — shown inline under that activity card
  const [receiptState,   setReceiptState]   = useState(null)

  function getPhone(debtor) {
    return phoneMap[debtor.id] !== undefined ? phoneMap[debtor.id] : debtor.phone
  }

  function handlePhoneSaved(debtorId, newPhone) {
    setPhoneMap((m) => ({ ...m, [debtorId]: newPhone }))
  }

  const shopName = session?.user?.user_metadata?.shop_name || 'Nawa'

  if (loading) return <p style={msgStyle}>Loading…</p>
  if (error)   return <p style={{ ...msgStyle, color: '#dc2626' }}>Error: {error}</p>

  const { totalSales, totalOwed, customerCount, debtors, recentActivity, customerBalanceMap, customerPhoneMap } = data

  // Empty state
  if (totalSales === 0) {
    return (
      <div style={wrapStyle}>
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '32px 0' }}>
          No sales yet. Record your first sale.
        </p>
      </div>
    )
  }

  const visibleDebtors  = showAllDebtors   ? debtors          : debtors.slice(0, 5)
  const visibleActivity = showAllActivity  ? recentActivity    : recentActivity.slice(0, 5)

  return (
    <div style={wrapStyle}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Dashboard</h3>
        <button onClick={refresh} style={ghostBtn}>↺ Refresh</button>
      </div>

      {/* totals */}
      <div style={cardRow}>
        <StatCard label="Total sales"  value={totalSales} />
        <StatCard label="Total owed"   value={`N$${fmt(totalOwed)}`} />
        <StatCard label="Customers"    value={customerCount} />
      </div>

      {/* debtors */}
      {debtors.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h4 style={sectionHead}>Who owes you money</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleDebtors.map((d) => {
              const phone   = getPhone(d)
              const kind    = isValidPhone(phone)
              const urls    = (kind === 'mobile' || kind === 'landline' || kind === 'international')
                ? buildContactUrls(phone, d.name, d.owed, shopName)
                : null
              const display = phone ? formatPhone(phone) : null
              return (
                <div key={d.id} style={debtorCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <strong style={{ fontSize: 15, color: '#1a1a1a' }}>{d.name}</strong>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>
                      N${fmt(d.owed)}
                    </span>
                  </div>

                  <p style={{ margin: '2px 0 6px', fontSize: 12, color: '#6b7280' }}>
                    {!phone && 'No number saved'}
                    {phone && kind === 'invalid' && (
                      <span style={{ color: '#dc2626' }}>Number needs fixing.{' '}</span>
                    )}
                    {phone && kind !== 'invalid' && display}
                    {phone && kind === 'landline' && (
                      <span style={{ marginLeft: 6, color: '#92400e' }}>
                        Landline. WhatsApp may not work.
                      </span>
                    )}
                  </p>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <PhoneEditor
                      debtorId={d.id}
                      userId={userId}
                      currentPhone={phone}
                      onSaved={(p) => handlePhoneSaved(d.id, p)}
                    />
                    {urls && (
                      <>
                        <a href={urls.wa} target="_blank" rel="noopener noreferrer" style={waBtn}>
                          WhatsApp
                        </a>
                        <a href={urls.sms} style={smsBtn}>SMS</a>
                        <a href={urls.tel} style={callBtn}>Call</a>
                      </>
                    )}
                  </div>
                  {urls && (
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af' }}>
                      If WhatsApp does not open, tap SMS.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {debtors.length > 5 && (
            <button
              onClick={() => setShowAllDebtors((v) => !v)}
              style={{ ...ghostBtn, marginTop: 10, width: '100%' }}
            >
              {showAllDebtors
                ? 'Show less'
                : `See all debtors (${debtors.length})`}
            </button>
          )}
        </section>
      )}

      {/* recent activity */}
      <section style={{ marginTop: 20 }}>
        <h4 style={sectionHead}>Recent activity</h4>

        {recentActivity.length === 0 && (
          <p style={{ fontSize: 13, color: '#6b7280' }}>No activity yet.</p>
        )}

        {visibleActivity.map((item) => {
          const itemKey       = `${item.kind}-${item.id}`
          const isReceiptOpen = receiptState?.itemId === itemKey
          const custPhone     = item.customerId ? (customerPhoneMap?.[item.customerId] ?? '') : ''

          if (item.kind === 'payment') {
            const currentBalance = item.customerId
              ? (customerBalanceMap?.[item.customerId] ?? 0)
              : 0
            const receiptText = buildPaymentReceiptText({
              shopName,
              date:         item.createdAt,
              customerName: item.customerName,
              amount:       item.amount,
              balance:      currentBalance,
            })
            return (
              <div key={itemKey}>
                <div style={{ ...saleCard, borderColor: '#bbf7d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>
                      <span style={chipGreen}>Payment</span>{' '}
                      <strong>{item.customerName}</strong>{' paid '}
                      <strong style={{ color: '#166534' }}>N${fmt(item.amount)}</strong>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {new Date(item.createdAt).toLocaleDateString('en-NA')}
                      </span>
                      <button
                        onClick={() => setReceiptState(isReceiptOpen ? null : { itemId: itemKey, text: receiptText, phone: custPhone })}
                        style={receiptBtn}
                      >
                        Receipt
                      </button>
                    </div>
                  </div>
                </div>
                {isReceiptOpen && (
                  <ReceiptCard
                    text={receiptState.text}
                    phone={receiptState.phone}
                    onDone={() => setReceiptState(null)}
                  />
                )}
              </div>
            )
          }

          // kind === 'sale'
          const isWalkIn = item.customerName?.toLowerCase() === 'walk-in'
          const currentBalance = (item.customerId && customerBalanceMap)
            ? (customerBalanceMap[item.customerId] ?? null)
            : null
          const receiptText = buildSaleReceiptText({
            shopName,
            date:         item.createdAt,
            customerName: item.customerName,
            items:        item.items,
            total:        item.total,
            paid:         item.paid,
            balance:      currentBalance ?? 0,
          })
          return (
            <div key={itemKey}>
              <div style={saleCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong>{item.customerName}</strong>
                    {!isWalkIn && currentBalance !== null && (
                      currentBalance <= 0
                        ? <span style={chipGreen}>Settled ✓</span>
                        : <span style={chipAmber}>Still owes N${fmt(currentBalance)}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      {new Date(item.createdAt).toLocaleDateString('en-NA')}
                    </span>
                    <button
                      onClick={() => setReceiptState(isReceiptOpen ? null : { itemId: itemKey, text: receiptText, phone: custPhone })}
                      style={receiptBtn}
                    >
                      Receipt
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                  {item.items.length > 0
                    ? item.items.map((it) => {
                        const qty  = Number(it.qty ?? 0)
                        const name = it.product_name ?? 'item'
                        const unit = it.unit
                          ? ` ${qty <= 1
                              ? (it.unit.endsWith('s') ? it.unit.slice(0, -1) : it.unit)
                              : (!it.unit.endsWith('s') ? it.unit + 's' : it.unit)} of`
                          : ''
                        return `${qty}${unit} ${name}`
                      }).join(', ')
                    : 'No item detail'}
                </div>
                <div style={{ marginTop: 4, fontSize: 13 }}>
                  Total: <strong>N${fmt(item.total)}</strong>
                  {', '}Paid at sale: <strong style={{ color: '#166534' }}>N${fmt(item.paid)}</strong>
                  {!isWalkIn && currentBalance !== null && currentBalance > 0 && (
                    <span style={{ color: '#92400e', marginLeft: 6 }}>
                      Still unpaid: N${fmt(currentBalance)}
                    </span>
                  )}
                </div>
              </div>
              {isReceiptOpen && (
                <ReceiptCard
                  text={receiptState.text}
                  phone={receiptState.phone}
                  onDone={() => setReceiptState(null)}
                />
              )}
            </div>
          )
        })}

        {recentActivity.length > 5 && (
          <button
            onClick={() => setShowAllActivity((v) => !v)}
            style={{ ...ghostBtn, marginTop: 4, width: '100%' }}
          >
            {showAllActivity ? 'Show less' : `See all (${recentActivity.length})`}
          </button>
        )}
      </section>
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

// ─── styles ───────────────────────────────────────────────────────────────────
const receiptBtn = {
  background: '#e0f2fe', color: '#0369a1', border: 'none',
  borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
  minHeight: 44, fontWeight: 500,
}
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
                   minHeight: 44 }
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
  textDecoration: 'none', whiteSpace: 'nowrap', minHeight: 44,
  lineHeight: '30px',
}
const smsBtn = {
  display: 'inline-block', padding: '6px 12px', fontSize: 13,
  background: '#3b82f6', color: '#fff', borderRadius: 6,
  textDecoration: 'none', whiteSpace: 'nowrap', minHeight: 44,
  lineHeight: '30px',
}
const callBtn = {
  display: 'inline-block', padding: '6px 12px', fontSize: 13,
  background: '#6b7280', color: '#fff', borderRadius: 6,
  textDecoration: 'none', whiteSpace: 'nowrap', minHeight: 44,
  lineHeight: '30px',
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
