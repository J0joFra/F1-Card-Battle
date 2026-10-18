import { useEffect, useState } from 'react';

/*
 * Foto dei piloti da Wikimedia Commons (licenze libere), trovate da scripts/fetch-portraits.mjs.
 * Si mostrano nella card ingrandita con autore e licenza; l'elenco si carica solo quando serve.
 */
export interface Portrait {
  thumb: string; // miniatura 256 px su upload.wikimedia.org
  page: string; // pagina del file su Commons (autore, licenza, originale)
  author: string;
  license: string;
  licenseUrl: string | null;
}

let portraits: Record<string, Portrait> | null = null;
let loading: Promise<Record<string, Portrait>> | null = null;
const load = () =>
  (loading ??= import('../data/portraits.json').then((m) => (portraits = m.default as Record<string, Portrait>)));

export function usePortrait(driverId: string, enabled = true): Portrait | null {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!enabled || portraits) return;
    let alive = true;
    void load().then(() => alive && refresh((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? (portraits?.[driverId] ?? null) : null;
}
