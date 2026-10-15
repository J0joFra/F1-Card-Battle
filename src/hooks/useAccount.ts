import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { translate } from '../lib/i18n';
import { callGame } from '../lib/api';
import { isNativeApp, nativeGoogleSignIn, nativeGoogleSignOut } from '../lib/nativeGoogle';
import { isUntouched, starterProgress, type Progress } from '../game/collection';

export type SyncStatus = 'offline' | 'loading' | 'saving' | 'saved' | 'error';

const RETRY_MS = 20_000;

export interface Account {
  session: Session | null;
  name: string | null;
  status: SyncStatus;
  // true con l'accesso fatto: collezione, crediti e partite li decide il server
  online: boolean;
  // da chiamare intorno a ogni richiesta al server, per lo stato "Salvataggio… / Salvato online"
  track: <T>(p: Promise<T>) => Promise<T>;
  resync: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Login con Google e collezione sul server.
 * - Con l'accesso fatto, la copia "vera" è quella sul server: ogni azione di gioco passa dalla
 *   Edge Function "game" e il telefono tiene solo una copia da mostrare.
 * - Al primo accesso in assoluto il server parte dalla collezione del dispositivo (se plausibile).
 */
export function useAccount(
  progress: Progress,
  replaceProgress: (p: Progress) => void,
  notify: (msg: string) => void,
): Account {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [attempt, setAttempt] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  // Allineamento con il server quando cambia l'utente (e nuovi tentativi se il server non risponde).
  useEffect(() => {
    if (!userId) {
      setStatus('offline');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    const local = progressRef.current;
    callGame({ action: 'sync', guest: isUntouched(local) ? undefined : local })
      .then((res) => {
        if (cancelled || !res.progress) return;
        replaceProgress(res.progress);
        setStatus('saved');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        if (attempt === 0) notify(translate('acc_readError'));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status !== 'error' || !userId) return;
    const t = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearTimeout(t);
  }, [status, userId]);

  const track = useCallback(<T,>(p: Promise<T>) => {
    setStatus('saving');
    return p.then(
      (v) => {
        setStatus('saved');
        return v;
      },
      (e) => {
        setStatus('error');
        throw e;
      },
    );
  }, []);

  const resync = useCallback(() => setAttempt((n) => n + 1), []);

  const signIn = useCallback(async () => {
    if (isNativeApp()) {
      // nell'app Android: selettore account di sistema, niente browser
      try {
        await nativeGoogleSignIn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/cancel/i.test(msg)) notify(translate('acc_signinFail', { msg }));
      }
      return;
    }
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) notify(translate('acc_signinFail', { msg: error.message }));
  }, [notify]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    if (isNativeApp()) await nativeGoogleSignOut();
    // il dispositivo torna "ospite": la collezione resta al sicuro sull'account
    replaceProgress(starterProgress());
    notify(translate('acc_signedOut'));
  }, [replaceProgress, notify]);

  const name =
    (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email ?? null;

  return { session, name, status, online: !!session, track, resync, signIn, signOut };
}
