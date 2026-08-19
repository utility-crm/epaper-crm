import { useState, useCallback } from 'react';

export interface ReaderSession {
  token: string;
  reader: { id: string; email: string; name?: string };
}

// Reader auth token is scoped per publication (slug) in localStorage.
export function useReaderSession(slug: string) {
  const key = `epaper:readerToken:${slug}`;
  const [session, setSession] = useState<ReaderSession | null>(() => {
    // Read defensively: this runs during render, so a corrupt entry (or a bare JWT
    // string written by an older client) would throw and take the whole reader app
    // down. Anything that isn't the shape signIn writes is dropped, not trusted.
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.token === 'string' && parsed.reader && typeof parsed.reader === 'object') {
        return parsed as ReaderSession;
      }
    } catch {}
    localStorage.removeItem(key);
    return null;
  });

  const signIn = useCallback((s: ReaderSession) => {
    localStorage.setItem(key, JSON.stringify(s));
    setSession(s);
  }, [key]);

  const signOut = useCallback(() => {
    localStorage.removeItem(key);
    setSession(null);
  }, [key]);

  return { session, signIn, signOut };
}

let razorpayPromise: Promise<boolean> | null = null;

export function loadRazorpay(): Promise<boolean> {
  if ((window as any).Razorpay) return Promise.resolve(true);
  if (razorpayPromise) return razorpayPromise;
  razorpayPromise = new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
  return razorpayPromise;
}
