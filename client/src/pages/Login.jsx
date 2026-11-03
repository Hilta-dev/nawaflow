import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Map Supabase error messages/codes to friendly copy.
function friendlyError(error) {
  if (!error) return ''
  const msg = (error.message || '').toLowerCase()
  const code = (error.code || '').toLowerCase()

  if (msg.includes('rate limit') || msg.includes('too many') || code === 'over_email_send_rate_limit') {
    return 'Too many sign-up emails right now. Please try again in a few minutes.'
  }
  if (msg.includes('email not confirmed') || code === 'email_not_confirmed') {
    return 'Please confirm your email before signing in. Check your inbox.'
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials') ||
      msg.includes('wrong password') || code === 'invalid_credentials') {
    return 'Wrong email or password. Please try again.'
  }
  if (msg.includes('user already registered') || msg.includes('already been registered') ||
      code === 'user_already_exists') {
    return 'An account with this email already exists. Try logging in instead.'
  }
  if (msg.includes('password should be at least')) {
    return 'Password must be at least 6 characters.'
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return 'Please enter a valid email address.'
  }
  return error.message || 'Something went wrong. Please try again.'
}

function Login() {
  const [mode,      setMode]      = useState('login')   // 'login' | 'signup'
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPwd,   setShowPwd]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)  // email confirmation pending
  const [resendMsg, setResendMsg] = useState('')

  function switchMode(next) {
    setMode(next)
    setError('')
    setResendMsg('')
    setAwaitingConfirm(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) setError(friendlyError(err))
    // on success, App.jsx's onAuthStateChange fires and unmounts this component
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error: err } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (err) {
      setError(friendlyError(err))
      return
    }
    if (data.session) {
      // Supabase returned a session immediately (email confirmation is off)
      // App.jsx's onAuthStateChange will fire and take the user into the app automatically
      return
    }
    // No session → email confirmation required
    setAwaitingConfirm(true)
  }

  async function resendConfirmation() {
    setResendMsg('')
    const { error: err } = await supabase.auth.resend({ type: 'signup', email })
    if (err) {
      setResendMsg(friendlyError(err))
    } else {
      setResendMsg('Email resent. Check your inbox.')
    }
  }

  // ── email confirmation waiting screen ────────────────────────────────────
  if (awaitingConfirm) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
        <h1 style={h1Style}>Nawa</h1>
        <div style={infoBoxStyle}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Check your email</p>
          <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click the link to
            activate your account, then come back and log in.
          </p>
        </div>
        <button
          onClick={resendConfirmation}
          style={{ ...secondaryBtnStyle, marginTop: 12 }}
        >
          Resend email
        </button>
        {resendMsg && (
          <p style={{ marginTop: 8, fontSize: 13,
            color: resendMsg.startsWith('Email resent') ? '#166534' : '#dc2626' }}>
            {resendMsg}
          </p>
        )}
        <p style={switchStyle}>
          Already confirmed?{' '}
          <button onClick={() => switchMode('login')} style={linkBtnStyle}>
            Log in
          </button>
        </p>
        </div>
      </div>
    )
  }

  // ── login / signup form ───────────────────────────────────────────────────
  const isLogin = mode === 'login'

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
      <h1 style={h1Style}>Nawa</h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
        Your voice. Your business. In control.
      </p>

      <h2 style={h2Style}>{isLogin ? 'Log in' : 'Create account'}</h2>

      <form onSubmit={isLogin ? handleLogin : handleSignUp} noValidate>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete={isLogin ? 'username' : 'email'}
          required
          style={inputStyle}
        />

        <label style={labelStyle}>Password</label>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <input
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            placeholder={isLogin ? '' : '6 or more characters'}
            required
            style={{ ...inputStyle, marginBottom: 0, paddingRight: 60 }}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            style={showHideBtnStyle}
            tabIndex={-1}
          >
            {showPwd ? 'Hide' : 'Show'}
          </button>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ ...primaryBtnStyle, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? (isLogin ? 'Logging in…' : 'Creating account…') : (isLogin ? 'Log in' : 'Create account')}
        </button>
      </form>

      <p style={switchStyle}>
        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          onClick={() => switchMode(isLogin ? 'signup' : 'login')}
          style={linkBtnStyle}
        >
          {isLogin ? 'Create account' : 'Log in'}
        </button>
      </p>
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const containerStyle = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
  background: '#f0fdf4',
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  padding: 32,
  width: '100%',
  maxWidth: 380,
}

const h1Style = {
  margin: '0 0 4px',
  fontSize: 32,
  fontWeight: 700,
  color: '#16a34a',
  textAlign: 'center',
}

const h2Style = {
  margin: '0 0 20px',
  fontSize: 18,
  fontWeight: 600,
  textAlign: 'center',
  color: '#1a1a1a',
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 4,
  color: '#374151',
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginBottom: 16,
  padding: '11px 12px',
  fontSize: 15,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  boxSizing: 'border-box',
  minHeight: 44,
}

const primaryBtnStyle = {
  display: 'block',
  width: '100%',
  padding: '12px 0',
  fontSize: 15,
  fontWeight: 600,
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  marginTop: 4,
  minHeight: 44,
}

const secondaryBtnStyle = {
  display: 'inline-block',
  padding: '10px 16px',
  fontSize: 14,
  background: 'none',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  cursor: 'pointer',
  color: '#374151',
  minHeight: 44,
}

const showHideBtnStyle = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  fontSize: 12,
  color: '#16a34a',
  cursor: 'pointer',
  padding: '2px 4px',
  minHeight: 44,
}

const linkBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#16a34a',
  cursor: 'pointer',
  fontSize: 'inherit',
  padding: 0,
  textDecoration: 'underline',
}

const switchStyle = {
  marginTop: 16,
  fontSize: 13,
  color: '#6b7280',
  textAlign: 'center',
}

const errorStyle = {
  margin: '0 0 12px',
  fontSize: 13,
  color: '#dc2626',
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: 8,
  padding: '8px 12px',
}

const infoBoxStyle = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: 8,
  padding: '12px 14px',
}

export default Login
