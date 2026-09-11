import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearAuthFeedback, logIn, resetPassword, signUp } from './authSlice';
import './auth.css';

const MODES = {
  login: { title: 'Sign in', submit: 'Sign in' },
  signup: { title: 'Create account', submit: 'Create account' },
  reset: { title: 'Reset password', submit: 'Send reset email' },
};

function AuthScreen() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const status = useSelector((s) => s.auth.status);
  const error = useSelector((s) => s.auth.error);
  const notice = useSelector((s) => s.auth.notice);

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const busy = status === 'loading';
  const copy = MODES[mode];

  function switchMode(next) {
    setMode(next);
    setPassword('');
    dispatch(clearAuthFeedback());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'login') {
      try {
        await dispatch(logIn({ email, password })).unwrap();
        navigate('/dashboard');
      } catch {
        // login failed — the message is already in state.auth.error
      }
    } else if (mode === 'signup') {
      try {
        await dispatch(signUp({ email, password })).unwrap();
        navigate('/dashboard');
      } catch {
        // signup failed — the message is already in state.auth.error
      }
    } else {
      dispatch(resetPassword({ email }));
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">{copy.title}</h1>

        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode !== 'reset' && (
          <>
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'Please wait…' : copy.submit}
        </button>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button type="button" onClick={() => switchMode('reset')}>
                Forgot password?
              </button>
              <button type="button" onClick={() => switchMode('signup')}>
                Create an account
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button type="button" onClick={() => switchMode('login')}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" onClick={() => switchMode('login')}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default AuthScreen;
