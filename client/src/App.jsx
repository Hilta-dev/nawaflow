import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import MicTest from './pages/MicTest'
import Dashboard from './pages/Dashboard'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('recorder') // 'recorder' | 'dashboard'
  const [refresh, setRefresh] = useState(0)          // bump to tell Dashboard to reload

  //session part
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

  if (loading) return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Loading…</p>
  if (!session) return <Login />

  const userId = session.user.id

  return (
    <div style={{ padding: '16px 24px 32px', fontFamily: 'sans-serif', maxWidth: 520 }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Nawa</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          style={ghostBtn}
        >
          Sign out
        </button>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#57606a' }}>
        {session.user.email}
      </p>

      {/* tab bar */}
      <div style={tabBar}>
        <button
          onClick={() => setTab('recorder')}
          style={tabBtn(tab === 'recorder')}
        >
          🎙 Recorder
        </button>
        <button
          onClick={() => { setTab('dashboard'); setRefresh((n) => n + 1) }}
          style={tabBtn(tab === 'dashboard')}
        >
          📊 Dashboard
        </button>
      </div>

      {/* pages */}
      {tab === 'recorder' && (
        <MicTest />
      )}
      {tab === 'dashboard' && (
        <Dashboard
          userId={userId}
          session={session}
          key={refresh}         /* remount on tab switch so data is fresh */
        />
      )}
    </div>
  )
}

const ghostBtn = {
  background: 'none', border: '1px solid #d1d5db', borderRadius: 5,
  padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151',
}

const tabBar = {
  display: 'flex', gap: 6, marginBottom: 4,
  borderBottom: '2px solid #e5e7eb', paddingBottom: 0,
}

const tabBtn = (active) => ({
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
  marginBottom: -2,
  padding: '8px 14px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: active ? 700 : 400,
  color: active ? '#2563eb' : '#374151',
})

export default App
