import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import MicTest from './pages/MicTest'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('checking...')

  //session part
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  //server check part
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('server not reachable'))
  }, [])

  if (loading) return <p style={{ padding: 24 }}>Loading...</p>
  if (!session) return <Login />

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>NawaFlow</h1>
      <p>Signed in as {session.user.email}</p>
      <p>Server status: {status}</p>
            <MicTest />
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}

export default App