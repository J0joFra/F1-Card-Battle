import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from './supabase';

// ID client OAuth di tipo "Applicazione web" (lo stesso configurato in Supabase). Non è un segreto.
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '';

export const isNativeApp = () => Capacitor.isNativePlatform();

let initialized: Promise<void> | null = null;
const init = () =>
  (initialized ??= SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } }));

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Login con il selettore account di Android (Credential Manager), senza aprire il browser.
 * Il token di Google viene passato a Supabase: l'account è lo stesso del login dal sito.
 * Il nonce protegge dal riuso del token: a Google va l'hash, a Supabase il valore originale.
 */
export async function nativeGoogleSignIn() {
  if (!WEB_CLIENT_ID) throw new Error('Manca VITE_GOOGLE_WEB_CLIENT_ID');
  await init();
  const rawNonce = crypto.randomUUID();
  const res = await SocialLogin.login({
    provider: 'google',
    options: { nonce: await sha256Hex(rawNonce), style: 'bottom' },
  });
  const idToken = res.result.responseType === 'online' ? res.result.idToken : null;
  if (!idToken) throw new Error('Google non ha restituito il token');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
  if (error) throw error;
}

export async function nativeGoogleSignOut() {
  try {
    await init();
    await SocialLogin.logout({ provider: 'google' });
  } catch {
    // non bloccante: la sessione Supabase viene chiusa comunque
  }
}
