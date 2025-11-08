import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const resp = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await resp.json();
      if (!data.success) {
        setError(data.error || 'Login failed');
        return;
      }
      // persist token and user
      window.localStorage.setItem('token', data.token);
      window.localStorage.setItem('user', JSON.stringify(data.user));
      
      // Trigger a storage event for other tabs/windows and a custom event for same-tab listeners
      // (native 'storage' only fires on other windows, so we also emit 'authChanged')
      try {
        window.dispatchEvent(new Event('storage'));
      } catch (e) {
        // ignore if synthetic storage event is restricted
      }
      window.dispatchEvent(new Event('authChanged'));
      
      const redirectTo = searchParams.get('redirect') || '/';
      navigate(redirectTo);
    } catch (err) {
      console.error('Login error', err);
      setError('Login failed');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-page">
        <div className="auth-header">
          <h2>Welcome Back</h2>
          <p className="auth-subtitle">Log in to your AutoSmart Parts account</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Enter your password" />
          </div>
          {error && <div className="field-error">{error}</div>}
          <button className="btn-primary" type="submit">Log in</button>
        </form>
        <div className="auth-footer">
          <p>Don't have an account? <Link to="/signup" className="signup-link">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
