import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { translate } from '../lib/i18n';
import { ApiError, callGame } from '../lib/api';
import { isUntouched, type Progress } from '../game/collection';
import type { Avatar, PlayerProfile } from '../game/profile';

export type SyncStatus = 'offline' | 'loading' | 'saving' | 'saved' | 'error';

const RETRY_MS = 20_000;
// "Più tardi" sulla creazione del profilo: vale fino alla prossima apertura dell'app
const LATER_KEY = 'f1-card-battle:profile-later';

const read = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: Storage, key: string, value: string | null) => {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* ignora */
  }
};

export interface ProfileInput {
  nickname: string;
  avatar: Avatar;
  favorite: string | null;
}

export interface Account {
  session: Session | null;
  profile: PlayerProfile | null;
  name: string | null;
  status: SyncStatus;
  // true con il profilo creato: collezione, crediti e partite li decide il server
  online: boolean;
  // nessun profilo: va mostrata la creazione (a meno di "Più tardi")
  needsProfile: boolean;
  // account ripreso con il codice ma senza nickname e avatar: va completato
  incomplete: boolean;
  // da chiamare intorno a ogni richiesta al server, per lo stato "Salvataggio… / Salvato online"
  track: <T>(p: Promise<T>) => Promise<T>;
  resync: () => void;
  // crea il profilo (o riprende un account con il codice di recupero); restituisce il nuovo codice di recupero
  createProfile: (input: ProfileInput) => Promise<string | null>;
  recover: (code: string) => Promise<string | null>;
  updateProfile: (input: Partial<ProfileInput>) => Promise<void>;
  newRecoveryCode: () => Promise<string | null>;
  // elimina l'account sul server (carte, progressi, amici) ed esce
  deleteAccount: () => Promise<void>;
  later: () => void;
}

/**
 * Account senza Google: ogni telefono ha un account anonimo di Supabase con un profilo di gioco
 * (nickname, avatar, pilota preferito). La copia "vera" della collezione è sul server.
 * Per riavere l'account su un altro telefono c'è il codice di recupero.
 * Le carte del vecchio accesso con Google si riprendono con un codice di recupero creato apposta.
 */
export function useAccount(
  progress: Progress,
  replaceProgress: (p: Progress) => void,
  notify: (msg: string) => void,
): Account {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false); // sessione letta
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [missing, setMissing] = useState(false); // il server dice che il profilo non c'è
  const [incomplete, setIncomplete] = useState(false); // account ripreso con il codice: mancano nickname e avatar
  const [later, setLater] = useState(() => read(sessionStorage, LATER_KEY) === '1');
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [attempt, setAttempt] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  const google = !!session && !session.user.is_anonymous;

  // Vecchio accesso con Google: non si usa più, si esce (le carte si riprendono con il codice di recupero).
  useEffect(() => {
    if (google) void supabase.auth.signOut();
  }, [google]);

  // Allineamento con il server (e nuovi tentativi se il server non risponde).
  useEffect(() => {
    setProfile(null);
    setMissing(false);
    setIncomplete(false);
    if (!userId || google) {
      setStatus('offline');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    callGame({ action: 'sync' })
      .then((res) => {
        if (cancelled) return;
        if (!res.progress) {
          setMissing(true);
          setStatus('offline');
          return;
        }
        replaceProgress(res.progress);
        setProfile(res.profile ?? null);
        setIncomplete(!res.profile);
        setStatus('saved');
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus('error');
        if (attempt === 0 && !(e instanceof ApiError && e.code === 'account_moved')) notify(translate('acc_readError'));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, google, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status !== 'error' || !userId || google) return;
    const t = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearTimeout(t);
  }, [status, userId, google]);

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

  // account anonimo (uno per telefono): si crea solo quando serve
  const ensureSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session && data.session.user.is_anonymous) return;
    if (data.session) await supabase.auth.signOut();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new ApiError(/anonymous/i.test(error.message) ? 'anon_disabled' : 'network');
  }, []);

  const finish = useCallback(
    (res: Awaited<ReturnType<typeof callGame>>) => {
      if (res.progress) replaceProgress(res.progress);
      if (res.profile) setProfile(res.profile);
      setMissing(!res.progress);
      setIncomplete(!!res.progress && !res.profile);
      setStatus(res.progress ? 'saved' : 'offline');
      return res.recoveryCode ?? null;
    },
    [replaceProgress],
  );

  const createProfile = useCallback(
    async (input: ProfileInput) => {
      await ensureSession();
      const local = progressRef.current;
      return finish(await callGame({ action: 'profile_create', ...input, guest: isUntouched(local) ? undefined : local }));
    },
    [ensureSession, finish],
  );

  const recover = useCallback(
    async (code: string) => {
      await ensureSession();
      return finish(await callGame({ action: 'profile_create', recover: code }));
    },
    [ensureSession, finish],
  );

  const updateProfile = useCallback(async (input: Partial<ProfileInput>) => {
    const res = await callGame({ action: 'profile_update', ...input });
    if (res.profile) {
      setProfile(res.profile);
      setIncomplete(false);
    }
  }, []);

  const newRecoveryCode = useCallback(async () => (await callGame({ action: 'recovery_new' })).recoveryCode ?? null, []);

  const deleteAccount = useCallback(async () => {
    await callGame({ action: 'account_delete', confirm: true });
    setProfile(null);
    setIncomplete(false);
    write(sessionStorage, LATER_KEY, null);
    setLater(false);
    // l'utente non esiste più sul server: basta dimenticare la sessione sul telefono
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, []);

  const skip = useCallback(() => {
    write(sessionStorage, LATER_KEY, '1');
    setLater(true);
  }, []);

  // con il vecchio accesso Google si aspetta di essere usciti
  const needsProfile = ready && !later && !profile && !incomplete && !google && (!session || missing);

  return {
    session,
    profile,
    name: profile?.nickname ?? null,
    status,
    online: (!!profile || incomplete) && !!session && !google,
    needsProfile,
    incomplete: incomplete && !later,
    track,
    resync,
    createProfile,
    recover,
    updateProfile,
    newRecoveryCode,
    deleteAccount,
    later: skip,
  };
}
