import { useEffect, useMemo, useRef, useState } from 'react';
import './Login.css';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin, useGoogleLogin } from '@react-oauth/google';

const LANDING_URL = '/';
const DASHBOARD_URL = '/dashboard';
const SET_PROFILE_URL = '/set-profile';
// Managers and Admins land on the same route — AdminDashboard.jsx (and every
// other admin page) reads the real role from localStorage (`st_role`) and
// shows the correct restricted/full view internally, so there's no separate
// manager-only route to build.
const MANAGER_DASHBOARD_URL = '/admin-dashboard';
const ADMIN_DASHBOARD_URL = '/admin-dashboard';

// Only Google accounts on this domain can sign in as staff (manager / admin).
const STAFF_DOMAIN = 'sankalptaru.org';

// Set these in your .env as VITE_API_URL and VITE_GOOGLE_CLIENT_ID
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const STRENGTH_LEVELS = [
  { width: '0%', color: '#ccc', label: '—' },
  { width: '25%', color: '#ef4444', label: 'Weak' },
  { width: '50%', color: '#f59e0b', label: 'Fair' },
  { width: '75%', color: '#3b82f6', label: 'Good' },
  { width: '100%', color: '#059669', label: 'Strong' },
];

function getPasswordStrength(value) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;
  return STRENGTH_LEVELS[score] || STRENGTH_LEVELS[0];
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong. Please try again.');
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function storeSession(token, role) {
  localStorage.setItem('st_token', token);
  localStorage.setItem('st_role', role);
}

function LoginInner() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register' | 'staff'

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginErrors, setLoginErrors] = useState({});
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  
  // Register state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [regErrors, setRegErrors] = useState({});
  const [regSubmitting, setRegSubmitting] = useState(false);

  // Register: email verification (OTP) step — shown after a successful
  // /register call, before the account is actually usable. Also reused by
  // login() when it hits a 403 requiresVerification response (an existing,
  // never-verified account trying to log in), so the two entry points share
  // one OTP screen instead of building it twice.
  const [regStep, setRegStep] = useState('form'); // 'form' | 'verify'
  const [regOtp, setRegOtp] = useState('');
  const [regInfo, setRegInfo] = useState('');
  const [regResendCooldown, setRegResendCooldown] = useState(0);

  // Forgot password state (volunteer)
  const [forgotStep, setForgotStep] = useState('request'); // 'request' | 'reset' | 'done'
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNewPass, setShowForgotNewPass] = useState(false);
  const [showForgotConfirmPass, setShowForgotConfirmPass] = useState(false);
  const [forgotErrors, setForgotErrors] = useState({});
  const [forgotInfo, setForgotInfo] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0); // seconds until "Resend code" is clickable again

  // Staff (manager/admin) login state
  const [staffError, setStaffError] = useState('');
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const staffButtonWrapRef = useRef(null);
  const [staffButtonWidth, setStaffButtonWidth] = useState(320);

  useEffect(() => {
    if (activeTab !== 'staff') return undefined;
    const el = staffButtonWrapRef.current;
    if (!el) return undefined;

    // @react-oauth/google's GoogleLogin needs a pixel width (max 400) — it
    // doesn't accept "100%" — so we measure the wrapper and pass that in,
    // recalculating on resize so it stays responsive.
    const updateWidth = () => {
      const w = Math.min(400, Math.floor(el.getBoundingClientRect().width));
      if (w > 0) setStaffButtonWidth(w);
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [activeTab]);

  const strength = useMemo(() => getPasswordStrength(regPassword), [regPassword]);
  const forgotStrength = useMemo(() => getPasswordStrength(forgotNewPassword), [forgotNewPassword]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (regResendCooldown <= 0) return undefined;
    const t = setTimeout(() => setRegResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [regResendCooldown]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setStaffError('');
    if (tab === 'forgot') {
      setForgotStep('request');
      setForgotEmail(loginEmail || '');
      setForgotOtp('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setForgotErrors({});
      setForgotInfo('');
      setResendCooldown(0);
    }
    if (tab === 'register') {
      setRegStep('form');
      setRegOtp('');
      setRegErrors({});
      setRegInfo('');
      setRegResendCooldown(0);
    }
  };

  const handleUseDifferentEmail = () => {
    setForgotStep('request');
    setForgotOtp('');
    setForgotErrors({});
    setForgotInfo('');
    setResendCooldown(0);
  };

  const handleForgotRequestSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!forgotEmail) errors.email = 'Please enter your email';
    else if (!isValidEmail(forgotEmail)) errors.email = 'Enter a valid email address';
    setForgotErrors(errors);
    if (Object.keys(errors).length) return;

    setForgotSubmitting(true);
    setForgotInfo('');
    try {
      const data = await apiPost('/auth/volunteer/forgot-password', { email: forgotEmail });
      setForgotInfo(data.message || 'A verification code has been sent to your email.');
      setForgotOtp('');
      setForgotStep('reset');
      setResendCooldown(60);
    } catch (err) {
      setForgotErrors({ email: err.message });
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || forgotSubmitting) return;
    setForgotSubmitting(true);
    setForgotErrors({});
    try {
      const data = await apiPost('/auth/volunteer/forgot-password', { email: forgotEmail });
      setForgotInfo(data.message || 'A new verification code has been sent.');
      setResendCooldown(60);
    } catch (err) {
      setForgotErrors({ otp: err.message });
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleForgotResetSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!/^\d{6}$/.test(forgotOtp)) errors.otp = 'Enter the 6-digit code sent to your email';
    if (!/^(?=.*[A-Z])(?=.*[0-9]).{8,}$/.test(forgotNewPassword)) {
      errors.newPassword = 'Min 8 chars, 1 uppercase, 1 number';
    }
    if (forgotConfirmPassword !== forgotNewPassword) errors.confirm = 'Passwords do not match';
    setForgotErrors(errors);
    if (Object.keys(errors).length) return;

    setForgotSubmitting(true);
    try {
      const data = await apiPost('/auth/volunteer/reset-password', {
        email: forgotEmail,
        otp: forgotOtp,
        newPassword: forgotNewPassword,
      });
      setForgotInfo(data.message || 'Your password has been reset. You can now log in.');
      setForgotStep('done');
    } catch (err) {
      setForgotErrors({ otp: err.message });
    } finally {
      setForgotSubmitting(false);
    }
  };

  // The same "Continue with Google" button/handler is used on both the
  // Login and Register panels. Route its errors (e.g. the restricted-domain
  // rejection from the backend) into whichever panel's error state is
  // actually visible right now — the Register panel only renders
  // `regErrors.email`, so writing to `loginErrors` while on that tab would
  // silently swallow the message instead of showing it.
  const setVolunteerGoogleError = (message) => {
    if (activeTab === 'register') setRegErrors({ email: message });
    else setLoginErrors({ email: message });
  };

  // --- Volunteer: Google SSO (implicit flow -> access_token) ---
  const handleVolunteerGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const data = await apiPost('/auth/volunteer/google', {
          access_token: tokenResponse.access_token,
        });
        storeSession(data.token, 'volunteer');
        navigate(data.isNewUser ? SET_PROFILE_URL : DASHBOARD_URL);
      } catch (err) {
        setVolunteerGoogleError(err.message);
      }
    },
    onError: () => setVolunteerGoogleError('Google sign-in failed. Please try again.'),
  });

  // --- Staff: Google SSO (ID-token flow, restricted to sankalptaru.org) ---
  const handleStaffGoogleSuccess = async (credentialResponse) => {
    setStaffError('');
    setStaffSubmitting(true);
    try {
      const data = await apiPost('/auth/staff/google', {
        credential: credentialResponse.credential,
      });
      storeSession(data.token, data.role);
      navigate(data.role === 'admin' ? ADMIN_DASHBOARD_URL : MANAGER_DASHBOARD_URL);
    } catch (err) {
      setStaffError(err.message || 'Sign-in failed.');
    } finally {
      setStaffSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!loginEmail) errors.email = 'Please enter your email';
    else if (!isValidEmail(loginEmail)) errors.email = 'Enter a valid email address';
    if (!loginPassword) errors.password = 'Please enter your password';
    setLoginErrors(errors);
    if (Object.keys(errors).length) return;

    setLoginSubmitting(true);
    try {
      const data = await apiPost('/auth/volunteer/login', {
        email: loginEmail,
        password: loginPassword,
      });
      storeSession(data.token, 'volunteer');
      navigate(DASHBOARD_URL);
    } catch (err) {
      if (err.status === 403 && err.data?.requiresVerification) {
        // Correct credentials, but this account was never verified — send
        // them to the same OTP screen register() uses, pre-filled with
        // their email, instead of showing an error they can't act on.
        setLoginErrors({});
        switchTab('register');
        setRegEmail(err.data.email || loginEmail);
        setRegOtp('');
        setRegErrors({});
        setRegInfo(err.message);
        setRegStep('verify');
        setRegResendCooldown(0);
      } else {
        setLoginErrors({ password: err.message });
      }
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!isValidEmail(regEmail)) errors.email = 'Enter a valid email address';
    if (!/^(?=.*[A-Z])(?=.*[0-9]).{8,}$/.test(regPassword)) {
      errors.password = 'Min 8 chars, 1 uppercase, 1 number';
    }
    if (regConfirm !== regPassword) errors.confirm = 'Passwords do not match';
    setRegErrors(errors);
    if (Object.keys(errors).length) return;

    setRegSubmitting(true);
    try {
      const data = await apiPost('/auth/volunteer/register', {
        email: regEmail,
        password: regPassword,
      });
      setRegInfo(data.message || 'A verification code has been sent to your email.');
      setRegOtp('');
      setRegStep('verify');
      setRegResendCooldown(60);
    } catch (err) {
      if (err.status === 409) {
        setRegErrors({ email: 'An account with this email exists.' });
      } else {
        setRegErrors({ email: err.message });
      }
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleVerifyEmailSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!/^\d{6}$/.test(regOtp)) errors.otp = 'Enter the 6-digit code sent to your email';
    setRegErrors(errors);
    if (Object.keys(errors).length) return;

    setRegSubmitting(true);
    try {
      const data = await apiPost('/auth/volunteer/verify-email', {
        email: regEmail,
        otp: regOtp,
      });
      storeSession(data.token, 'volunteer');
      navigate(SET_PROFILE_URL);
    } catch (err) {
      setRegErrors({ otp: err.message });
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleResendRegCode = async () => {
    if (regResendCooldown > 0 || regSubmitting) return;
    setRegSubmitting(true);
    setRegErrors({});
    try {
      const data = await apiPost('/auth/volunteer/resend-verification', { email: regEmail });
      setRegInfo(data.message || 'A new verification code has been sent.');
      setRegResendCooldown(60);
    } catch (err) {
      setRegErrors({ otp: err.message });
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleUseDifferentRegEmail = () => {
    setRegStep('form');
    setRegOtp('');
    setRegErrors({});
    setRegInfo('');
    setRegResendCooldown(0);
  };

  return (
    <div className="auth-page">
      {/* Left Brand Panel */}
      <div className="auth-left">
        <div className="auth-logo">
          <div className="auth-logo-lockup">
            <span className="auth-logo-word">STart</span>
            <span className="auth-logo-sub">by SankalpTaru</span>
          </div>
        </div>
        <div className="auth-left-content">
          <h2 className="auth-tagline">
            Give your skills<br />to a <span className="accent">greener future</span>
          </h2>
          <p className="auth-tagline-sub">
            Join India's fastest-growing volunteer community. Your contribution plants seeds that grow into forests of change.
          </p>
          <div className="auth-features">
            <div className="auth-feature"><div className="auth-feature-dot" />Get matched to opportunities that fit your skills</div>
            <div className="auth-feature"><div className="auth-feature-dot" />Work remotely or in the field — your choice</div>
            <div className="auth-feature"><div className="auth-feature-dot" />Earn verified certificates for your contributions</div>
            <div className="auth-feature"><div className="auth-feature-dot" />Build your impact portfolio</div>
          </div>
        </div>
        <div className="auth-bottom-card">
          <div className="auth-bottom-label">Our Community</div>
          <div className="auth-stat-row">
            <div className="auth-stat"><div className="auth-stat-n">2,400+</div><div className="auth-stat-l">Volunteers</div></div>
            <div className="auth-stat"><div className="auth-stat-n">50K+</div><div className="auth-stat-l">Trees Planted</div></div>
            <div className="auth-stat"><div className="auth-stat-n">340+</div><div className="auth-stat-l">Certificates</div></div>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="auth-right">
        <div className="auth-form-wrap">
          <button className="auth-back" onClick={() => { navigate(LANDING_URL); }}>
            ← Back to home
          </button>

          {/* Tab Switcher */}
          <div className="tab-switcher">
            <button
              className={`tab-btn${activeTab === 'login' ? ' active' : ''}`}
              onClick={() => switchTab('login')}
            >
              Login
            </button>
            <button
              className={`tab-btn${activeTab === 'register' ? ' active' : ''}`}
              onClick={() => switchTab('register')}
            >
              Register
            </button>
            <button
              className={`tab-btn${activeTab === 'staff' ? ' active' : ''}`}
              onClick={() => switchTab('staff')}
            >
              Staff Login
            </button>
          </div>

          {/* LOGIN PANEL (Volunteer) */}
          {activeTab === 'login' && (
            <div className="panel active">
              <h1 className="form-title">Welcome back!</h1>
              <p className="form-sub">Log in to your SankalpTaru account to continue volunteering.</p>

              <button type="button" className="btn-google" onClick={() => handleVolunteerGoogleLogin()}>
                <div className="google-icon" />
                Continue with Google
              </button>
              <div className="or-divider">or</div>

              <form onSubmit={handleLoginSubmit} noValidate>
                <div className="field-group">
                  <label className="field-label">Email Address <span className="field-required">*</span></label>
                  <input
                    type="email"
                    className={`field-input${loginErrors.email ? ' error' : ''}`}
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                  {loginErrors.email && <div className="field-error">⚠ {loginErrors.email}</div>}
                </div>
                <div className="field-group">
                  <label className="field-label">Password <span className="field-required">*</span></label>
                  <div className="pass-wrap">
                    <input
                      type={showLoginPass ? 'text' : 'password'}
                      className={`field-input${loginErrors.password ? ' error' : ''}`}
                      placeholder="Enter your password"
                      style={{ paddingRight: 60 }}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <button type="button" className="pass-toggle" onClick={() => setShowLoginPass((s) => !s)}>
                      {showLoginPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {loginErrors.password && <div className="field-error">⚠ {loginErrors.password}</div>}
                  <div style={{ textAlign: 'right', marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => switchTab('forgot')}
                      style={{ fontSize: 13, color: 'var(--g700)', fontWeight: 500, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
                <button type="submit" className="btn-submit" disabled={loginSubmitting}>
                  {loginSubmitting ? 'Logging in…' : 'Log In to My Dashboard →'}
                </button>
              </form>
              <div className="switch-link">
                Don't have an account? <button onClick={() => switchTab('register')}>Register </button>
              </div>
            </div>
          )}

          {/* FORGOT PASSWORD PANEL (Volunteer) */}
          {activeTab === 'forgot' && (
            <div className="panel active">
              {forgotStep === 'request' && (
                <>
                  <h1 className="form-title">Reset your password</h1>
                  <p className="form-sub">Enter your account email and we'll send a verification code to reset your password.</p>

                  <form onSubmit={handleForgotRequestSubmit} noValidate>
                    <div className="field-group">
                      <label className="field-label">Email Address <span className="field-required">*</span></label>
                      <input
                        type="email"
                        className={`field-input${forgotErrors.email ? ' error' : ''}`}
                        placeholder="you@example.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                      />
                      {forgotErrors.email && <div className="field-error">⚠ {forgotErrors.email}</div>}
                    </div>
                    <button type="submit" className="btn-submit" disabled={forgotSubmitting}>
                      {forgotSubmitting ? 'Sending code…' : 'Send Verification Code →'}
                    </button>
                  </form>
                  <div className="switch-link">
                    Remembered your password? <button onClick={() => switchTab('login')}>Log in</button>
                  </div>
                </>
              )}

              {forgotStep === 'reset' && (
                <>
                  <h1 className="form-title">Enter verification code</h1>
                  <p className="form-sub">
                    We sent a 6-digit code to <strong>{forgotEmail}</strong>. Enter it below along with your new password.
                  </p>
                  {forgotInfo && <div className="field-success">✓ {forgotInfo}</div>}

                  <form onSubmit={handleForgotResetSubmit} noValidate>
                    <div className="field-group">
                      <label className="field-label">Verification Code <span className="field-required">*</span></label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className={`field-input${forgotErrors.otp ? ' error' : ''}`}
                        placeholder="6-digit code"
                        value={forgotOtp}
                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        style={{ letterSpacing: 4, fontWeight: 700 }}
                      />
                      {forgotErrors.otp && <div className="field-error">⚠ {forgotErrors.otp}</div>}
                      <div className="field-hint">
                        {resendCooldown > 0 ? (
                          <>Resend available in {resendCooldown}s</>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendCode}
                            disabled={forgotSubmitting}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--g700)', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Resend code
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="field-group">
                      <label className="field-label">New Password <span className="field-required">*</span></label>
                      <div className="pass-wrap">
                        <input
                          type={showForgotNewPass ? 'text' : 'password'}
                          className={`field-input${forgotErrors.newPassword ? ' error' : ''}`}
                          placeholder="Min 8 characters"
                          style={{ paddingRight: 60 }}
                          value={forgotNewPassword}
                          onChange={(e) => setForgotNewPassword(e.target.value)}
                        />
                        <button type="button" className="pass-toggle" onClick={() => setShowForgotNewPass((s) => !s)}>
                          {showForgotNewPass ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <div className="strength-bar">
                        <div className="strength-fill" style={{ width: forgotStrength.width, background: forgotStrength.color }} />
                      </div>
                      <div className="strength-label" style={{ color: forgotStrength.color }}>Strength: {forgotStrength.label}</div>
                      {forgotErrors.newPassword && <div className="field-error">⚠ {forgotErrors.newPassword}</div>}
                    </div>
                    <div className="field-group">
                      <label className="field-label">Confirm New Password <span className="field-required">*</span></label>
                      <div className="pass-wrap">
                        <input
                          type={showForgotConfirmPass ? 'text' : 'password'}
                          className={`field-input${forgotErrors.confirm ? ' error' : ''}`}
                          placeholder="Repeat new password"
                          style={{ paddingRight: 60 }}
                          value={forgotConfirmPassword}
                          onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        />
                        <button type="button" className="pass-toggle" onClick={() => setShowForgotConfirmPass((s) => !s)}>
                          {showForgotConfirmPass ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      {forgotErrors.confirm && <div className="field-error">⚠ {forgotErrors.confirm}</div>}
                    </div>
                    <button type="submit" className="btn-submit" disabled={forgotSubmitting}>
                      {forgotSubmitting ? 'Resetting…' : 'Reset Password →'}
                    </button>
                  </form>
                  <div className="switch-link">
                    <button onClick={handleUseDifferentEmail}>← Use a different email</button>
                  </div>
                </>
              )}

              {forgotStep === 'done' && (
                <>
                  <h1 className="form-title">Password reset!</h1>
                  <p className="form-sub">{forgotInfo || 'Your password has been reset successfully.'}</p>
                  <button
                    type="button"
                    className="btn-submit"
                    onClick={() => {
                      setLoginEmail(forgotEmail);
                      setLoginPassword('');
                      switchTab('login');
                    }}
                  >
                    Go to Login →
                  </button>
                </>
              )}
            </div>
          )}

          {/* REGISTER PANEL (Volunteer) */}
          {activeTab === 'register' && (
            <div className="panel active">
              {regStep === 'form' && (
                <>
                  <h1 className="form-title">Create Your Account</h1>
                  <p className="form-sub">Join SankalpTaru as a volunteer. Takes 2 minutes.</p>

                  <button type="button" className="btn-google" onClick={() => handleVolunteerGoogleLogin()}>
                    <div className="google-icon" />
                    Continue with Google
                  </button>
                  <div className="or-divider">or</div>

                  <form onSubmit={handleRegisterSubmit} noValidate>
                    <div className="field-group">
                      <label className="field-label">Email Address <span className="field-required">*</span></label>
                      <input
                        type="email"
                        className={`field-input${regErrors.email ? ' error' : ''}`}
                        placeholder="you@example.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                      {regErrors.email && (
                        <div className="field-error">
                          ⚠ {regErrors.email}
                          {regErrors.email.startsWith('An account') && (
                            <>
                              {' '}
                              <a href="#" onClick={(e) => { e.preventDefault(); switchTab('login'); }} style={{ color: 'var(--g700)' }}>
                                Log in instead →
                              </a>
                            </>
                          )}
                        </div>
                      )}
                      <div className="field-hint">(becomes your login username)</div>
                    </div>

                    <div className="field-row">
                      <div className="field-group">
                        <label className="field-label">Password <span className="field-required">*</span></label>
                        <div className="pass-wrap">
                          <input
                            type={showRegPass ? 'text' : 'password'}
                            className={`field-input${regErrors.password ? ' error' : ''}`}
                            placeholder="Min 8 characters"
                            style={{ paddingRight: 60 }}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                          />
                          <button type="button" className="pass-toggle" onClick={() => setShowRegPass((s) => !s)}>
                            {showRegPass ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <div className="strength-bar">
                          <div className="strength-fill" style={{ width: strength.width, background: strength.color }} />
                        </div>
                        <div className="strength-label" style={{ color: strength.color }}>Strength: {strength.label}</div>
                        {regErrors.password && <div className="field-error">⚠ {regErrors.password}</div>}
                      </div>
                      <div className="field-group">
                        <label className="field-label">Confirm Password <span className="field-required">*</span></label>
                        <div className="pass-wrap">
                          <input
                            type={showRegConfirm ? 'text' : 'password'}
                            className={`field-input${regErrors.confirm ? ' error' : ''}`}
                            placeholder="Repeat password"
                            style={{ paddingRight: 60 }}
                            value={regConfirm}
                            onChange={(e) => setRegConfirm(e.target.value)}
                          />
                          <button type="button" className="pass-toggle" onClick={() => setShowRegConfirm((s) => !s)}>
                            {showRegConfirm ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {regErrors.confirm && <div className="field-error">⚠ {regErrors.confirm}</div>}
                      </div>
                    </div>

                    <button type="submit" className="btn-submit" disabled={regSubmitting}>
                      {regSubmitting ? 'Creating account…' : 'Create Account & Start Volunteering →'}
                    </button>
                  </form>
                  <div className="switch-link">
                    Already have an account? <button onClick={() => switchTab('login')}>Log in</button>
                  </div>
                </>
              )}

              {regStep === 'verify' && (
                <>
                  <h1 className="form-title">Verify your email</h1>
                  <p className="form-sub">
                    We sent a 6-digit code to <strong>{regEmail}</strong>. Enter it below to activate your account.
                  </p>
                  {regInfo && <div className="field-success">✓ {regInfo}</div>}

                  <form onSubmit={handleVerifyEmailSubmit} noValidate>
                    <div className="field-group">
                      <label className="field-label">Verification Code <span className="field-required">*</span></label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className={`field-input${regErrors.otp ? ' error' : ''}`}
                        placeholder="6-digit code"
                        value={regOtp}
                        onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        style={{ letterSpacing: 4, fontWeight: 700 }}
                        autoFocus
                      />
                      {regErrors.otp && <div className="field-error">⚠ {regErrors.otp}</div>}
                      <div className="field-hint">
                        {regResendCooldown > 0 ? (
                          <>Resend available in {regResendCooldown}s</>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendRegCode}
                            disabled={regSubmitting}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--g700)', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Resend code
                          </button>
                        )}
                      </div>
                    </div>
                    <button type="submit" className="btn-submit" disabled={regSubmitting}>
                      {regSubmitting ? 'Verifying…' : 'Verify & Continue →'}
                    </button>
                  </form>
                  <div className="switch-link">
                    <button onClick={handleUseDifferentRegEmail}>← Use a different email</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STAFF LOGIN PANEL (Manager / Admin) */}
          {activeTab === 'staff' && (
            <div className="panel active">
              <h1 className="form-title">Staff Login</h1>
              <p className="form-sub">
                For SankalpTaru managers and admins only. Sign in with your{' '}
                <strong>@{STAFF_DOMAIN}</strong> Google account — no registration needed.
              </p>

              <div className="staff-google-wrap" ref={staffButtonWrapRef}>
                {GOOGLE_CLIENT_ID ? (
                  <GoogleLogin
                    onSuccess={handleStaffGoogleSuccess}
                    onError={() => setStaffError('Google sign-in failed. Please try again.')}
                    hosted_domain={STAFF_DOMAIN}
                    text="signin_with"
                    shape="pill"
                    width={staffButtonWidth}
                  />
                ) : (
                  <div className="field-error">⚠ Google Client ID is not configured (VITE_GOOGLE_CLIENT_ID).</div>
                )}
              </div>

              {staffSubmitting && (
                <div className="staff-verifying">
                  <span className="spinner" />
                  Verifying your account…
                </div>
              )}
              {staffError && <div className="staff-error">⚠ {staffError}</div>}

              <div className="staff-note">
                <span className="staff-note-icon">🔒</span>
                <span>
                  Only Google accounts on the <strong>{STAFF_DOMAIN}</strong> domain that have already
                  been added as a Manager or Admin can sign in here. If you should have access but can't
                  sign in, contact your SankalpTaru IT admin to be provisioned.
                </span>
              </div>

              <div className="switch-link">
                Volunteering with us? <button onClick={() => switchTab('login')}>Go to volunteer login</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  // Ideally GoogleOAuthProvider wraps your whole app (in main.jsx/App.jsx) rather than
  // just this page — kept here so this file is self-contained.
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <LoginInner />
    </GoogleOAuthProvider>
  );
}
