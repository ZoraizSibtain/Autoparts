import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const resp = await fetch('http://localhost:3001/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName })
      });
      const data = await resp.json();
      if (!data.success) {
        setError(data.error || 'Signup failed');
        return;
      }
      // store token and user
      window.localStorage.setItem('token', data.token);
      window.localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/');
    } catch (err) {
      console.error('Signup error', err);
      setError('Signup failed');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-page">
        <div className="auth-header">
          <h2>Create Account</h2>
          <p className="auth-subtitle">Join AutoSmart Parts today</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>First Name</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Create a strong password" />
          </div>
          {error && <div className="field-error">{error}</div>}
          <button className="btn-signup" type="submit">Create Account</button>
        </form>
      </div>
    </div>
  );
};

export default Signup;
