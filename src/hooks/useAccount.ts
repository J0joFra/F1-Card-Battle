import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isUntouched, mergeProgress, normalizeProgress, starterProgress, type Progress } from '../game/collection';

export type SyncStatus = 'offline' | 'loading' | 'saving' | 'saved' | 'error';

const LINKED_KEY = 'f1-card-battle:linked-user';
const SAVE_DELAY = 1500;

const readLinked = () => {
  try {
    return localStorage.getItem(LINKED_KEY);
  } catch {
    return null;
  }
};
const writeLinked = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LINKED_KEY, id);
    else localStorage.removeItem(LINKED_KEY);
  } catch {
    /* ignora */
  }
};

export interface Account {
  session: Session | null;
  name: string | null;
  status: SyncStatus;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Login con Google e salvataggio della progressione su Supabase.
 * - Al login: se l'account non ha ancora dati, ci copia la collezione del dispositivo; se li ha,
 *   tiene la copia più recente (stesso utente) oppure unisce le due collezioni (ospite → account).
 * - Poi salva ogni modifica sul cloud dopo un attimo di pausa.
 */
export function useAccount(
  progress: Progress,
  replaceProgress: (p: Progress) => void,
  notify: (msg: string) => void,
): Account {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const ready = useRef(false); // true dopo il primo allineamento con il cloud
  const lastSaved = useRef<number>(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const save = useCallback(async (id: string, p: Progress, s: Session | null) => {
    if (lastSaved.current === p.updatedAt && p.updatedAt !== 0) return;
    setStatus('saving');
    const name = (s?.user.user_metadata?.full_name as string | undefined) ?? null;
    const { error } = await supabase.from('profiles').upsert({ id, progress: p, display_name: name });
    if (error) {
      setStatus('error');
      return;
    }
    lastSaved.current = p.updatedAt;
    setStatus('saved');
  }, []);


  // Allineamento iniziale quando cambia l'utente.
  useEffect(() => {
    ready.current = false;
    if (!userId) {
      setStatus('offline');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    (async () => {
      const { data, error } = await supabase.from('profiles').select('progress, updated_at').eq('id', userId).maybeSingle();
      if (cancelled) return;
      if (error) {
        setStatus('error');
        notify('Non riesco a leggere i dati online: continuo a salvare sul dispositivo.');
        return;
      }
      const local = progress;
      let next = local;
      if (!data) {
        // primo accesso: la collezione del dispositivo diventa quella dell'account
        if (!isUntouched(local)) notify('☁️ La tua collezione ora è salvata sul tuo account.');
      } else {
        const cloud = normalizeProgress(data.progress as Partial<Progress>);
        if (readLinked() === userId) {
          next = cloud.updatedAt > local.updatedAt ? cloud : local;
        } else if (isUntouched(local)) {
          next = cloud;
        } else {
          next = mergeProgress(cloud, local);
          notify('☁️ Ho unito le card di questo dispositivo a quelle del tuo account.');
        }
      }
      writeLinked(userId);
      if (next !== local) replaceProgress(next);
      ready.current = true;
      await save(userId, next, session);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salvataggio automatico delle modifiche (con un piccolo ritardo per raggrupparle).
  useEffect(() => {
    if (!userId || !ready.current) return;
    const t = setTimeout(() => save(userId, progress, session), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [progress, userId, session, save]);

  const signIn = useCallback(async () => {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) notify(`Accesso non riuscito: ${error.message}`);
  }, [notify]);

  const signOut = useCallback(async () => {
    if (userId && ready.current) await save(userId, progress, session); // ultimo salvataggio
    await supabase.auth.signOut();
    writeLinked(null);
    // il dispositivo torna "ospite": la collezione resta al sicuro sull'account
    replaceProgress(starterProgress());
    notify('Sei uscito. La tua collezione è salvata sul tuo account.');
  }, [userId, progress, session, save, replaceProgress, notify]);

  const name =
    (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email ?? null;

  return { session, name, status, signIn, signOut };
}
