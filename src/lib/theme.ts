import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'f1-card-battle:theme';

const read = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignora */
  }
  return 'system';
};

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;

// Tema chiaro/scuro: di default segue il telefono, si può forzare dalle impostazioni.
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const [dark, setDark] = useState(() => (pref === 'system' ? systemDark() : pref === 'dark'));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* ignora */
    }
    if (pref !== 'system') {
      setDark(pref === 'dark');
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0f13' : '#f4f5f8');
  }, [dark]);

  return { pref, setPref, dark };
}
