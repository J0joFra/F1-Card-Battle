// Edge Function "game" (Supabase, Deno): l'arbitro del gioco per chi ha fatto l'accesso.
// Questo file viene impacchettato con la logica di gioco in supabase/functions/game/index.js
// da `npm run build:server` (vedi scripts/build-edge.mjs).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GameError, handle, type GameRequest, type MatchRecord, type PvpRecord, type Store } from '../src/server/actions';
import type { Progress } from '../src/game/collection';

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

function storeFor(userId: string, displayName: string | null): Store {
  return {
    me: { id: userId, name: displayName },
    async getProfile(uid = userId) {
      const { data, error } = await admin.from('profiles').select('progress, version').eq('id', uid).maybeSingle();
      if (error) throw error;
      return data ? { progress: data.progress as Partial<Progress>, version: data.version as number } : null;
    },
    async putProfile(progress, prevVersion, uid = userId) {
      // il nome si aggiorna solo per chi fa la richiesta
      const name = uid === userId ? { display_name: displayName } : {};
      if (prevVersion === null) {
        const { error } = await admin.from('profiles').insert({ id: uid, progress, version: 1, ...name });
        if (error?.code === '23505') return false; // creato nel frattempo da un'altra richiesta
        if (error) throw error;
        return true;
      }
      const { data, error } = await admin
        .from('profiles')
        .update({ progress, version: prevVersion + 1, ...name })
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
    async createPvp(rec) {
      const { data, error } = await admin
        .from('pvp_matches')
        .insert({ code: rec.code, status: rec.status, host: rec.host, data: rec })
        .select('id')
        .single();
      if (error?.code === '23505') return null; // codice già in uso
      if (error) throw error;
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
      return (data?.length ?? 0) > 0;
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
    // nome mostrato all'avversario: il nome dell'account Google (o la parte prima della @)
    const name = (user.user_metadata?.full_name as string | undefined) ?? user.email?.split('@')[0] ?? null;
    const body = (await req.json()) as GameRequest;
    const res = await handle(body, storeFor(user.id, name), { today: utcToday(), rng: Math.random });
    return json(res);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.code }, e.status);
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});
