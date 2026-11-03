import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import MicTest from './pages/MicTest'
import Dashboard from './pages/Dashboard'

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
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>
                  {email}
                </p>
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
          <MicTest session={session} />
        )}
        {tab === 'dashboard' && (
          <Dashboard
            userId={userId}
            session={session}
            key={refresh}
          />
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
