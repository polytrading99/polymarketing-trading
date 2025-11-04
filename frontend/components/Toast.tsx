'use client';

import { useEffect } from 'react';

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return <div className="toast">{message}</div>;
}
