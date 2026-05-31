import React, { useState, useEffect } from 'react';
import { api } from './api';
import Shell from './Shell';

function getSession() {
  try { return JSON.parse(sessionStorage.getItem('bebebills_session')); } catch { return null; }
}
function setSession(data) {
  sessionStorage.setItem('bebebills_session', JSON.stringify(data));
}

export default function App() {
  const [settings, setSettings] = useState(null);
  const [session, setSessionState] = useState(getSession);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => setSettings({ is_auth_setup: false, is_setup: false }));
  }, []);

  function handleLogin(userData) {
    setSession(userData);
    setSessionState(userData);
    setSettings(s => ({ ...s, is_auth_setup: true, is_setup: !!(userData.partner_a && userData.partner_b), partner_a: userData.partner_a, partner_b: userData.partner_b }));
  }

  function handleLogout() {
    sessionStorage.removeItem('bebebills_session');
    setSessionState(null);
    api.get('/settings').then(setSettings);
  }

  if (!settings) return <div style={{ padding: 20 }}>Loading…</div>;

  if (session) {
    return <Shell session={session} settings={settings} onLogout={handleLogout} onSettingsChange={setSettings} />;
  }

  return (
    <div className="landing-shell">
      <header className="app-header">
        <h1>BebeBills3</h1>
      </header>
      <LandingPage settings={settings} onLogin={handleLogin} />
      <footer className="app-footer">
        <span>welcome</span>
      </footer>
    </div>
  );
}

function LandingPage({ settings, onLogin }) {
  const accountExists = settings.is_auth_setup;
  const [signupData, setSignupData] = useState({ username: '', password: '', confirm: '', partner_a: '', partner_b: '' });
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup(e) {
    e.preventDefault();
    if (accountExists) return;
    setError('');
    if (signupData.password !== signupData.confirm) { setError('Passwords do not match'); return; }
    if (!signupData.partner_a || !signupData.partner_b) { setError('Both partner names required'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        username: signupData.username,
        password: signupData.password,
        partner_a: signupData.partner_a,
        partner_b: signupData.partner_b
      });
      onLogin(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!accountExists) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', loginData);
      onLogin(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="landing">
      <div className={`landing-panel${accountExists ? '' : ' dimmed'}`}>
        <h2>Log In</h2>
        {error && accountExists && <p className="form-error">{error}</p>}
        <form onSubmit={handleLogin}>
          <div className="form-field">
            <label>Username</label>
            <input
              value={loginData.username}
              onChange={e => setLoginData(d => ({ ...d, username: e.target.value }))}
              disabled={!accountExists || loading}
              autoComplete="username"
            />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={loginData.password}
              onChange={e => setLoginData(d => ({ ...d, password: e.target.value }))}
              disabled={!accountExists || loading}
              autoComplete="current-password"
            />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={!accountExists || loading}>
              {loading && accountExists ? 'Logging in…' : 'Log In'}
            </button>
          </div>
        </form>
      </div>

      <div className={`landing-panel${accountExists ? ' dimmed' : ''}`}>
        <h2>Sign Up</h2>
        {error && !accountExists && <p className="form-error">{error}</p>}
        <form onSubmit={handleSignup}>
          <div className="form-field">
            <label>Partner 1 Name</label>
            <input
              value={signupData.partner_a}
              onChange={e => setSignupData(d => ({ ...d, partner_a: e.target.value }))}
              disabled={accountExists || loading}
            />
          </div>
          <div className="form-field">
            <label>Partner 2 Name</label>
            <input
              value={signupData.partner_b}
              onChange={e => setSignupData(d => ({ ...d, partner_b: e.target.value }))}
              disabled={accountExists || loading}
            />
          </div>
          <div className="form-field">
            <label>Username</label>
            <input
              value={signupData.username}
              onChange={e => setSignupData(d => ({ ...d, username: e.target.value }))}
              disabled={accountExists || loading}
              autoComplete="username"
            />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={signupData.password}
              onChange={e => setSignupData(d => ({ ...d, password: e.target.value }))}
              disabled={accountExists || loading}
              autoComplete="new-password"
            />
          </div>
          <div className="form-field">
            <label>Confirm Password</label>
            <input
              type="password"
              value={signupData.confirm}
              onChange={e => setSignupData(d => ({ ...d, confirm: e.target.value }))}
              disabled={accountExists || loading}
              autoComplete="new-password"
            />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={accountExists || loading}>
              {loading && !accountExists ? 'Signing up…' : 'Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
