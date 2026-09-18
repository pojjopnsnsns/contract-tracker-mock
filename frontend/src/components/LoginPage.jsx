import { useState } from 'react';
import { api } from '../api.js';
import logo from '/public/business-contract-tracker-icon.svg';
import './LoginPage.css';

export default function LoginPage({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await api.login(username.trim(), password);
      onLoggedIn(user);
    } catch (err) {
      setError(err.status === 401 ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : err.message);
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-card__brand">
          <img src={logo} alt="" className="login-card__logo" aria-hidden="true" />
          <div>
            <p className="login-card__title">Contract Tracker</p>
            <p className="login-card__subtitle">เข้าสู่ระบบเพื่อใช้งานระบบติดตามการต่อสัญญา</p>
          </div>
        </div>

        {error && (
          <div className="form-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 4.6V8.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="11.2" r="0.9" fill="currentColor" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <label className="login-card__field">
          <span className="login-card__label">ชื่อผู้ใช้</span>
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="login-card__field">
          <span className="login-card__label">รหัสผ่าน</span>
          <div className="login-card__password-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="login-card__toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </label>

        <button type="submit" className="btn btn--primary login-card__submit" disabled={loading}>
          {loading ? (
            <>
              <span className="login-card__spinner" aria-hidden="true" />
              กำลังเข้าสู่ระบบ...
            </>
          ) : (
            'เข้าสู่ระบบ'
          )}
        </button>
      </form>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1.5 9C1.5 9 4.5 3.75 9 3.75C13.5 3.75 16.5 9 16.5 9C16.5 9 13.5 14.25 9 14.25C4.5 14.25 1.5 9 1.5 9Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.5 2.5L15.5 15.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M7.6 4.06C8.05 3.99 8.51 3.95 9 3.95C13.5 3.95 16.5 9 16.5 9C16.5 9 15.66 10.44 14.15 11.73M4.86 5.24C2.9 6.6 1.5 9 1.5 9C1.5 9 4.5 14.05 9 14.05C10.16 14.05 11.19 13.72 12.06 13.22"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.3 9.9C7.06 9.53 6.92 9.08 6.92 8.6C6.92 7.32 7.96 6.28 9.24 6.28C9.71 6.28 10.15 6.42 10.51 6.65"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
