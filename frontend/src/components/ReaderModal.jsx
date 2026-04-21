import React, { useState, useEffect } from 'react';
import { Document, Page, Outline, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import { ReactReader } from 'react-reader';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function ReaderModal({ book, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [location, setLocation] = useState(null); // for epub
  const [translation, setTranslation] = useState(null);
  const [documentLang, setDocumentLang] = useState('en');
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Search state
  const [searchText, setSearchText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [pdfRef, setPdfRef] = useState(null);
  const [renditionRef, setRenditionRef] = useState(null);

  const toggleSearch = () => {
    setIsSearching(!isSearching);
    if (isSearching) {
      setSearchText('');
      setSearchResults([]);
      setSearchIndex(-1);
      if (renditionRef) {
        renditionRef.annotations.remove(undefined, 'search-highlight');
      }
    }
  };


  // Core security to prevent extraction of text even if text layer is enabled
  useEffect(() => {
    const preventDefault = (e) => e.preventDefault();
    document.addEventListener('contextmenu', preventDefault);
    document.addEventListener('copy', preventDefault);
    document.addEventListener('cut', preventDefault);
    return () => {
      document.removeEventListener('contextmenu', preventDefault);
      document.removeEventListener('copy', preventDefault);
      document.removeEventListener('cut', preventDefault);
    };
  }, []);

  const handleTranslate = async (text, x, y) => {
    setModalOffset({ x: 0, y: 0 });
    setTranslation({ text: '', x, y, loading: true });
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const data = await res.json();
        setTranslation({ text: data.translatedText, x, y, loading: false });
      } else {
        setTranslation({ text: 'Error in translation.', x, y, loading: false });
      }
    } catch {
      setTranslation({ text: 'Error connecting to service.', x, y, loading: false });
    }
  };

  useEffect(() => {
    if (book.type !== 'pdf') return;
    const handleMouseUp = (e) => {
      if (e.target.closest('#translation-popup')) return;
      const selection = window.getSelection();
      let text = selection.toString();
      text = text.replace(/-\s*\n\s*/g, '').replace(/-\s+/g, '').trim();
      if (!text) {
        setTranslation(null);
        return;
      }
      setTimeout(() => { 
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          handleTranslate(text, rect.left + (rect.width / 2), rect.bottom + 10);
        }
      }, 50);
    };
    
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [book.type]);

  // Handle modal dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingModal) return;
      setModalOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };
    const handleMouseUp = () => setIsDraggingModal(false);

    if (isDraggingModal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingModal, dragStart]);

  const handleModalMouseDown = (e) => {
    // Only allows dragging if clicking in the "header" or empty space of the popup, 
    // not on the close button or text. We'll attach this specifically to the header div.
    setIsDraggingModal(true);
    setDragStart({ x: e.clientX - modalOffset.x, y: e.clientY - modalOffset.y });
  };

  const executeSearch = async () => {
    if (!searchText.trim()) {
      setSearchResults([]);
      setSearchIndex(-1);
      if (renditionRef) renditionRef.annotations.remove(undefined, 'search-highlight');
      return;
    }
    setSearchLoading(true);
    setSearchResults([]);
    setSearchIndex(-1);
    
    if (book.type === 'pdf' && pdfRef) {
      const results = [];
      const numP = pdfRef.numPages;
      const term = searchText.toLowerCase();
      
      for (let i = 1; i <= numP; i++) {
        try {
            const page = await pdfRef.getPage(i);
            const textContent = await page.getTextContent();
            const text = textContent.items.map(item => item.str).join(' ');
            if (text.toLowerCase().includes(term)) {
              results.push(i);
            }
        } catch (e) {
            console.error("Error scanning page", i, e);
        }
      }
      setSearchResults(results);
      if (results.length > 0) {
        setSearchIndex(0);
        setPageNumber(results[0]);
      }
    } else if (book.type === 'epub' && renditionRef) {
      renditionRef.annotations.remove(undefined, 'search-highlight');
      try {
        const spineItems = renditionRef.book.spine.spineItems;
        const results = [];
        for (const item of spineItems) {
            await item.load(renditionRef.book.load.bind(renditionRef.book));
            const itemResults = item.find(searchText);
            if (itemResults && itemResults.length > 0) {
                results.push(...itemResults);
            }
        }
        setSearchResults(results);
        if (results.length > 0) {
           setSearchIndex(0);
           renditionRef.display(results[0].cfi);
           renditionRef.annotations.highlight(results[0].cfi, {}, (e)=>{}, 'search-highlight');
        }
      } catch (err) {
        console.error("Error searching epub", err);
      }
    }
    setSearchLoading(false);
  };

  const nextSearch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (searchIndex + 1) % searchResults.length;
    setSearchIndex(nextIdx);
    if (book.type === 'pdf') {
       setPageNumber(searchResults[nextIdx]);
    } else if (book.type === 'epub' && renditionRef) {
       renditionRef.annotations.remove(undefined, 'search-highlight');
       renditionRef.display(searchResults[nextIdx].cfi);
       renditionRef.annotations.highlight(searchResults[nextIdx].cfi, {}, ()=>{}, 'search-highlight');
    }
  };

  const prevSearch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = searchIndex - 1 < 0 ? searchResults.length - 1 : searchIndex - 1;
    setSearchIndex(prevIdx);
    if (book.type === 'pdf') {
       setPageNumber(searchResults[prevIdx]);
    } else if (book.type === 'epub' && renditionRef) {
       renditionRef.annotations.remove(undefined, 'search-highlight');
       renditionRef.display(searchResults[prevIdx].cfi);
       renditionRef.annotations.highlight(searchResults[prevIdx].cfi, {}, ()=>{}, 'search-highlight');
    }
  };

  const customTextRenderer = React.useCallback(({ str }) => {
    if (!searchText || !isSearching || searchResults.length === 0) return str;
    
    // Escapar caracteres especiales para evitar errores de RegExp
    const escapedSearch = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = str.match(new RegExp(escapedSearch, 'i'));
    
    if (match) {
      // Devolver un string HTML plano. React-PDF < 8 stringifica los objetos React.
      return str.replace(new RegExp(`(${escapedSearch})`, 'gi'), (value) => 
        `<mark style="background-color: rgba(255, 226, 0, 0.5); color: transparent; border-radius: 2px;">${value}</mark>`
      );
    }
    return str;
  }, [searchText, isSearching, searchResults]);

  const streamUrl = `/api/books/${book.id}/stream?lang=${documentLang}`;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--bg-color)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)', backdropFilter: 'blur(10px)' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', margin: 0 }}>{book.title}</h2>
        
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              onClick={toggleSearch}
              style={{
                background: isSearching ? 'var(--accent)' : 'transparent',
                border: '1px solid var(--border-color)',
                color: isSearching ? 'white' : 'var(--text-primary)',
                borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', fontWeight: 'bold'
              }}
            >
              🔍 Buscar
            </button>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', padding: '2px' }}>
            <button
              onClick={() => setDocumentLang('en')}
              style={{
                background: documentLang === 'en' ? 'var(--accent)' : 'transparent',
                color: documentLang === 'en' ? 'white' : 'var(--text-secondary)',
                border: 'none', padding: '0.3rem 0.8rem', borderRadius: '18px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s'
              }}
            >EN</button>
            <button
              onClick={() => setDocumentLang('preview_es')}
              style={{
                background: documentLang === 'preview_es' ? 'var(--accent)' : 'transparent',
                color: documentLang === 'preview_es' ? 'white' : 'var(--text-secondary)',
                border: 'none', padding: '0.3rem 0.8rem', borderRadius: '18px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s'
              }}
            >ES (Preview)</button>
            <button
              onClick={() => setDocumentLang('es')}
              style={{
                background: documentLang === 'es' ? 'var(--accent)' : 'transparent',
                color: documentLang === 'es' ? 'white' : 'var(--text-secondary)',
                border: 'none', padding: '0.3rem 0.8rem', borderRadius: '18px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s'
              }}
            >ES (Completo)</button>
          </div>

          <button 
            onClick={onClose}
            style={{ 
              background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', 
              fontSize: '1.5rem', padding: '0 1rem', opacity: 0.7
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
          >
            &times;
          </button>
        </div>
      </div>

      {isSearching && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Buscar en el documento..." 
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => { if(e.key==='Enter') executeSearch() }}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)', width: '300px' }}
          />
          <button onClick={executeSearch} disabled={searchLoading} style={{ padding: '0.5rem 1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {searchLoading ? 'Escaneando...' : 'Buscar'}
          </button>
          
          {searchLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Buscando coincidencias...</span>}
          
          {!searchLoading && searchResults.length > 0 && (
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                   Resultado {searchIndex + 1} de {searchResults.length}
                </span>
                <button onClick={prevSearch} style={{ border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>↑</button>
                <button onClick={nextSearch} style={{ border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>↓</button>
             </div>
          )}
          {!searchLoading && searchIndex === -1 && searchText && searchResults.length === 0 && (
             <span style={{ fontSize: '0.9rem', color: '#ef4444', fontWeight: 'bold' }}>Sin resultados</span>
          )}
        </div>
      )}

      <div style={{ flex: 1, position: 'relative', overflow: 'auto', display: 'flex', justifyContent: 'center' }} className="pdf-viewer-container">
        {book.type === 'pdf' && (
          <div style={{ maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' }}>
            <Document
              file={streamUrl}
              onLoadSuccess={(pdf) => { setNumPages(pdf.numPages); setPdfRef(pdf); }}
              loading={<div style={{color:'white'}}>Cargando PDF...</div>}
              error={<div style={{color:'var(--text-primary)', padding: '2rem'}}>El documento no está disponible o la traducción sigue en progreso en el servidor...</div>}
            >
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                {/* Chapters / TOC Sidebar */}
                <div className="pdf-toc" style={{ 
                  width: '250px', 
                  maxHeight: '80vh', 
                  overflowY: 'auto', 
                  background: '#f1f5f9', 
                  border: '1px solid #cbd5e1', 
                  borderRadius: '6px',
                  padding: '1rem',
                  color: '#1e293b',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 'bold', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem', color: '#1e293b' }}>Índice</h3>
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#1e293b' }}>
                    <Outline onItemClick={({ pageNumber }) => setPageNumber(parseInt(pageNumber))} />
                  </div>
                </div>

                {/* Page view */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Page 
                    pageNumber={pageNumber} 
                    renderTextLayer={true} 
                    renderAnnotationLayer={false}
                    customTextRenderer={customTextRenderer}
                    width={Math.min(window.innerWidth * 0.7, 800)}
                  />
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                    <button 
                      disabled={pageNumber <= 1} 
                      onClick={() => setPageNumber(p => p - 1)}
                      style={{ padding: '0.5rem 1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Anterior
                    </button>
                    <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Página 
                      <input 
                        type="number" 
                        min={1} 
                        max={numPages || 1}
                        defaultValue={pageNumber}
                        key={pageNumber}
                        onBlur={(e) => {
                          let val = parseInt(e.target.value);
                          if (isNaN(val) || val < 1) val = 1;
                          if (numPages && val > numPages) val = numPages;
                          setPageNumber(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            let val = parseInt(e.target.value);
                            if (isNaN(val) || val < 1) val = 1;
                            if (numPages && val > numPages) val = numPages;
                            setPageNumber(val);
                            e.target.blur();
                          }
                        }}
                        style={{ width: '60px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                      /> 
                      de {numPages}
                    </span>
                    <button 
                      disabled={pageNumber >= numPages} 
                      onClick={() => setPageNumber(p => p + 1)}
                      style={{ padding: '0.5rem 1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </div>
            </Document>
          </div>
        )}

        {book.type === 'epub' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {/* The EPUB format natively supports TOC via react-reader menu */}
            <ReactReader
              url={streamUrl}
              title={book.title}
              location={location}
              locationChanged={(epubcfi) => setLocation(epubcfi)}
              epubInitOptions={{
                openAs: 'epub'
              }}
              getRendition={(rendition) => {
                setRenditionRef(rendition);
                // Wait for iframe to load, then inject copy prevention
                rendition.hooks.content.register((contents) => {
                  const iframeDoc = contents.document;
                  const preventDefault = (e) => e.preventDefault();
                  iframeDoc.addEventListener('contextmenu', preventDefault);
                  iframeDoc.addEventListener('copy', preventDefault);
                  iframeDoc.addEventListener('cut', preventDefault);
                });
                
                rendition.on('selected', (cfiRange) => {
                  const range = rendition.getRange(cfiRange);
                  let text = range.toString();
                  text = text.replace(/-\s*\n\s*/g, '').replace(/-\s+/g, '').trim();
                  if (!text) return;
                  
                  const rect = range.getBoundingClientRect();
                  handleTranslate(text, rect.left + (rect.width / 2), rect.bottom + 10);
                });
                
                // Clear popup on click inside iframe
                rendition.on('click', () => setTranslation(null));
              }}
              readerStyles={{
                container: { overflow: 'hidden', height: '100%' },
                readerArea: { backgroundColor: 'var(--bg-color)' },
                titleArea: { display: 'none' },
              }}
            />
          </div>
        )}
      </div>

      {/* Floating Translation Popup */}
      {translation && (
        <div id="translation-popup" style={{
          position: 'fixed',
          left: Math.max(10, Math.min(window.innerWidth - 300, translation.x - 150 + modalOffset.x)),
          top: Math.max(10, translation.y + modalOffset.y),
          width: '300px',
          background: 'var(--panel-bg)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--accent)',
          borderRadius: '8px',
          padding: '1rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          zIndex: 9999,
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div 
            onMouseDown={handleModalMouseDown}
            style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem',
              cursor: 'move', userSelect: 'none'
            }}
          >
            <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🌐 Traducción (Local)
            </span>
            <button 
              onMouseDown={e => e.stopPropagation()} 
              onClick={() => setTranslation(null)} 
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
            >&times;</button>
          </div>
          <div style={{ lineHeight: '1.5' }}>
            {translation.loading ? (
              <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Traduciendo modelo offline...</span>
            ) : (
              <span>{translation.text}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
