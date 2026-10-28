import { useState } from 'react'
import { supabase } from '../lib/supabase'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  //sign up part
  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? error.message : 'Account created. You can sign in now.')
  }

  //sign in part
  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
  }

  const inputStyle = { display: 'block', width: '100%', marginBottom: 8, padding: 8 }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 360 }}>
      <h1>NawaFlow</h1>
      <p>Your voice. Your business. In control.</p>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={inputStyle}
      />
      <input
        type="password"
        placeholder="Password (6+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />
      <button onClick={signIn}>Sign in</button>{' '}
      <button onClick={signUp}>Sign up</button>
      <p>{message}</p>
    </div>
  )
}

export default Login