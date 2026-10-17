import { Capacitor } from '@capacitor/core';

/*
 * Link diretto a una sfida tra amici: https://…/?sfida=CODICE.
 * Chi lo apre entra nella sfida (dopo l'accesso con Google). Dall'app Android si condivide il link del sito.
 */
const WEB_URL = 'https://j0jofra.github.io/F1-Card-Battle/';
const PARAM = 'sfida';

const baseUrl = () =>
  Capacitor.isNativePlatform() || !/^https?:$/.test(window.location.protocol)
    ? WEB_URL
    : window.location.origin + window.location.pathname;

export const challengeLink = (code: string) => `${baseUrl()}?${PARAM}=${encodeURIComponent(code)}`;

const KEY = 'f1-card-battle:challenge-code';

// Codice della sfida arrivato con il link (se c'è): lo toglie dalla barra degli indirizzi e lo ricorda
// finché non si entra in partita (l'accesso con Google ricarica la pagina senza il link).
export function takeChallengeCode(): string | null {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(PARAM)) {
      const code = (url.searchParams.get(PARAM) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      url.searchParams.delete(PARAM);
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      if (code) sessionStorage.setItem(KEY, code);
    }
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearChallengeCode() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* niente memoria: va bene lo stesso */
  }
}
