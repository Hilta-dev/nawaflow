import { useDashboard } from '../hooks/useDashboard'

function fmt(n) {
  return Number(n).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Dashboard({ userId, onRefresh }) {
  const { data, loading, error, refresh } = useDashboard(userId)

  function handleRefresh() {
    refresh()
    onRefresh?.()
  }

  if (loading) return <p style={msgStyle}>Loading…</p>
  if (error)   return <p style={{ ...msgStyle, color: '#dc2626' }}>Error: {error}</p>

  const { totalSales, totalOwed, customerCount, debtors, recentSales } = data

  // Empty state
  if (totalSales === 0) {
    return (
      <div style={wrapStyle}>
        <p style={{ color: '#57606a', textAlign: 'center', padding: '32px 0' }}>
          No sales yet. Record your first sale.
        </p>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Dashboard</h3>
        <button onClick={handleRefresh} style={ghostBtn}>↺ Refresh</button>
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
                <th style={{ ...th, textAlign: 'right' }}>Owes</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map((d, i) => (
                <tr key={i} style={i % 2 === 1 ? { background: '#f8fafc' } : {}}>
                  <td style={td}>{d.name}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                    N${fmt(d.owed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* recent sales */}
      <section style={{ marginTop: 20 }}>
        <h4 style={sectionHead}>Recent sales</h4>
        {recentSales.map((s) => (
          <div key={s.id} style={saleCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{s.customerName}</strong>
              <span style={{ fontSize: 12, color: '#57606a' }}>
                {new Date(s.createdAt).toLocaleDateString('en-NA')}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
              {s.items.length > 0
                ? s.items.map((it, i) => `${it.qty} item${it.qty !== 1 ? 's' : ''}`).join(', ')
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

export default Dashboard
