// Edge Function "game" (Supabase, Deno): l'arbitro del gioco per chi ha fatto l'accesso.
// Questo file viene impacchettato con la logica di gioco in supabase/functions/game/index.js
// da `npm run build:server` (vedi scripts/build-edge.mjs).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GameError, handle, type GameRequest, type MatchRecord, type PvpRecord, type Store } from '../src/server/actions';
import type { Progress } from '../src/game/collection';
import type { Avatar } from '../src/game/profile';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// client con i permessi del server: le tabelle sono chiuse ai telefoni, solo questa funzione le modifica
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// Avvisi istantanei (Supabase Realtime, broadcast): dopo ogni cambiamento di una sfida il server manda un segnale
// "aggiornato" ai telefoni interessati, che rileggono subito lo stato dal server. Nel segnale non c'è nessun dato
// di gioco: i canali si chiamano con l'id (casuale) della sfida o dell'utente. Se il segnale non arriva, i telefoni
// controllano comunque ogni pochi secondi.
async function signal(topics: string[]) {
  if (!topics.length) return;
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: topics.map((topic) => ({ topic, event: 'update', payload: {} })) }),
    });
  } catch {
    /* il segnale è solo un acceleratore */
  }
}
const pvpTopic = (id: string) => `pvp-${id}`;
const userTopic = (id: string) => `user-${id}`;

function storeFor(userId: string, displayName: string | null): Store {
  return {
    me: { id: userId, name: displayName },
    async getProfile(uid = userId) {
      const { data, error } = await admin.from('profiles').select('progress, version').eq('id', uid).maybeSingle();
      if (error) throw error;
      return data ? { progress: data.progress as Partial<Progress>, version: data.version as number } : null;
    },
    async putProfile(progress, prevVersion, uid = userId) {
      // il nome mostrato agli altri è il nickname del profilo: qui si salva solo la progressione
      if (prevVersion === null) {
        const { error } = await admin.from('profiles').insert({ id: uid, progress, version: 1 });
        if (error?.code === '23505') return false; // creato nel frattempo da un'altra richiesta
        if (error) throw error;
        return true;
      }
      const { data, error } = await admin
        .from('profiles')
        .update({ progress, version: prevVersion + 1 })
        .eq('id', uid)
        .eq('version', prevVersion)
        .select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async getMatch(id) {
      const { data, error } = await admin
        .from('matches')
        .select('state, daily, date, finished')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data as MatchRecord | null) ?? null;
    },
    async createMatch(rec) {
      const { data, error } = await admin
        .from('matches')
        .insert({ user_id: userId, state: rec.state, round: rec.state.round, daily: rec.daily, date: rec.date, finished: rec.finished })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    async updateMatch(id, rec, expectedRound) {
      const { data, error } = await admin
        .from('matches')
        .update({ state: rec.state, round: rec.state.round, finished: rec.finished })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('round', expectedRound)
        .select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async getPvp(id) {
      const { data, error } = await admin.from('pvp_matches').select('data, rev').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? { rec: data.data as PvpRecord, rev: data.rev as number } : null;
    },
    async findPvpByCode(code) {
      const { data, error } = await admin
        .from('pvp_matches')
        .select('id, data, rev')
        .eq('code', code)
        .eq('status', 'waiting')
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, rec: data.data as PvpRecord, rev: data.rev as number } : null;
    },
    async invitesForMe() {
      const { data, error } = await admin.from('pvp_matches').select('id, data').eq('invitee', userId).eq('status', 'waiting');
      if (error) throw error;
      return ((data ?? []) as { id: string; data: PvpRecord }[]).map((r) => ({ id: r.id, rec: r.data }));
    },
    async getAccount() {
      const { data, error } = await admin
        .from('profiles')
        .select('nickname, avatar, favorite_driver, moved_to')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        nickname: (data.nickname as string | null) ?? null,
        avatar: (data.avatar as Avatar | null) ?? null,
        favorite: (data.favorite_driver as string | null) ?? null,
        movedTo: (data.moved_to as string | null) ?? null,
      };
    },
    async nicknameTaken(nickname) {
      const { count, error } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('nickname_key', nickname.toLowerCase())
        .is('moved_to', null)
        .neq('id', userId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    async createProfile(row) {
      const { error } = await admin.from('profiles').insert({
        id: userId,
        progress: row.progress,
        version: 1,
        display_name: row.nickname,
        nickname: row.nickname,
        avatar: row.avatar,
        favorite_driver: row.favorite,
        recovery_hash: row.recoveryHash,
      });
      if (error?.code === '23505') return false; // profilo o nickname già presi nel frattempo
      if (error) throw error;
      return true;
    },
    async updateAccount(fields) {
      const update: Record<string, unknown> = {};
      if (fields.nickname !== undefined) Object.assign(update, { nickname: fields.nickname, display_name: fields.nickname });
      if (fields.avatar !== undefined) update.avatar = fields.avatar;
      if (fields.favorite !== undefined) update.favorite_driver = fields.favorite;
      if (fields.recoveryHash !== undefined) update.recovery_hash = fields.recoveryHash;
      if (!Object.keys(update).length) return;
      const { error } = await admin.from('profiles').update(update).eq('id', userId);
      if (error?.code === '23505') throw new GameError('nickname_taken', 409);
      if (error) throw error;
    },
    async findByRecovery(hash) {
      const { data, error } = await admin.from('profiles').select('id').eq('recovery_hash', hash).is('moved_to', null).maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
    async transferProfile(from, fields) {
      const { data, error } = await admin.rpc('transfer_profile', {
        from_id: from,
        to_id: userId,
        new_nickname: fields.nickname,
        new_avatar: fields.avatar,
        new_favorite: fields.favorite,
        new_recovery_hash: fields.recoveryHash,
      });
      if (error?.code === '23505') throw new GameError('nickname_taken', 409);
      if (error) throw error;
      return data === true;
    },
    async touch(now) {
      const { error } = await admin.from('profiles').update({ last_seen: new Date(now).toISOString() }).eq('id', userId);
      if (error) throw error;
    },
    async listFriends() {
      const { data: rows, error } = await admin.from('friends').select('friend_id').eq('user_id', userId);
      if (error) throw error;
      const ids = ((rows ?? []) as { friend_id: string }[]).map((r) => r.friend_id);
      if (!ids.length) return [];
      const { data: profiles, error: e2 } = await admin.from('profiles').select('id, display_name, avatar, last_seen').in('id', ids);
      if (e2) throw e2;
      type Row = { id: string; display_name: string | null; avatar: Avatar | null; last_seen: string | null };
      const byId = new Map(((profiles ?? []) as Row[]).map((p) => [p.id, p]));
      return ids.map((id: string) => {
        const p = byId.get(id);
        return { id, name: p?.display_name ?? null, avatar: p?.avatar ?? null, lastSeen: p?.last_seen ? Date.parse(p.last_seen) : null };
      });
    },
    async isFriend(other) {
      const { count, error } = await admin
        .from('friends')
        .select('friend_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('friend_id', other);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    async addFriend(other) {
      const { error } = await admin.from('friends').upsert(
        [
          { user_id: userId, friend_id: other },
          { user_id: other, friend_id: userId },
        ],
        { onConflict: 'user_id,friend_id', ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    async removeFriend(other) {
      const { error } = await admin
        .from('friends')
        .delete()
        .or(`and(user_id.eq.${userId},friend_id.eq.${other}),and(user_id.eq.${other},friend_id.eq.${userId})`);
      if (error) throw error;
    },
    async createPvp(rec) {
      const { data, error } = await admin
        .from('pvp_matches')
        .insert({ code: rec.code, status: rec.status, host: rec.host, invitee: rec.invitee, data: rec })
        .select('id')
        .single();
      if (error?.code === '23505') return null; // codice già in uso
      if (error) throw error;
      if (rec.invitee) await signal([userTopic(rec.invitee)]); // l'amico invitato vede subito l'invito
      return data.id as string;
    },
    async updatePvp(id, rec, rev) {
      const { data, error } = await admin
        .from('pvp_matches')
        .update({ status: rec.status, guest: rec.guest, data: rec, rev: rev + 1, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('rev', rev)
        .select('id');
      if (error) throw error;
      const ok = (data?.length ?? 0) > 0;
      // mossa, ingresso dell'avversario, abbandono…: tutti e due i telefoni si aggiornano subito
      if (ok) await signal([pvpTopic(id), ...(rec.invitee && rec.status !== 'playing' ? [userTopic(rec.invitee)] : [])]);
      return ok;
    },
  };
}

const utcToday = () => new Date().toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
    const user = auth.user;
    // nome mostrato all'avversario: il nickname del profilo
    const { data: me } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const name = (me?.display_name as string | null | undefined) ?? null;
    const body = (await req.json()) as GameRequest;
    const res = await handle(body, storeFor(user.id, name), { today: utcToday(), rng: Math.random });
    return json(res);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.code }, e.status);
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});
