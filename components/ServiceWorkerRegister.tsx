'use client';

import { useEffect } from 'react';

// Registers public/sw.js so mobile browsers offer "Install app" for the panel.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
