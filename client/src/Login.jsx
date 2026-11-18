import { useState } from 'react';

const AUTH = 'http://localhost:5000/api/auth';

function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function post(path, body) {
    const res = await fetch(`${AUTH}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json() };
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      const reg = await post('register', { name, email, password });
      if (!reg.ok) return setError(reg.data.error);
    }

    // After registering, log in straight away
    const login = await post('login', { email, password });
    if (!login.ok) return setError(login.data.error);

    localStorage.setItem('token', login.data.token);
    localStorage.setItem('user', JSON.stringify(login.data.user));
    onLogin(login.data.user);
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <h1>Task Manager</h1>
        <p>{mode === 'login' ? 'Log in to your account' : 'Create a new account'}</p>

        {error && <div className="error-box">{error}</div>}

        {mode === 'register' && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
        )}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />

        <button className="btn-primary" type="submit">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Already registered? Log in'}
        </button>
      </form>
    </div>
  );
}

export default Login;