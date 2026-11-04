import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isValidPhone, normalisePhone } from '../lib/phone'

const BUSINESS_CATEGORIES = [
  'Food and groceries',
  'Clothing',
  'Hair and beauty',
  'Electronics and airtime',
  'Hardware',
  'Other',
]

// Map Supabase error messages/codes to friendly copy.
function friendlyError(error) {
  if (!error) return ''
  const msg  = (error.message || '').toLowerCase()
  const code = (error.code    || '').toLowerCase()

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
  if (msg.includes('password should be at least') || msg.includes('weak password') ||
      code === 'weak_password') {
    return 'Password is too weak. Use at least 8 characters with a letter and a number.'
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return 'Please enter a valid email address.'
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') ||
      msg.includes('network request failed')) {
    return 'No internet connection. Please check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

// Password strength: returns 'weak' | 'okay' | 'strong'
function passwordStrength(pwd) {
  if (pwd.length < 8) return 'weak'
  const hasLetter = /[a-zA-Z]/.test(pwd)
  const hasNumber = /\d/.test(pwd)
  if (!hasLetter || !hasNumber) return 'weak'
  if (pwd.length >= 12 && /[^a-zA-Z0-9]/.test(pwd)) return 'strong'
  if (pwd.length >= 10) return 'strong'
  return 'okay'
}

function Login() {
  const [mode, setMode] = useState('login')   // 'login' | 'signup'

  // login fields
  const [loginEmail,    setLoginEmail]    = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPwd,  setShowLoginPwd]  = useState(false)

  // signup fields
  const [fullName,      setFullName]      = useState('')
  const [businessName,  setBusinessName]  = useState('')
  const [signupPhone,   setSignupPhone]   = useState('')
  const [bizCategory,   setBizCategory]   = useState('')
  const [signupEmail,   setSignupEmail]   = useState('')
  const [signupPwd,     setSignupPwd]     = useState('')
  const [confirmPwd,    setConfirmPwd]    = useState('')
  const [showSignupPwd, setShowSignupPwd] = useState(false)
  const [showConfirmPwd,setShowConfirmPwd]= useState(false)

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  function switchMode(next) {
    setMode(next)
    setError('')
    setResendMsg('')
    setAwaitingConfirm(false)
  }

  // ── login ──────────────────────────────────────────────────────────────────

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email:    loginEmail,
      password: loginPassword,
    })
    setLoading(false)
    if (err) setError(friendlyError(err))
  }

  // ── signup ─────────────────────────────────────────────────────────────────

  function validateSignup() {
    if (!fullName.trim())     return 'Please enter your full name.'
    if (!businessName.trim()) return 'Please enter your business name.'
    if (!signupEmail.trim())  return 'Please enter your email address.'
    if (signupPhone.trim()) {
      const k = isValidPhone(signupPhone)
      if (k === 'invalid') return 'That phone number does not look right. Namibian numbers look like 081 234 5678.'
    }
    const strength = passwordStrength(signupPwd)
    if (strength === 'weak') {
      return 'Password must be at least 8 characters with at least one letter and one number.'
    }
    if (signupPwd !== confirmPwd) return 'Passwords do not match. Please check both fields.'
    return ''
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    const vErr = validateSignup()
    if (vErr) { setError(vErr); return }
    setLoading(true)
    const normPhone = signupPhone.trim() ? (normalisePhone(signupPhone) || signupPhone.trim()) : ''
    const { data, error: err } = await supabase.auth.signUp({
      email:    signupEmail,
      password: signupPwd,
      options: {
        data: {
          full_name:         fullName.trim(),
          business_name:     businessName.trim(),
          shop_name:         businessName.trim(),   // keeps existing code working
          phone:             normPhone,
          business_category: bizCategory,
        },
      },
    })
    setLoading(false)
    if (err) {
      setError(friendlyError(err))
      return
    }
    if (data.session) {
      // email confirmation is off, App.jsx will fire onAuthStateChange automatically
      return
    }
    setAwaitingConfirm(true)
  }

  async function resendConfirmation() {
    setResendMsg('')
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: signupEmail })
    if (err) {
      setResendMsg(friendlyError(err))
    } else {
      setResendMsg('Email resent. Check your inbox.')
    }
  }

  // ── email confirmation waiting screen ──────────────────────────────────────

  if (awaitingConfirm) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={h1Style}>Nawa</h1>
          <div style={infoBoxStyle}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Check your email to confirm your account</p>
            <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
              We sent a confirmation link to <strong>{signupEmail}</strong>. Click the link to
              activate your account, then come back and log in.
            </p>
          </div>
          <button onClick={resendConfirmation} style={{ ...secondaryBtnStyle, marginTop: 12 }}>
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
            <button onClick={() => switchMode('login')} style={linkBtnStyle}>Log in</button>
          </p>
        </div>
      </div>
    )
  }

  // ── login form ─────────────────────────────────────────────────────────────

  if (mode === 'login') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={h1Style}>Nawa</h1>
          <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
            Your voice. Your business. In control.
          </p>
          <h2 style={h2Style}>Log in</h2>

          <form onSubmit={handleLogin} noValidate>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              autoComplete="username"
              required
              style={inputStyle}
            />

            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                type={showLoginPwd ? 'text' : 'password'}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{ ...inputStyle, marginBottom: 0, paddingRight: 60 }}
              />
              <button type="button" onClick={() => setShowLoginPwd((v) => !v)}
                style={showHideBtnStyle} tabIndex={-1}>
                {showLoginPwd ? 'Hide' : 'Show'}
              </button>
            </div>

            {error && <p style={errorStyle}>{error}</p>}

            <button type="submit" disabled={loading}
              style={{ ...primaryBtnStyle, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p style={switchStyle}>
            No account yet?{' '}
            <button onClick={() => switchMode('signup')} style={linkBtnStyle}>Create account</button>
          </p>
        </div>
      </div>
    )
  }

  // ── signup form ────────────────────────────────────────────────────────────

  const strength    = signupPwd ? passwordStrength(signupPwd) : null
  const strengthClr = strength === 'strong' ? '#16a34a' : strength === 'okay' ? '#d97706' : '#dc2626'
  const strengthLbl = strength === 'strong' ? 'Strong' : strength === 'okay' ? 'Okay' : 'Weak'
  const pwdMismatch = confirmPwd && signupPwd !== confirmPwd

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={h1Style}>Nawa</h1>
        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
          Your voice. Your business. In control.
        </p>
        <h2 style={h2Style}>Create account</h2>

        <form onSubmit={handleSignUp} noValidate>

          <label style={labelStyle}>Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            required
            style={inputStyle}
          />

          <label style={labelStyle}>Business name</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            style={inputStyle}
          />

          <label style={labelStyle}>Phone number (optional)</label>
          <input
            type="tel"
            value={signupPhone}
            onChange={(e) => setSignupPhone(e.target.value)}
            autoComplete="tel"
            style={{
              ...inputStyle,
              borderColor: signupPhone.trim() && isValidPhone(signupPhone) === 'invalid'
                ? '#fca5a5' : '#d1d5db',
            }}
          />
          {signupPhone.trim() && isValidPhone(signupPhone) === 'invalid' && (
            <p style={{ ...hintStyle, color: '#dc2626', marginTop: -12 }}>
              That number does not look right. Namibian numbers look like 081 234 5678.
            </p>
          )}

          <label style={labelStyle}>Business category (optional)</label>
          <select
            value={bizCategory}
            onChange={(e) => setBizCategory(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select a category</option>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label style={labelStyle}>Currency</label>
          <p style={{ margin: '0 0 16px', fontSize: 15, color: '#6b7280' }}>N$ (Namibian dollar)</p>

          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={signupEmail}
            onChange={(e) => setSignupEmail(e.target.value)}
            autoComplete="email"
            required
            style={inputStyle}
          />

          <label style={labelStyle}>Password</label>
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <input
              type={showSignupPwd ? 'text' : 'password'}
              value={signupPwd}
              onChange={(e) => setSignupPwd(e.target.value)}
              autoComplete="new-password"
              required
              style={{ ...inputStyle, marginBottom: 0, paddingRight: 60 }}
            />
            <button type="button" onClick={() => setShowSignupPwd((v) => !v)}
              style={showHideBtnStyle} tabIndex={-1}>
              {showSignupPwd ? 'Hide' : 'Show'}
            </button>
          </div>
          <p style={{ ...hintStyle, color: strength ? strengthClr : '#9ca3af', marginBottom: strength ? 8 : 16 }}>
            {strength ? strengthLbl : 'At least 8 characters, with a letter and a number.'}
          </p>
          {strength && <div style={{ marginBottom: 8 }} />}

          <label style={labelStyle}>Confirm password</label>
          <div style={{ position: 'relative', marginBottom: pwdMismatch ? 4 : 16 }}>
            <input
              type={showConfirmPwd ? 'text' : 'password'}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
              required
              style={{
                ...inputStyle,
                marginBottom: 0,
                paddingRight: 60,
                borderColor: pwdMismatch ? '#fca5a5' : '#d1d5db',
              }}
            />
            <button type="button" onClick={() => setShowConfirmPwd((v) => !v)}
              style={showHideBtnStyle} tabIndex={-1}>
              {showConfirmPwd ? 'Hide' : 'Show'}
            </button>
          </div>
          {pwdMismatch && (
            <p style={{ ...hintStyle, color: '#dc2626', marginBottom: 16 }}>
              Passwords do not match.
            </p>
          )}

          {error && <p style={errorStyle}>{error}</p>}

          <button type="submit" disabled={loading}
            style={{ ...primaryBtnStyle, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={switchStyle}>
          Already have an account?{' '}
          <button onClick={() => switchMode('login')} style={linkBtnStyle}>Log in</button>
        </p>
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const containerStyle = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'flex-start',
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
  maxWidth: 400,
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

const hintStyle = {
  margin: '0 0 4px',
  fontSize: 12,
}

export default Login
