import React, { useState, useRef, useEffect } from 'react';

export default function HelpTooltip({ text }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top - 10, // Small gap
        left: rect.left + rect.width / 2
      });
    }
  }, [visible]);

  return (
    <div 
      ref={triggerRef}
      style={{ position: 'relative', display: 'inline-block', marginLeft: '8px', cursor: 'help' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <div style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.2)',
        color: 'white',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        border: '1px solid rgba(255,255,255,0.3)'
      }}>
        ?
      </div>
      
      {visible && (
        <div style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          transform: 'translate(-50%, -100%)',
          width: '320px',
          padding: '1.2rem',
          backgroundColor: '#1e293b',
          color: 'white',
          borderRadius: '12px',
          fontSize: '0.85rem',
          lineHeight: '1.5',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255,255,255,0.2)',
          zIndex: 9999, // Float over everything
          whiteSpace: 'pre-wrap',
          pointerEvents: 'none'
        }}>
          {text}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            marginLeft: '-6px',
            borderWidth: '6px',
            borderStyle: 'solid',
            borderColor: '#1e293b transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  );
}
