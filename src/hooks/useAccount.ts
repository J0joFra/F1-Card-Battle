import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { translate } from '../lib/i18n';
import { ApiError, callGame } from '../lib/api';
import { isUntouched, type Progress } from '../game/collection';
import { normalizeRecoveryCode, usernameOf, type Avatar, type PlayerProfile } from '../game/profile';

const formatCode = (raw: string) => {
  const c = normalizeRecoveryCode(raw);
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
};

export type SyncStatus = 'offline' | 'loading' | 'saving' | 'saved' | 'error';

const RETRY_MS = 20_000;
// "Più tardi" sulla creazione del profilo: vale fino alla prossima apertura dell'app
const LATER_KEY = 'f1-card-battle:profile-later';
// codice di recupero dell'account usato su questo telefono, per mostrarlo nelle impostazioni
const CODE_KEY = 'f1-card-battle:access-code';

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
  // id dell'account di gioco (può essere diverso dall'utente del telefono, dopo l'accesso)
  accountId: string | null;
  // username per accedere da un altro dispositivo (il nickname minuscolo, con _ al posto degli spazi)
  username: string | null;
  // codice di recupero (la password), se questo telefono lo conosce
  code: string | null;
  // crea il profilo; restituisce il codice di recupero (uguale per sempre)
  createProfile: (input: ProfileInput) => Promise<string | null>;
  // accesso a un account esistente con username e codice di recupero
  login: (username: string, code: string) => Promise<void>;
  // esce dall'account su questo telefono (l'account resta, si rientra con username e codice)
  logout: () => Promise<void>;
  updateProfile: (input: Partial<ProfileInput>) => Promise<void>;
  // elimina l'account sul server (carte, progressi, amici) ed esce
  deleteAccount: () => Promise<void>;
  later: () => void;
}

/**
 * Account senza Google: ogni telefono ha un utente anonimo di Supabase. Chi crea il profilo (nickname, avatar,
 * pilota preferito) riceve un codice di recupero, uguale per sempre: con username (il nickname) e codice si
 * accede allo stesso account da qualsiasi altro dispositivo. La copia "vera" della collezione è sul server.
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
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ account: string; code: string } | null>(() => {
    try {
      return JSON.parse(read(localStorage, CODE_KEY) ?? 'null');
    } catch {
      return null;
    }
  });
  const remember = useCallback((account: string | undefined, code: string | null) => {
    const value = account && code ? { account, code } : null;
    write(localStorage, CODE_KEY, value && JSON.stringify(value));
    setSaved(value);
  }, []);
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
        setAccountId(res.account ?? userId);
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
      if (res.account) setAccountId(res.account);
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
      const res = await callGame({ action: 'profile_create', ...input, guest: isUntouched(local) ? undefined : local });
      remember(res.account, res.recoveryCode ?? null);
      return finish(res);
    },
    [ensureSession, finish, remember],
  );

  const login = useCallback(
    async (username: string, code: string) => {
      await ensureSession();
      const res = await callGame({ action: 'login', username, code });
      remember(res.account, formatCode(code));
      finish(res);
    },
    [ensureSession, finish, remember],
  );

  const logout = useCallback(async () => {
    await callGame({ action: 'logout' }).catch(() => {});
    remember(undefined, null);
    setProfile(null);
    setIncomplete(false);
    setAccountId(null);
    write(sessionStorage, LATER_KEY, null);
    setLater(false);
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [remember]);

  const updateProfile = useCallback(async (input: Partial<ProfileInput>) => {
    const res = await callGame({ action: 'profile_update', ...input });
    if (res.profile) {
      setProfile(res.profile);
      setIncomplete(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    await callGame({ action: 'account_delete', confirm: true });
    remember(undefined, null);
    setProfile(null);
    setAccountId(null);
    setIncomplete(false);
    write(sessionStorage, LATER_KEY, null);
    setLater(false);
    // l'utente non esiste più sul server: basta dimenticare la sessione sul telefono
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [remember]);

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
    accountId,
    username: profile ? usernameOf(profile.nickname) : null,
    code: saved && saved.account === accountId ? saved.code : null,
    createProfile,
    login,
    logout,
    updateProfile,
    deleteAccount,
    later: skip,
  };
}
