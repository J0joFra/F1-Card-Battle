import { Capacitor } from '@capacitor/core';

/*
 * Link diretto a una sfida tra amici: https://…/?sfida=CODICE.
 * Chi lo apre entra nella sfida. Dall'app Android si condivide il link del sito.
 */
const WEB_URL = 'https://j0jofra.github.io/F1-Card-Battle/';

// pagine pubbliche (servono anche per Google Play): informativa sulla privacy ed eliminazione dell'account
export const PRIVACY_URL = `${WEB_URL}privacy.html`;
export const DELETE_ACCOUNT_URL = `${WEB_URL}elimina-account.html`;
const PARAM = 'sfida';

const baseUrl = () =>
  Capacitor.isNativePlatform() || !/^https?:$/.test(window.location.protocol)
    ? WEB_URL
    : window.location.origin + window.location.pathname;

export const challengeLink = (code: string) => `${baseUrl()}?${PARAM}=${encodeURIComponent(code)}`;

const KEY = 'f1-card-battle:challenge-code';

// Codice della sfida arrivato con il link (se c'è): lo toglie dalla barra degli indirizzi e lo ricorda
// finché non si entra in partita (anche se nel frattempo la pagina si ricarica).
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

// Link d'invito (…/?invito=CODICE): il codice resta ricordato finché l'amico non crea il profilo.
const INVITE_PARAM = 'invito';
const INVITE_KEY = 'f1-card-battle:invite-code';
export const inviteLink = (code: string) => `${baseUrl()}?${INVITE_PARAM}=${encodeURIComponent(code)}`;

export function takeInviteCode(): string {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(INVITE_PARAM)) {
      const code = (url.searchParams.get(INVITE_PARAM) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      url.searchParams.delete(INVITE_PARAM);
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      if (code) localStorage.setItem(INVITE_KEY, code);
    }
    return localStorage.getItem(INVITE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearInviteCode() {
  try {
    localStorage.removeItem(INVITE_KEY);
  } catch {
    /* niente memoria */
  }
}

// Condivide testo e link: menu del telefono (app Android o browser), altrimenti copia negli appunti.
export async function shareLink(text: string, url: string): Promise<'shared' | 'copied' | 'none'> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Driver Clash', text, url });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text, url });
      return 'shared';
    }
  } catch {
    /* condivisione annullata: si copia e basta */
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'none';
  }
}

export function clearChallengeCode() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* niente memoria: va bene lo stesso */
  }
}
