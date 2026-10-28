import { useEffect, useState } from 'react'

function App() {
  const [status, setStatus] = useState('checking...')

  //check server part
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('server not reachable'))
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>NawaFlow</h1>
      <p>Your voice. Your business. In control.</p>
      <p>Server status: {status}</p>
    </div>
  )
}

export default App