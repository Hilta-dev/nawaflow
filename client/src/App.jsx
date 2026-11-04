import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import MicTest from './pages/MicTest'
import Dashboard from './pages/Dashboard'
import Stock from './pages/Stock'

// ── inline shop name editor for the account menu ─────────────────────────────
function ShopNameMenuItem({ session }) {
  const initial = session?.user?.user_metadata?.shop_name ?? ''
  const [shopName, setShopName] = useState(initial)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(initial)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  async function save() {
    setSaving(true)
    setMsg('')
    const { error } = await supabase.auth.updateUser({ data: { shop_name: draft.trim() } })
    setSaving(false)
    if (error) {
      setMsg('Could not save: ' + error.message)
    } else {
      setShopName(draft.trim())
      setEditing(false)
    }
  }

  return (
    <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
        Shop name
      </div>
      {editing ? (
        <>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your shop name"
            style={{ width: '100%', padding: '7px 8px', fontSize: 13,
                     border: '1px solid #d1d5db', borderRadius: 6,
                     boxSizing: 'border-box', minHeight: 44, marginBottom: 6 }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save} disabled={saving}
              style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none',
                       borderRadius: 6, padding: '6px 0', fontSize: 13, cursor: 'pointer',
                       minHeight: 44 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setDraft(shopName); setEditing(false) }}
              style={{ flex: 1, background: 'none', border: '1px solid #d1d5db',
                       borderRadius: 6, padding: '6px 0', fontSize: 13, cursor: 'pointer',
                       minHeight: 44 }}>
              Cancel
            </button>
          </div>
          {msg && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{msg}</p>}
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: shopName ? '#1a1a1a' : '#9ca3af', flex: 1 }}>
            {shopName || 'Not set. Will use "Nawa"'}
          </span>
          <button onClick={() => setEditing(true)}
            style={{ background: 'none', border: 'none', color: '#16a34a',
                     fontSize: 13, cursor: 'pointer', padding: 0,
                     textDecoration: 'underline', minHeight: 44 }}>
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('home')   // 'home' | 'dashboard'
  const [refresh, setRefresh] = useState(0)         // bump to tell Dashboard to reload
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>
  if (!session) return <Login />

  const email    = session.user.email ?? ''
  const initial  = email.charAt(0).toUpperCase()
  const userId   = session.user.id

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* ── header ── */}
      <header style={headerStyle}>
        <span style={logoStyle}>Nawa</span>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={avatarBtn}
            aria-label="Account menu"
          >
            {initial}
          </button>

          {menuOpen && (
            <>
              {/* backdrop to close on outside click */}
              <div
                onClick={() => setMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 9 }}
              />
              <div style={dropdownStyle}>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>
                  {email}
                </p>
                <ShopNameMenuItem session={session} />
                <button
                  onClick={() => supabase.auth.signOut()}
                  style={signOutBtn}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── page content ── */}
      <main style={{ flex: 1, paddingBottom: 72 }}>
        {tab === 'home' && (
          <MicTest
            session={session}
            onViewDashboard={() => { setTab('dashboard'); setRefresh((n) => n + 1) }}
          />
        )}
        {tab === 'dashboard' && (
          <Dashboard
            userId={userId}
            session={session}
            key={refresh}
          />
        )}
        {tab === 'stock' && (
          <Stock userId={userId} />
        )}
      </main>

      {/* ── bottom nav ── */}
      <nav style={navBar}>
        <button
          onClick={() => setTab('home')}
          style={navBtn(tab === 'home')}
        >
          <span style={{ fontSize: 20 }}>🏠</span>
          <span>Home</span>
        </button>
        <button
          onClick={() => { setTab('dashboard'); setRefresh((n) => n + 1) }}
          style={navBtn(tab === 'dashboard')}
        >
          <span style={{ fontSize: 20 }}>📊</span>
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => setTab('stock')}
          style={navBtn(tab === 'stock')}
        >
          <span style={{ fontSize: 20 }}>📦</span>
          <span>Stock</span>
        </button>
      </nav>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  background: '#ffffff',
  borderBottom: '1px solid #e5e7eb',
  position: 'sticky',
  top: 0,
  zIndex: 10,
}

const logoStyle = {
  fontSize: 22,
  fontWeight: 700,
  color: '#16a34a',
}

const avatarBtn = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  minHeight: 44,
}

const dropdownStyle = {
  position: 'absolute',
  top: 40,
  right: 0,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  padding: '12px 14px',
  minWidth: 180,
  zIndex: 10,
}

const signOutBtn = {
  background: 'none',
  border: 'none',
  color: '#dc2626',
  fontSize: 14,
  cursor: 'pointer',
  padding: 0,
  minHeight: 44,
}

const navBar = {
  position: 'fixed',
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  width: '100%',
  maxWidth: 480,
  display: 'flex',
  background: '#ffffff',
  borderTop: '1px solid #e5e7eb',
  zIndex: 10,
}

const navBtn = (active) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  minHeight: 56,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: active ? 700 : 400,
  color: active ? '#16a34a' : '#6b7280',
  padding: '8px 0',
})

export default App
