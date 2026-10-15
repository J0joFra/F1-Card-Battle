import type { StatKey } from '../types';
import { CARD_BY_ID, STATS } from '../game/cards';
import {
  buyCard,
  buyPack,
  mergeProgress,
  normalizeProgress,
  openPack,
  spendJolly,
  starterProgress,
  type Progress,
} from '../game/collection';
import { claimMission, dailyChallenge, dailyPlayed, missionsAfterPack, missionsFor, startDaily } from '../game/daily';
import { deckProblems } from '../game/deckRules';
import { buildCpuDeck, cpuChooseStat, isAvailable, matchOutcome, newMatch, playRound, type Rng } from '../game/engine';
import { applyMatchEnd, loadMatch, storeMatch, toView, type MatchRewards, type MatchView, type StoredMatch } from '../game/match';

/*
 * Logica del server ("arbitro"). È separata dal database (vedi `Store`) così si può provare con i test.
 * Il telefono chiede un'azione, il server la controlla, la esegue con le regole del gioco e salva.
 * Il telefono non può più modificare da solo collezione, crediti o risultati.
 */

export type GameRequest =
  | { action: 'sync'; guest?: Partial<Progress> }
  | { action: 'set_deck'; deck: string[] }
  | { action: 'open_pack'; date?: string }
  | { action: 'buy_pack' }
  | { action: 'buy_card'; card: string }
  | { action: 'use_jolly'; card: string }
  | { action: 'claim_mission'; index: number; date: string }
  | { action: 'match_start'; deck: string[]; daily: boolean; date: string }
  | { action: 'match_play'; match: string; stat?: StatKey }
  | { action: 'match_quit'; match: string };

export interface PackResult {
  added: { card: string; duplicate: boolean; credits: number }[];
  unlockedCareers: string[];
  jolly: boolean;
}

export interface GameResponse {
  progress?: Progress;
  pack?: PackResult;
  unlockedCareers?: string[];
  credits?: number;
  match?: string;
  view?: MatchView;
  rewards?: MatchRewards;
}

export interface MatchRecord {
  state: StoredMatch;
  daily: boolean;
  date: string;
  finished: boolean;
}

export interface Store {
  getProfile(): Promise<{ progress: Partial<Progress>; version: number } | null>;
  // salva solo se nessun altro l'ha cambiato nel frattempo (version); prevVersion null = nuovo profilo
  putProfile(progress: Progress, prevVersion: number | null): Promise<boolean>;
  getMatch(id: string): Promise<MatchRecord | null>;
  createMatch(rec: MatchRecord): Promise<string>;
  // aggiorna solo se il round salvato è ancora `expectedRound` (evita doppi invii)
  updateMatch(id: string, rec: MatchRecord, expectedRound: number): Promise<boolean>;
}

export class GameError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export interface Ctx {
  today: string; // data del server (UTC), AAAA-MM-GG
  rng: Rng;
}

const MAX_RETRIES = 4;

// la data del telefono (fuso orario locale) è accettata se dista al massimo un giorno da quella del server
function checkDate(date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new GameError('bad_date');
  const diff = Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`));
  if (!(diff <= 86_400_000)) throw new GameError('bad_date');
}

const cardOrThrow = (id: unknown) => {
  const c = typeof id === 'string' ? CARD_BY_ID.get(id) : undefined;
  if (!c) throw new GameError('unknown_card');
  return c;
};

// Progressi portati dal telefono: accettati solo se plausibili (null altrimenti).
export function plausibleDevice(guest: Partial<Progress> | undefined): Progress | null {
  if (!guest || typeof guest !== 'object') return null;
  try {
    const p = normalizeProgress(guest);
    const ok =
      Object.keys(p.owned).length <= 150 &&
      Object.values(p.owned).every((n) => Number.isInteger(n) && n >= 1 && n <= 50) &&
      p.credits >= 0 && p.credits <= 1000 &&
      p.packs >= 0 && p.packs <= 20 &&
      p.jolly >= 0 && p.jolly <= 5 &&
      p.wins >= 0 && p.wins <= 500;
    return ok ? { ...p, missions: undefined } : null;
  } catch {
    return null;
  }
}

// primo accesso in assoluto: progressi del telefono (se plausibili) o mazzo iniziale
export const acceptGuest = (guest: Partial<Progress> | undefined, rng: Rng): Progress =>
  plausibleDevice(guest) ?? starterProgress(rng);

// Versione 0 = profilo salvato dalla vecchia app (prima che decidesse il server).
export const LEGACY_VERSION = 0;

// carica il profilo, applica la modifica e salva; se un'altra richiesta l'ha cambiato nel frattempo, riprova
async function withProfile<T extends GameResponse>(
  store: Store,
  ctx: Ctx,
  change: (p: Progress) => T & { progress: Progress },
): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const row = await store.getProfile();
    if (!row) throw new GameError('no_profile', 409);
    const current = normalizeProgress(row.progress);
    const res = change(current);
    if (await store.putProfile({ ...res.progress, updatedAt: Date.now() }, row.version)) return res;
  }
  throw new GameError('busy', 409);
}

export async function handle(req: GameRequest, store: Store, ctx: Ctx): Promise<GameResponse> {
  switch (req.action) {
    case 'sync': {
      const row = await store.getProfile();
      if (row && row.version === LEGACY_VERSION) {
        // passaggio dalla vecchia app: un'ultima volta si uniscono i dati del telefono a quelli online
        // (come faceva la vecchia app), poi decide solo il server
        const server = normalizeProgress(row.progress);
        const device = plausibleDevice(req.guest);
        const merged = device ? mergeProgress(server, device) : server;
        const progress = { ...merged, updatedAt: Date.now() };
        if (await store.putProfile(progress, row.version)) return { progress };
        return { progress: normalizeProgress((await store.getProfile())!.progress) };
      }
      if (row) return { progress: normalizeProgress(row.progress) };
      // primo accesso: si parte dai progressi del dispositivo (se plausibili) o dal mazzo iniziale
      const progress = { ...acceptGuest(req.guest, ctx.rng), updatedAt: Date.now() };
      if (!(await store.putProfile(progress, null))) return { progress: normalizeProgress((await store.getProfile())!.progress) };
      return { progress };
    }

    case 'set_deck':
      return withProfile(store, ctx, (p) => {
        const deck = (Array.isArray(req.deck) ? req.deck : []).filter((id) => typeof id === 'string' && p.owned[id]).slice(0, STATS.length);
        return { progress: { ...p, deck } };
      });

    case 'open_pack': {
      // giorno del telefono (per le missioni), se plausibile
      const day = req.date ?? ctx.today;
      checkDate(day, ctx.today);
      return withProfile(store, ctx, (p) => {
        const res = openPack(p, ctx.rng);
        if (!res) throw new GameError('no_packs');
        return {
          progress: { ...res.progress, missions: missionsAfterPack(missionsFor(res.progress.missions, res.progress.owned, day)) },
          pack: {
            added: res.added.map((a) => ({ card: a.card.id, duplicate: a.duplicate, credits: a.credits })),
            unlockedCareers: res.unlockedCareers.map((c) => c.id),
            jolly: !!res.jolly,
          },
        };
      });
    }

    case 'buy_pack':
      return withProfile(store, ctx, (p) => {
        const next = buyPack(p);
        if (!next) throw new GameError('not_enough_credits');
        return { progress: next };
      });

    case 'buy_card': {
      const card = cardOrThrow(req.card);
      return withProfile(store, ctx, (p) => {
        const res = buyCard(p, card);
        if (!res) throw new GameError('cannot_buy');
        return { progress: res.progress, unlockedCareers: res.unlockedCareers.map((c) => c.id) };
      });
    }

    case 'use_jolly': {
      const card = cardOrThrow(req.card);
      return withProfile(store, ctx, (p) => {
        const res = spendJolly(p, card);
        if (!res) throw new GameError('cannot_use_jolly');
        return { progress: res.progress, unlockedCareers: res.unlockedCareers.map((c) => c.id) };
      });
    }

    case 'claim_mission':
      checkDate(req.date, ctx.today);
      return withProfile(store, ctx, (p) => {
        const missions = missionsFor(p.missions, p.owned, req.date);
        const { missions: next, credits } = claimMission(missions, req.index);
        if (!credits) throw new GameError('mission_not_ready');
        return { progress: { ...p, missions: next, credits: p.credits + credits }, credits };
      });

    case 'match_start': {
      checkDate(req.date, ctx.today);
      let view: MatchView | null = null;
      let stored: StoredMatch | null = null;
      const res = await withProfile(store, ctx, (p) => {
        const ids = Array.isArray(req.deck) ? req.deck : [];
        if (new Set(ids).size !== ids.length) throw new GameError('bad_deck');
        const deck = ids.map(cardOrThrow);
        if (deck.some((c) => !p.owned[c.id]) || deckProblems(deck).length) throw new GameError('bad_deck');
        if (req.daily && dailyPlayed(p.daily, req.date)) throw new GameError('daily_played');
        const cpu = req.daily ? dailyChallenge(req.date).cpuDeck : buildCpuDeck(deck, ctx.rng);
        const state = newMatch(deck, cpu, ctx.rng);
        view = toView(state);
        stored = storeMatch(state); // la partita si crea dopo aver salvato il profilo
        return {
          progress: { ...p, deck: ids, daily: req.daily ? startDaily(p.daily, req.date) : p.daily },
        };
      });
      const matchId = await store.createMatch({ state: stored!, daily: !!req.daily, date: req.date, finished: false });
      return { ...res, match: matchId, view: view! };
    }

    case 'match_play': {
      const rec = await store.getMatch(req.match);
      if (!rec) throw new GameError('no_match', 404);
      if (rec.finished) throw new GameError('match_finished');
      const state = loadMatch(rec.state);
      if (matchOutcome(state)) throw new GameError('match_finished');
      let stat: StatKey;
      if (state.chooser === 'player') {
        if (!req.stat || !STATS.some((s) => s.key === req.stat) || !isAvailable(state, req.stat)) throw new GameError('bad_stat');
        stat = req.stat;
      } else stat = cpuChooseStat(state); // la CPU sceglie sul server: il telefono non vede le sue carte
      const next = playRound(state, stat);
      const finished = !!matchOutcome(next);
      const ok = await store.updateMatch(req.match, { ...rec, state: storeMatch(next), finished }, state.round);
      if (!ok) throw new GameError('busy', 409);
      if (!finished) return { view: toView(next) };
      let rewards: MatchRewards | undefined;
      const res = await withProfile(store, ctx, (p) => {
        const end = applyMatchEnd(p, next, rec.daily, rec.date);
        rewards = end.rewards;
        return { progress: end.progress };
      });
      return { ...res, view: toView(next), rewards };
    }

    case 'match_quit': {
      const rec = await store.getMatch(req.match);
      if (rec && !rec.finished) await store.updateMatch(req.match, { ...rec, finished: true }, rec.state.round);
      return {};
    }

    default:
      throw new GameError('unknown_action');
  }
}
