import React, { useEffect, useState, useRef } from 'react';
import HelpTooltip from './HelpTooltip';

export default function Library({ user, onSelectBook }) {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(user?.isDbConfigured === false);
  const [settingsView, setSettingsView] = useState(user?.isDbConfigured === false ? 'database' : 'menu'); // 'menu', 'library', 'categories', 'interface', 'directory', 'users', 'database'
  const [isReloading, setIsReloading] = useState(false);

  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('visor');

  const [authConfig, setAuthConfig] = useState({
    activeProvider: 'none',
    defaultTheme: 'system',
    entra: { clientId: '', tenantId: '', clientSecret: '', adminGroupId: '', visorGroupId: '' },
    ldap: { url: '', bindDN: '', bindCredentials: '', searchBase: '', adminGroupDN: '', visorGroupDN: '' }
  });

  // Book manager state
  const [showBookManager, setShowBookManager] = useState(false);
  const [bookFiles, setBookFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const fileInputRef = useRef(null);
  
  // Database configuration state
  const [extDbUrl, setExtDbUrl] = useState('');
  const [isConfiguringDb, setIsConfiguringDb] = useState(false);

  // Category reorder state
  const [dragCatId, setDragCatId] = useState(null);
  const [dragOverCatId, setDragOverCatId] = useState(null);

  useEffect(() => {
    if (showSettings && user?.role === 'admin') {
      fetch('/api/users').then(r => r.json()).then(setUsers);
      fetch('/api/admin/auth-config').then(r => r.json()).then(setAuthConfig);
    }
  }, [showSettings, user]);

  const handleSaveAuthConfig = async () => {
    await fetch('/api/admin/auth-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authConfig)
    });
    alert('Configuración guardada correctamente');
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole })
    });
    if (res.ok) {
      const u = await res.json();
      setUsers([...users, u]);
      setNewUsername('');
      setNewPassword('');
      setNewRole('visor');
    }
  };

  const handleDeleteUser = async (id) => {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) setUsers(users.filter(u => u.id !== id));
  };
  
  const handleUpdateUserRole = async (id, newRole) => {
    const res = await fetch(`/api/users/${id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) {
      setUsers(users.map(u => u.id === id ? { ...u, role: newRole } : u));
    }
  };

  // Book manager handlers
  const loadBookFiles = async () => {
    try {
      const res = await fetch('/api/books/files');
      if (res.ok) setBookFiles(await res.json());
    } catch (err) {
      console.error('Failed to load book files', err);
    }
  };

  const openBookManager = () => {
    setShowBookManager(true);
    loadBookFiles();
  };

  const handleManualTranslate = async (filename) => {
    try {
      const res = await fetch(`/api/books/files/${encodeURIComponent(filename)}/translate`, { method: 'POST' });
      if (res.ok) {
        alert('Traducción iniciada en segundo plano. Estará disponible en el visor web en unos minutos.');
        loadBookFiles();
      } else {
        alert('Error al iniciar traducción.');
      }
    } catch {
      alert('Error de red al intentar traducir.');
    }
  };

  const handlePreviewTranslate = async (filename) => {
    try {
      const res = await fetch(`/api/books/files/${encodeURIComponent(filename)}/translate-preview`, { method: 'POST' });
      if (res.ok) {
        alert('Traducción preview iniciada en segundo plano.');
        loadBookFiles();
      } else {
        alert('Error al iniciar traducción preview.');
      }
    } catch {
      alert('Error de red al intentar traducir preview.');
    }
  };

  const handleFileUpload = async (files, autoTranslate) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(`Subiendo ${files.length} archivo(s)...`);
    const formData = new FormData();
    for (const file of files) {
      formData.append('books', file);
    }
    formData.append('autoTranslate', autoTranslate);
    try {
      const res = await fetch('/api/books/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setUploadProgress(`✓ ${data.count} archivo(s) subido(s)`);
        await loadBookFiles();
        // Also refresh main library
        const booksData = await fetch('/api/books').then(r => r.json());
        setBooks(booksData);
      } else {
        const err = await res.json();
        setUploadProgress(`✗ Error: ${err.error}`);
      }
    } catch (err) {
      setUploadProgress(`✗ Error de conexión`);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(''), 4000);
    }
  };

  const handleDeleteFile = async (filename) => {
    try {
      const res = await fetch(`/api/books/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (res.ok) {
        await loadBookFiles();
        const booksData = await fetch('/api/books').then(r => r.json());
        setBooks(booksData);
        setFileToDelete(null);
      } else {
        const err = await res.json();
        alert(`Error al eliminar: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error('Failed to delete book', err);
      alert('Error de conexión al intentar eliminar el libro.');
    } finally {
      if (fileToDelete === filename) setFileToDelete(null);
    }
  };

  const handleManagerDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleManagerDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleManagerDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleReloadBooks = async () => {
    setIsReloading(true);
    try {
      await fetch('/api/books/scan', { method: 'POST' });
      const booksData = await fetch('/api/books').then(r => r.json());
      setBooks(booksData);
    } catch (err) {
      console.error('Failed to reload books', err);
    } finally {
      setIsReloading(false);
    }
  };

  useEffect(() => {
    if (user?.isDbConfigured === false) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch('/api/books').then(r => r.json()),
      fetch('/api/categories').then(r => r.json())
    ])
      .then(([booksData, catsData]) => {
        setBooks(booksData);
        setCategories(catsData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load library', err);
        setLoading(false);
      });
  }, []);

  const handleUpdateDefaultTheme = async (newTheme) => {
    const updated = { ...authConfig, defaultTheme: newTheme };
    setAuthConfig(updated);
    try {
      await fetch('/api/admin/auth-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error('Error saving default theme', e);
    }
  };

  const handleDragStart = (e, bookId) => {
    if (user?.role !== 'admin') return;
    e.dataTransfer.setData('bookId', bookId);
    dragMouseY.current = e.clientY;
    isDragging.current = true;
    startAutoScroll();
  };

  // Auto-scroll refs
  const dragMouseY = useRef(0);
  const isDragging = useRef(false);
  const scrollRAF = useRef(null);

  const startAutoScroll = () => {
    const EDGE_SIZE = 80; // px from edge to trigger scroll
    const MAX_SPEED = 18; // px per frame

    const tick = () => {
      if (!isDragging.current) return;
      const y = dragMouseY.current;
      const vh = window.innerHeight;

      if (y < EDGE_SIZE) {
        // Near top — scroll up, faster the closer to edge
        const intensity = 1 - y / EDGE_SIZE;
        window.scrollBy(0, -MAX_SPEED * intensity);
      } else if (y > vh - EDGE_SIZE) {
        // Near bottom — scroll down
        const intensity = 1 - (vh - y) / EDGE_SIZE;
        window.scrollBy(0, MAX_SPEED * intensity);
      }
      scrollRAF.current = requestAnimationFrame(tick);
    };
    scrollRAF.current = requestAnimationFrame(tick);
  };

  const stopAutoScroll = () => {
    isDragging.current = false;
    if (scrollRAF.current) {
      cancelAnimationFrame(scrollRAF.current);
      scrollRAF.current = null;
    }
  };

  // Track mouse position during drag and clean up on end
  useEffect(() => {
    const onDragOver = (e) => {
      dragMouseY.current = e.clientY;
    };
    const onDragEnd = () => stopAutoScroll();
    const onDrop = () => stopAutoScroll();

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragend', onDragEnd);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('drop', onDrop);
      stopAutoScroll();
    };
  }, []);

  const handleDrop = async (e, categoryId) => {
    e.preventDefault();
    stopAutoScroll();
    if (user?.role !== 'admin') return;
    const bookId = e.dataTransfer.getData('bookId');
    if (!bookId) return;

    // Optimistic UI update
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, categoryId } : b));

    await fetch(`/api/books/${bookId}/category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId })
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() })
    });
    if (res.ok) {
      const newCat = await res.json();
      setCategories([...categories, newCat]);
      setNewCatName('');
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    const res = await fetch(`/api/categories/${categoryId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      setCategories(prev => prev.filter(c => c.id !== categoryId));
      setBooks(prev => prev.map(b => b.categoryId === categoryId ? { ...b, categoryId: null } : b));
    }
  };

  // Category panel reorder handlers
  const handleCatDragStart = (e, catId) => {
    if (user?.role !== 'admin') return;
    e.dataTransfer.setData('catId', catId);
    e.dataTransfer.effectAllowed = 'move';
    setDragCatId(catId);
  };

  const handleCatDragOver = (e, catId) => {
    e.preventDefault();
    if (dragCatId && catId !== dragCatId && catId !== null) {
      setDragOverCatId(catId);
    }
  };

  const handleCatDrop = async (e, targetCatId) => {
    e.preventDefault();
    const sourceCatId = e.dataTransfer.getData('catId');
    if (!sourceCatId || sourceCatId === targetCatId || targetCatId === null) {
      setDragCatId(null);
      setDragOverCatId(null);
      return;
    }
    // Reorder locally
    const newCats = [...categories];
    const fromIdx = newCats.findIndex(c => c.id === sourceCatId);
    const toIdx = newCats.findIndex(c => c.id === targetCatId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newCats.splice(fromIdx, 1);
    newCats.splice(toIdx, 0, moved);
    setCategories(newCats);
    setDragCatId(null);
    setDragOverCatId(null);
    // Persist
    await fetch('/api/categories/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newCats.map(c => c.id) })
    });
  };

  const handleCatDragEnd = () => {
    setDragCatId(null);
    setDragOverCatId(null);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading your library...</div>;
  }

  const renderBook = (book) => (
    <div 
      key={book.id}
      data-book-card="true"
      draggable={user?.role === 'admin'}
      onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, book.id); }}
      className="glass-panel"
      style={{
        cursor: 'grab',
        overflow: 'hidden',
        transition: 'transform 0.2s, background 0.2s',
        display: 'flex',
        flexDirection: 'column'
      }}
      onClick={() => onSelectBook(book)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-5px)';
        e.currentTarget.style.background = 'var(--card-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.background = 'var(--panel-bg)';
      }}
    >
      <div style={{ height: '280px', backgroundColor: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {book.hasCover ? (
          <img 
            src={`/api/books/${book.id}/cover`} 
            alt={`${book.title} cover`} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} 
          />
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: '3rem', opacity: 0.5, pointerEvents: 'none' }}>
            {book.type === 'pdf' ? 'PDF' : 'EPUB'}
          </span>
        )}
      </div>
      <div style={{ padding: '1rem', pointerEvents: 'none' }}>
        <h3 style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {book.title}
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: '0.5rem', display: 'inline-block', textTransform: 'uppercase', fontWeight: 600 }}>
          {book.type}
        </span>
      </div>
    </div>
  );

  const uncategorizedBooks = books.filter(b => !b.categoryId);
  const categoryGroups = categories.map(c => ({
    id: c.id,
    name: c.name,
    books: books.filter(b => b.categoryId === c.id)
  }));

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {user && user.role === 'admin' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button 
            onClick={() => {
              setSettingsView('menu');
              setShowSettings(true);
            }}
            style={{ padding: '0.5rem 1rem', background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 'bold' }}
          >
            ⚙️ Ajustes
          </button>
        </div>
      )}

      {showSettings && user && user.role === 'admin' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'var(--shadow-color)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--settings-bg)', padding: '2rem', borderRadius: '8px', 
            width: '90%', maxWidth: '500px', border: '1px solid var(--border-color)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {settingsView !== 'menu' && (
                  <button 
                    onClick={() => setSettingsView('menu')}
                    style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.9rem' }}
                  >
                    ← Volver
                  </button>
                )}
                <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>
                  {settingsView === 'menu' ? 'Ajustes del Sistema' : 
                   settingsView === 'library' ? 'Gestión de Biblioteca' :
                   settingsView === 'categories' ? 'Gestión de Categorías' :
                   settingsView === 'interface' ? 'Preferencias de Interfaz' :
                   settingsView === 'directory' ? 'Servicios de Directorio' :
                   'Gestión de Usuarios'}
                </h2>
              </div>
              <button 
                onClick={() => setShowSettings(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >&times;</button>
            </div>

            <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {settingsView === 'menu' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    { id: 'library', label: 'Gestión de Biblioteca', icon: '📚' },
                    { id: 'categories', label: 'Gestión de Categorías', icon: '📁' },
                    { id: 'interface', label: 'Preferencias de Interfaz', icon: '🎨' },
                    { id: 'directory', label: 'Servicios de Directorio', icon: '🌐' },
                    { id: 'database', label: 'Base de Datos', icon: '🗄️' },
                    { id: 'users', label: 'Gestión de Usuarios', icon: '👥' },
                  ].map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => setSettingsView(btn.id)}
                      style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--panel-bg)'}
                    >
                      <span>{btn.icon} {btn.label}</span>
                      <span>→</span>
                    </button>
                  ))}
                </div>
              )}

              {settingsView === 'library' && (
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center' }}>
                    Estado actual: {books.length} libros cargados
                    <HelpTooltip text="Pulsa este botón si has añadido o borrado archivos manualmente en la carpeta /books. El sistema re-escaneará todo." />
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <button 
                      onClick={handleReloadBooks}
                      disabled={isReloading}
                      style={{ padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)', cursor: isReloading ? 'not-allowed' : 'pointer', fontWeight: 'bold', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
                    >
                      <span>{isReloading ? 'Recargando...' : 'Recargar colección (re-escanear disco)'}</span>
                      <span>🔄</span>
                    </button>
                    <button 
                      onClick={openBookManager}
                      style={{ padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 'bold', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
                    >
                      <span>Gestor de libros (Subir / Eliminar)</span>
                      <span>📤</span>
                    </button>
                  </div>
                </div>
              )}
              
              {settingsView === 'categories' && (
                <div>
                  <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center' }}>
                    Organización
                    <HelpTooltip text="Crea categorías para organizar tus libros. Una vez creadas, arrastra los libros a sus secciones correspondientes." />
                  </h3>
                  <form onSubmit={handleAddCategory} style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                    <input 
                      type="text" 
                      placeholder="Nueva categoría..." 
                      value={newCatName} 
                      onChange={e => setNewCatName(e.target.value)} 
                      style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)', flex: 1 }}
                    />
                    <button type="submit" style={{ padding: '0.75rem 1rem', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                      Crear
                    </button>
                  </form>

                  <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Categorías Existentes</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {categories.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No hay categorías.</p>}
                    {categories.map(c => (
                      <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--panel-bg)', marginBottom: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                        <button onClick={() => handleDeleteCategory(c.id)} style={{ background: 'transparent', border: '1px solid #ef4444', borderRadius: '4px', padding: '0.3rem 0.6rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Eliminar</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {settingsView === 'interface' && (
                <div>
                  <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    Tema predeterminado
                    <HelpTooltip text="Define el tema que verán los usuarios que no han personalizado su preferencia aún." />
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {['light', 'dark', 'system'].map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', color: authConfig.defaultTheme === t ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '1rem', background: 'var(--panel-bg)', borderRadius: '8px', border: authConfig.defaultTheme === t ? '2px solid var(--accent)' : '1px solid var(--border-color)' }}>
                        <input type="radio" name="defaultTheme" value={t} checked={authConfig.defaultTheme === t} onChange={e => handleUpdateDefaultTheme(e.target.value)} />
                        <span style={{ fontWeight: 'bold' }}>{t === 'light' ? '🔆 Claro' : t === 'dark' ? '🌙 Oscuro' : '🖥️ Usar configuración del sistema'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {settingsView === 'directory' && (
                <div>
                  <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    Configuración de Autenticación
                    <HelpTooltip text="Selecciona un proveedor de identidad para habilitar el inicio de sesión único (SSO)." />
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    {['none', 'entra', 'ldap'].map(p => (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', color: authConfig.activeProvider === p ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '0.75rem', background: 'var(--panel-bg)', borderRadius: '6px', border: authConfig.activeProvider === p ? '1px solid var(--accent)' : '1px solid var(--border-color)' }}>
                        <input type="radio" name="provider" value={p} checked={authConfig.activeProvider === p} onChange={e => setAuthConfig({...authConfig, activeProvider: e.target.value})} />
                        {p === 'none' ? '🚫 Solo Local' : p === 'entra' ? '☁️ Microsoft Entra ID' : '🏢 AD Local (LDAP)'}
                      </label>
                    ))}
                  </div>

                  {authConfig.activeProvider === 'entra' && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#3b82f6', fontWeight: 'bold' }}>Parámetros de Azure Entra ID</span>
                        <HelpTooltip text={"Qué indicar en cada campo:\n\n- Tenant ID: ID del Directorio (Inquilino) en Azure.\n- Client ID: ID de la aplicación registrada.\n- Client Secret: El 'Valor' del secreto generado (no el ID).\n- Group ID: El 'Object ID' del grupo en Entra ID para filtrar permisos."} />
                      </div>
                      <input type="text" placeholder="Tenant ID" value={authConfig.entra.tenantId} onChange={e => setAuthConfig({...authConfig, entra: {...authConfig.entra, tenantId: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="text" placeholder="Client ID" value={authConfig.entra.clientId} onChange={e => setAuthConfig({...authConfig, entra: {...authConfig.entra, clientId: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="password" placeholder="Client Secret" value={authConfig.entra.clientSecret} onChange={e => setAuthConfig({...authConfig, entra: {...authConfig.entra, clientSecret: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="text" placeholder="Group ID Admin" value={authConfig.entra.adminGroupId} onChange={e => setAuthConfig({...authConfig, entra: {...authConfig.entra, adminGroupId: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="text" placeholder="Group ID Visor" value={authConfig.entra.visorGroupId} onChange={e => setAuthConfig({...authConfig, entra: {...authConfig.entra, visorGroupId: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                    </div>
                  )}

                  {authConfig.activeProvider === 'ldap' && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 'bold' }}>Parámetros LDAP (AD Local)</span>
                        <HelpTooltip text={"Qué indicar en cada campo:\n\n- LDAP URL: ej. ldap://ip-servidor\n- Bind DN: Usuario de servicio (ej: cn=Admin,dc=com)\n- Bind Password: Clave del usuario de servicio.\n- Search Base: Donde buscar usuarios (ej: ou=Usuarios,dc=com)\n- Group DN: DN completo del grupo (ej: cn=Admins,ou=Grupos,dc=com)"} />
                      </div>
                      <input type="text" placeholder="LDAP URL" value={authConfig.ldap.url} onChange={e => setAuthConfig({...authConfig, ldap: {...authConfig.ldap, url: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="text" placeholder="Bind DN" value={authConfig.ldap.bindDN} onChange={e => setAuthConfig({...authConfig, ldap: {...authConfig.ldap, bindDN: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="password" placeholder="Bind Password" value={authConfig.ldap.bindCredentials} onChange={e => setAuthConfig({...authConfig, ldap: {...authConfig.ldap, bindCredentials: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="text" placeholder="Search Base" value={authConfig.ldap.searchBase} onChange={e => setAuthConfig({...authConfig, ldap: {...authConfig.ldap, searchBase: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="text" placeholder="Admin Group DN" value={authConfig.ldap.adminGroupDN} onChange={e => setAuthConfig({...authConfig, ldap: {...authConfig.ldap, adminGroupDN: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                      <input type="text" placeholder="Visor Group DN" value={authConfig.ldap.visorGroupDN} onChange={e => setAuthConfig({...authConfig, ldap: {...authConfig.ldap, visorGroupDN: e.target.value}})} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white' }} />
                    </div>
                  )}

                  {authConfig.activeProvider !== 'none' && (
                    <button 
                      onClick={handleSaveAuthConfig}
                      style={{ width: '100%', marginTop: '1.5rem', padding: '1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Aplicar y Guardar Cambios
                    </button>
                  )}
                </div>
              )}

              {settingsView === 'database' && (
                <div>
                  <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    Configuración de Base de Datos
                    <HelpTooltip text="Selecciona la configuración para la conexión a PostgreSQL." />
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                      Puedes usar el contenedor local que viene integrado, o enlazar a una BBDD PostgreSQL externa.
                    </p>
                    <button 
                      onClick={async () => {
                        setIsConfiguringDb(true);
                        await fetch('/api/setup-db', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ mode: 'docker' }) });
                        alert('Configuración guardada. El servidor se está reiniciando en modo Local...');
                        setTimeout(() => window.location.reload(), 2000);
                      }}
                      disabled={isConfiguringDb}
                      style={{ padding: '0.75rem', background: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: isConfiguringDb ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                      🚀 Usar Contenedor Local (Automático)
                    </button>

                    <div style={{ margin: '1rem 0', height: '1px', background: 'var(--border-color)' }}></div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>O conectar a una BBDD PostgreSQL externa:</label>
                      <input 
                        type="text" 
                        placeholder="postgresql://user:pass@host:port/dbname" 
                        value={extDbUrl}
                        onChange={e => setExtDbUrl(e.target.value)}
                        style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'white', fontSize: '0.85rem' }} 
                      />
                      <button 
                        onClick={async () => {
                          if (!extDbUrl.trim()) return alert('Por favor, indica una URL de conexión válida.');
                          setIsConfiguringDb(true);
                          const res = await fetch('/api/setup-db', { 
                            method: 'POST', 
                            headers: {'Content-Type':'application/json'}, 
                            body: JSON.stringify({ mode: 'external', dbUrl: extDbUrl.trim() }) 
                          });
                          if (res.ok) {
                            alert('Conexión establecida. El servidor se está reiniciando...');
                            setTimeout(() => window.location.reload(), 2000);
                          } else {
                            const err = await res.json();
                            alert('Error: ' + err.error);
                            setIsConfiguringDb(false);
                          }
                        }}
                        disabled={isConfiguringDb || !extDbUrl.trim()}
                        style={{ padding: '0.75rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '6px', cursor: isConfiguringDb ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                      >
                        {isConfiguringDb ? 'Configurando...' : '⚙️ Configurar Base de Datos Externa'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {settingsView === 'users' && (
                <div>
                  <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center' }}>
                    Control de Usuarios Locales
                    <HelpTooltip text={"Qué indicar en cada campo:\n\n- Usuario/Contraseña: Credenciales para entrar.\n- Rol: 'Admin' (ve este menú de ajustes) o 'Visor' (solo puede leer libros)."} />
                  </h3>
                  <form onSubmit={handleAddUser} style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Usuario" value={newUsername} onChange={e => setNewUsername(e.target.value)} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)', flex: 1, minWidth: '100px' }} required />
                    <input type="password" placeholder="Contraseña" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)', flex: 1, minWidth: '100px' }} required />
                    <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>
                      <option value="visor">Visor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="submit" style={{ padding: '0.75rem 1rem', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Añadir</button>
                  </form>
                  
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {users.map(u => (
                      <li key={u.id} style={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--panel-bg)', marginBottom: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          👤 {u.username} <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '20px', background: u.role === 'admin' ? '#ef4444' : '#3b82f6', color: 'white' }}>{u.role.toUpperCase()}</span>
                        </span>
                        {u.username !== 'admin' && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select 
                              value={u.role}
                              onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                              style={{ padding: '0.3rem', borderRadius: '4px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                            >
                              <option value="visor">Visor</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => handleDeleteUser(u.id)} style={{ background: 'transparent', border: '1px solid #ef4444', borderRadius: '4px', padding: '0.3rem 0.6rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>&times;</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showBookManager && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'var(--shadow-color)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--settings-bg)', padding: '2rem', borderRadius: '12px',
            width: '90%', maxWidth: '650px', border: '1px solid var(--border-color)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.6)', maxHeight: '85vh', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.3rem' }}>📚 Gestión de Libros</h2>
              <button
                onClick={() => setShowBookManager(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >&times;</button>
            </div>

            {/* Upload Drop Zone */}
            <div
              onDragOver={handleManagerDragOver}
              onDragLeave={handleManagerDragLeave}
              onDrop={handleManagerDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '1.5rem',
                background: dragActive ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-hover)',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.epub"
                style={{ display: 'none' }}
                onChange={e => { handleFileUpload(e.target.files); e.target.value = ''; }}
              />
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', opacity: 0.6 }}>
                {isUploading ? '⏳' : '📁'}
              </div>
              <p style={{ color: dragActive ? 'var(--accent)' : 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                {isUploading ? 'Subiendo...' : 'Arrastra archivos PDF o EPUB aquí, o haz clic para buscar'}
              </p>
              <p style={{ color: 'var(--text-secondary)', opacity: 0.5, margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                Máximo 200 MB por archivo
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
              <input type="checkbox" checked={autoTranslate} onChange={(e) => setAutoTranslate(e.target.checked)} />
              Traducir automáticamente al español en segundo plano
            </label>

            {uploadProgress && (
              <div style={{
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                background: uploadProgress.startsWith('✓') ? 'rgba(16, 185, 129, 0.15)' : uploadProgress.startsWith('✗') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                color: uploadProgress.startsWith('✓') ? '#10b981' : uploadProgress.startsWith('✗') ? '#ef4444' : '#818cf8'
              }}>
                {uploadProgress}
              </div>
            )}

            {/* File List */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                  Archivos en biblioteca ({bookFiles.length})
                </h3>
                <button
                  onClick={loadBookFiles}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}
                  title="Refrescar lista"
                >🔄</button>
              </div>

              {bookFiles.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
                  No hay libros en la biblioteca.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {bookFiles.map(f => (
                    <li key={f.filename} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 0.75rem', background: 'var(--panel-bg)', marginBottom: '0.4rem',
                      borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: '0.75rem' }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.filename}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.3rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <span style={{ textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 }}>{f.type}</span>
                          <span>{formatFileSize(f.size)}</span>
                          {f.hasTranslation ? (
                            <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>✓ Español disponible</span>
                          ) : f.isTranslating ? (
                            <span style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>⏳ Traduciendo...</span>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              {f.hasPreviewTranslation ? (
                                <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>✓ Preview lista</span>
                              ) : (
                                <button onClick={() => handlePreviewTranslate(f.filename)} style={{ background: 'var(--panel-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.1rem 0.4rem', cursor: 'pointer', fontSize: '0.7rem' }}>
                                  Traducción Preview
                                </button>
                              )}
                              <button onClick={() => handleManualTranslate(f.filename)} style={{ background: 'var(--panel-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.1rem 0.4rem', cursor: 'pointer', fontSize: '0.7rem' }}>
                                Traducción Completa
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {fileToDelete === f.filename ? (
                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                          <button
                            onClick={() => handleDeleteFile(f.filename)}
                            style={{ background: '#ef4444', border: 'none', borderRadius: '4px', padding: '0.3rem 0.6rem', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                          >
                            Confirmar Borrado
                          </button>
                          <button
                            onClick={() => setFileToDelete(null)}
                            style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.3rem 0.6rem', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setFileToDelete(f.filename)}
                          style={{
                            background: 'transparent', border: '1px solid #ef4444', borderRadius: '4px',
                            padding: '0.25rem 0.6rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem',
                            fontWeight: 'bold', flexShrink: 0, transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          Eliminar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Uncategorized: only show when it has books or something is being dragged */}
      <div 
        className="glass-panel" 
        style={{ 
          marginBottom: uncategorizedBooks.length > 0 ? '2rem' : '0.5rem', 
          padding: uncategorizedBooks.length > 0 ? '1.5rem' : '0.75rem 1.5rem', 
          border: '1px solid var(--border-color)',
          transition: 'all 0.3s ease',
          opacity: uncategorizedBooks.length > 0 ? 1 : 0.5
        }}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, null)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: uncategorizedBooks.length > 0 ? '1.5rem' : '0', paddingBottom: uncategorizedBooks.length > 0 ? '0.5rem' : '0', borderBottom: uncategorizedBooks.length > 0 ? '1px solid var(--border-color)' : 'none' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: uncategorizedBooks.length > 0 ? '1.2rem' : '0.9rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Sin Categoría
            {uncategorizedBooks.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>— arrastra libros aquí</span>}
          </h2>
        </div>
        {uncategorizedBooks.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1.5rem'
          }}>
            {uncategorizedBooks.map(renderBook)}
          </div>
        )}
      </div>

      {/* Category panels: draggable to reorder */}
      {categoryGroups.map(group => {
        const isEmpty = group.books.length === 0;
        const isBeingDragged = dragCatId === group.id;
        const isDragTarget = dragOverCatId === group.id;
        return (
          <div 
            key={group.id}
            draggable={user?.role === 'admin'}
            onDragStart={(e) => {
              // Only allow category drag from the header grip, not from book cards
              if (e.target.closest('[data-book-card]')) {
                return;
              }
              handleCatDragStart(e, group.id);
            }}
            onDragOver={(e) => {
              handleDragOver(e);
              handleCatDragOver(e, group.id);
            }}
            onDrop={(e) => {
              const catId = e.dataTransfer.getData('catId');
              if (catId) {
                handleCatDrop(e, group.id);
              } else {
                handleDrop(e, group.id);
              }
            }}
            onDragEnd={handleCatDragEnd}
            className="glass-panel" 
            style={{ 
              marginBottom: isEmpty ? '0.5rem' : '2rem', 
              padding: isEmpty ? '0.75rem 1.5rem' : '1.5rem', 
              border: isDragTarget ? '2px solid var(--accent)' : '1px solid var(--border-color)',
              opacity: isBeingDragged ? 0.4 : 1,
              transition: 'all 0.3s ease',
              cursor: user?.role === 'admin' ? 'grab' : 'default'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEmpty ? '0' : '1.5rem', paddingBottom: isEmpty ? '0' : '0.5rem', borderBottom: isEmpty ? 'none' : '1px solid var(--border-color)' }}>
              <h2 style={{ color: 'var(--text-primary)', fontSize: isEmpty ? '0.9rem' : '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {user?.role === 'admin' && <span style={{ cursor: 'grab', opacity: 0.4, fontSize: '0.9rem' }}>☰</span>}
                {group.name}
                {isEmpty && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>— vacía</span>}
              </h2>
            </div>
            {!isEmpty && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '1.5rem'
              }}>
                {group.books.map(renderBook)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
