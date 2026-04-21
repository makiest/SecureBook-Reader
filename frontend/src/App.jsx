import React, { useState, useEffect } from 'react';
import Library from './components/Library';
import ReaderModal from './components/ReaderModal';
import Login from './components/Login';
import Layout from './components/Layout';

function App() {
  const [selectedBook, setSelectedBook] = useState(null);
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTheme, setActiveTheme] = useState('dark');

  const applyTheme = (theme, preference, defaultTheme) => {
    let target = preference || defaultTheme || 'system';
    
    if (target === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      target = isDark ? 'dark' : 'light';
    }
    
    setActiveTheme(target);
    document.documentElement.setAttribute('data-theme', target);
  };

  useEffect(() => {
    fetch('/api/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not logged in');
      })
      .then(data => {
        setUser(data);
        applyTheme(null, data.themePreference, data.defaultTheme);
        setLoadingAuth(false);
      })
      .catch(() => {
        setUser(null);
        setLoadingAuth(false);
      });
  }, []);

  const handleToggleTheme = async () => {
    const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
    setActiveTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    
    // Persist preference
    if (user) {
      await fetch('/api/me/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: nextTheme })
      });
      setUser({ ...user, themePreference: nextTheme });
    }
  };

  if (loadingAuth) {
    return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Verificando sesión...</div>;
  }

  if (!user) {
    return <Login onLogin={(u) => {
      setUser(u);
      applyTheme(null, u.themePreference, u.defaultTheme);
    }} />;
  }

  return (
    <Layout user={user} onLogout={() => {
      setUser(null);
      setActiveTheme('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }} theme={activeTheme} onToggleTheme={handleToggleTheme}>
      <Library user={user} onSelectBook={setSelectedBook} />
      {selectedBook && (
        <ReaderModal book={selectedBook} onClose={() => setSelectedBook(null)} />
      )}
    </Layout>
  );
}

export default App;
