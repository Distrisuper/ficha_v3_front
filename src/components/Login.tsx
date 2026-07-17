import { useState, type CSSProperties, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // el error ya queda expuesto vía useAuth().error
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '32px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 1px 3px rgba(18,50,122,.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'var(--navy)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontStyle: 'italic',
            }}
          >
            F
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--navy)' }}>FICHA</div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--muted-2)' }}>AOKI · v.3</div>
          </div>
        </div>

        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="tu@empresa.com"
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
          />
        </label>

        {error && (
          <div style={{ background: 'var(--err-weak)', color: 'var(--err)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            height: 44,
            borderRadius: 9,
            border: 'none',
            background: loading ? '#8a94a6' : 'var(--blue)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 6,
          }}
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 42,
  marginTop: 7,
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  padding: '0 13px',
  fontSize: 14,
  color: 'var(--ink)',
  outline: 'none',
};
