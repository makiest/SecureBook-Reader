import React, { useState, useEffect } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeProvider, setActiveProvider] = useState('none');
  const [isEntraConfigured, setIsEntraConfigured] = useState(false);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then(r => r.json())
      .then(data => {
        setActiveProvider(data.activeProvider);
        setIsEntraConfigured(data.entraConfigured);
      })
      .catch(err => console.error('Failed to load auth providers', err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Usuario o contraseña inválidos');
      }
      const data = await res.json();
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = () => {
    window.location.href = '/api/auth/login/ad';
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: '#0f172a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(10px)',
        padding: '3rem 2rem', borderRadius: '12px', width: '90%', maxWidth: '400px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
      }}>
        <h2 style={{ textAlign: 'center', color: 'white', marginBottom: '0.5rem', fontSize: '2rem', background: 'linear-gradient(to right, #3b82f6, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Secure Library
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' }}>Inicia sesión</p>
        
        {error && <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem', borderRadius: '4px', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input 
            type="text" 
            placeholder="Usuario" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(30, 41, 59, 0.7)', color: 'white' }}
            required
          />
          <input 
            type="password" 
            placeholder="Contraseña" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(30, 41, 59, 0.7)', color: 'white' }}
            required
          />
          <button type="submit" disabled={loading} style={{ padding: '0.75rem', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', marginTop: '0.5rem' }}>
            {loading ? 'Ingresando...' : 'Acceder'}
          </button>
        </form>

        {isEntraConfigured && (
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>o bien</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            </div>
            <button 
              onClick={handleMicrosoftLogin}
              style={{ 
                width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', 
                background: 'white', color: '#2f2f2f', cursor: 'pointer', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
              }}
            >
              <img src="https://auth.msftauth.net/images/microsoft_logo.svg" alt="MS" style={{ width: '20px' }} />
              Iniciar sesión con Microsoft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
