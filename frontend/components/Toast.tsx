'use client';

import { useEffect } from 'react';

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, background: '#111827',
      color: 'white', padding: '10px 14px', borderRadius: 10, boxShadow: '0 10px 24px rgba(0,0,0,0.25)'
    }}>
      {message}
    </div>
  );
}
