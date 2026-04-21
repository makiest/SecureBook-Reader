import React from 'react';

export default function Layout({ user, onLogout, theme, onToggleTheme, children }) {
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      onLogout();
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <div className="app-container">
      <header style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0, background: 'linear-gradient(to right, #3b82f6, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Secure Library
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', margin: 0 }}>Lee tu colección de forma segura.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Theme Toggle Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.2rem', opacity: theme === 'light' ? 1 : 0.5 }}>☀️</span>
            <div 
              onClick={onToggleTheme}
              style={{
                width: '50px',
                height: '26px',
                backgroundColor: 'var(--panel-bg)',
                borderRadius: '13px',
                border: '1px solid var(--border-color)',
                position: 'relative',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                backgroundColor: 'var(--accent)',
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: theme === 'light' ? '2px' : '26px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }} />
            </div>
            <span style={{ fontSize: '1.2rem', opacity: theme === 'dark' ? 1 : 0.5 }}>🌙</span>
          </div>

          <span style={{ color: 'var(--text-secondary)' }}>Hola, <strong style={{ color: 'var(--text-primary)' }}>{user.username}</strong></span>
          <button 
            onClick={handleLogout}
            style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      {user.isDbConfigured === false && (
        <div style={{ backgroundColor: '#ef4444', color: 'white', padding: '1rem', textAlign: 'center', margin: '0 2rem 2rem', borderRadius: '8px', fontWeight: 'bold' }}>
          Sistema en Modo Configuración: La base de datos no está conectada. Por favor, acuda a Ajustes.
        </div>
      )}

      <main style={{ padding: '0 2rem 2rem' }}>
        {children}
      </main>
    </div>
  );
}
