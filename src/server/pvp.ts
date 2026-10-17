import { STATS } from '../game/cards';
import { seriesDecks } from '../game/collection';
import {
  availableStats,
  bestStat,
  currentCards,
  isAvailable,
  matchOutcome,
  newMatch,
  playRound,
  TURN_SECONDS,
  type MatchState,
  type Side,
} from '../game/engine';
import { applyMatchEnd, flipMatch, loadMatch, storeMatch, toView } from '../game/match';
import { cardOrThrow, checkDate, GameError, myProgress, nowOf, withProfile, type Ctx } from './common';
import type { GameRequest, GameResponse, Outcome, PvpInfo, PvpRecord, Store } from './types';

/*
 * Sfida tra amici, al meglio di 3: la partita N si gioca con il mazzo salvato N di ognuno.
 * Vince la serie chi vince 2 partite. Il server fa da arbitro: i telefoni vedono solo la loro parte.
 */

// Tempo per scegliere la metrica, più un margine per guardare il risultato del round e per la rete.
// Scaduto, il server gioca la metrica migliore della card di chi doveva scegliere.
export const PVP_TURN_MS = (TURN_SECONDS + 15) * 1000;
export const NEXT_GAME_MS = 20_000; // pausa tra una partita e l'altra della serie
export const PVP_REVEAL_MS = 3000; // dopo una mossa, il risultato resta a schermo (uguale in MatchScreen)
export const PVP_CODE_TTL_MS = 15 * 60_000; // una sfida non accettata scade dopo 15 minuti
export const ONLINE_MS = 75_000; // "online" se visto negli ultimi 75 secondi
export const SERIES_GAMES = 3;
export const WINS_NEEDED = 2;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O e 1/I, facili da confondere
export const normalizeCode = (code: unknown) => (typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

const other = (s: Side): Side => (s === 'player' ? 'cpu' : 'player');
const flipOutcome = (o: Outcome): Outcome => (o === 'draw' ? 'draw' : other(o));
const sideOf = (rec: PvpRecord, uid: string): Side | null => (rec.host === uid ? 'player' : rec.guest === uid ? 'cpu' : null);
const asSide = (s: MatchState, side: Side) => (side === 'player' ? s : flipMatch(s));
const forSide = (o: Outcome, side: Side) => (side === 'player' ? o : flipOutcome(o));

// stato della serie dal punto di vista dell'host
export function seriesState(results: Outcome[]) {
  const host = results.filter((r) => r === 'player').length;
  const guest = results.filter((r) => r === 'cpu').length;
  const over = host >= WINS_NEEDED || guest >= WINS_NEEDED || results.length >= SERIES_GAMES;
  const outcome: Outcome = host > guest ? 'player' : guest > host ? 'cpu' : 'draw';
  return { over, outcome };
}

const finalOutcome = (rec: PvpRecord): Outcome =>
  rec.forfeit ? other(rec.forfeit) : seriesState(rec.results).outcome;

function decksOrThrow(p: Parameters<typeof seriesDecks>[0]) {
  const decks = seriesDecks(p);
  if (!decks) throw new GameError('decks_not_ready');
  return decks.map((d) => d.map((c) => c.id));
}

async function pvpResponse(store: Store, id: string, rec: PvpRecord, now: number, game?: number): Promise<GameResponse> {
  const side = sideOf(rec, store.me.id) ?? 'cpu';
  const current = Math.max(0, rec.games.length - 1);
  const finished = rec.status === 'finished';
  const opponentId = side === 'player' ? rec.guest : rec.host;
  const info: PvpInfo = {
    id,
    code: rec.code,
    status: rec.status,
    opponent: side === 'player' ? rec.guestName : rec.hostName,
    invited: !!rec.invitee,
    game: current,
    results: rec.results.map((r) => forSide(r, side)),
    seriesOutcome: finished ? forSide(finalOutcome(rec), side) : null,
    timeLeft: rec.status === 'playing' && rec.deadline ? Math.max(0, rec.deadline - now) : null,
    sinceMove: rec.movedAt ? Math.max(0, now - rec.movedAt) : null,
    opponentLeft: !!rec.forfeit && rec.forfeit !== side,
    opponentIsFriend: finished && opponentId ? await store.isFriend(opponentId) : false,
  };
  const res: GameResponse = { pvp: info };
  const g = typeof game === 'number' && game >= 0 && game < rec.games.length ? game : current;
  if (rec.games[g]) {
    const view = toView(asSide(loadMatch(rec.games[g]), side));
    // abbandono: la partita in corso finisce lì
    if (rec.forfeit && g === current && !view.outcome) view.outcome = forSide(finalOutcome(rec), side);
    res.view = view;
  }
  if (finished) {
    res.rewards = side === 'player' ? rec.rewards.host : rec.rewards.guest;
    res.progress = await myProgress(store);
  }
  return res;
}

// Applica una mossa (o un abbandono). Se la partita finisce si passa alla successiva della serie;
// se finisce la serie si assegnano i premi a entrambi.
async function advance(store: Store, ctx: Ctx, id: string, rec: PvpRecord, rev: number, next: MatchState | null, forfeit?: Side) {
  const now = nowOf(ctx);
  const games = [...rec.games];
  const results = [...rec.results];
  let gameOver: Outcome | null = null;
  if (next) {
    games[games.length - 1] = storeMatch(next);
    gameOver = matchOutcome(next);
    if (gameOver) results.push(gameOver);
  }
  const finished = !!forfeit || seriesState(results).over;
  // il tempo del turno successivo parte quando i due telefoni passano alla carta nuova
  let deadline: number | null = finished ? null : now + PVP_REVEAL_MS + PVP_TURN_MS;
  if (gameOver && !finished) {
    // partita successiva: inizia a scegliere chi ha perso l'ultima (in caso di pareggio, chi non aveva iniziato)
    const g = games.length;
    const firstBefore = rec.games[g - 1]?.history[0]?.chooser ?? 'player';
    const chooser: Side = gameOver === 'draw' ? other(firstBefore) : other(gameOver);
    const m = newMatch(rec.hostDecks[g].map(cardOrThrow), rec.guestDecks![g].map(cardOrThrow), ctx.rng, chooser);
    games.push(storeMatch(m));
    deadline = now + PVP_REVEAL_MS + PVP_TURN_MS + NEXT_GAME_MS;
  }
  const saved: PvpRecord = {
    ...rec,
    games,
    results,
    forfeit: forfeit ?? rec.forfeit,
    status: finished ? 'finished' : 'playing',
    deadline,
    movedAt: next ? now : rec.movedAt,
  };
  if (!(await store.updatePvp(id, saved, rev))) throw new GameError('busy', 409);
  if (!finished) return saved;

  const outcome = finalOutcome(saved);
  const last = loadMatch(games[games.length - 1]);
  const rewards: PvpRecord['rewards'] = {};
  for (const side of ['player', 'cpu'] as const) {
    const uid = side === 'player' ? saved.host : saved.guest!;
    const date = (side === 'player' ? saved.hostDate : saved.guestDate) ?? ctx.today;
    await withProfile(
      store,
      ctx,
      (p) => {
        const end = applyMatchEnd(p, asSide(last, side), date, { friend: true, outcome: forSide(outcome, side) });
        rewards[side === 'player' ? 'host' : 'guest'] = end.rewards;
        return { progress: end.progress };
      },
      uid,
    );
  }
  const done = { ...saved, rewards };
  await store.updatePvp(id, done, rev + 1);
  return done;
}

async function loadPvp(store: Store, id: unknown) {
  const got = typeof id === 'string' ? await store.getPvp(id) : null;
  if (!got || !sideOf(got.rec, store.me.id)) throw new GameError('no_match', 404);
  return got;
}

// l'avversario entra (con il codice o accettando l'invito): si parte con la prima partita
async function startSeries(store: Store, ctx: Ctx, id: string, rec: PvpRecord, rev: number, date: string) {
  const now = nowOf(ctx);
  const guestDecks = decksOrThrow(await myProgress(store));
  const first = newMatch(rec.hostDecks[0].map(cardOrThrow), guestDecks[0].map(cardOrThrow), ctx.rng, ctx.rng() < 0.5 ? 'player' : 'cpu');
  const next: PvpRecord = {
    ...rec,
    status: 'playing',
    guest: store.me.id,
    guestName: store.me.name,
    guestDecks,
    guestDate: date,
    games: [storeMatch(first)],
    results: [],
    deadline: now + PVP_TURN_MS,
  };
  if (!(await store.updatePvp(id, next, rev))) throw new GameError('bad_code', 404); // entrato prima un altro
  return pvpResponse(store, id, next, now);
}

// null = azione non della sfida tra amici
export async function handlePvp(req: GameRequest, store: Store, ctx: Ctx): Promise<GameResponse | null> {
  const now = nowOf(ctx);
  switch (req.action) {
    case 'pvp_create': {
      checkDate(req.date, ctx.today);
      const hostDecks = decksOrThrow(await myProgress(store));
      const invitee = typeof req.invite === 'string' ? req.invite : null;
      if (invitee && !(await store.isFriend(invitee))) throw new GameError('not_friend');
      for (let i = 0; i < 6; i++) {
        const code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(ctx.rng() * CODE_CHARS.length)]).join('');
        const rec: PvpRecord = {
          code,
          status: 'waiting',
          host: store.me.id,
          hostName: store.me.name,
          hostDecks,
          hostDate: req.date,
          invitee,
          guest: null,
          guestName: null,
          guestDecks: null,
          guestDate: null,
          games: [],
          results: [],
          deadline: null,
          forfeit: null,
          rewards: {},
          createdAt: now,
        };
        const id = await store.createPvp(rec);
        if (id) return pvpResponse(store, id, rec, now);
      }
      throw new GameError('busy', 409);
    }

    case 'pvp_join': {
      checkDate(req.date, ctx.today);
      const found = await store.findPvpByCode(normalizeCode(req.code));
      if (!found || now - found.rec.createdAt > PVP_CODE_TTL_MS) throw new GameError('bad_code', 404);
      if (found.rec.host === store.me.id) throw new GameError('own_match');
      return startSeries(store, ctx, found.id, found.rec, found.rev, req.date);
    }

    case 'pvp_accept': {
      checkDate(req.date, ctx.today);
      const got = typeof req.match === 'string' ? await store.getPvp(req.match) : null;
      if (!got || got.rec.invitee !== store.me.id || got.rec.status !== 'waiting' || now - got.rec.createdAt > PVP_CODE_TTL_MS)
        throw new GameError('bad_code', 404);
      return startSeries(store, ctx, req.match, got.rec, got.rev, req.date);
    }

    case 'pvp_decline': {
      const got = typeof req.match === 'string' ? await store.getPvp(req.match) : null;
      if (got && got.rec.invitee === store.me.id && got.rec.status === 'waiting')
        await store.updatePvp(req.match, { ...got.rec, status: 'cancelled' }, got.rev);
      return {};
    }

    case 'pvp_state': {
      let { rec, rev } = await loadPvp(store, req.match);
      // tempo scaduto: il server sceglie la metrica migliore per chi doveva scegliere
      if (rec.status === 'playing' && rec.deadline !== null && now > rec.deadline) {
        const state = loadMatch(rec.games[rec.games.length - 1]);
        const { player, cpu } = currentCards(state);
        const next = playRound(state, bestStat(state.chooser === 'player' ? player : cpu, availableStats(state)));
        try {
          rec = await advance(store, ctx, req.match, rec, rev, next);
        } catch (e) {
          if (!(e instanceof GameError && e.code === 'busy')) throw e;
          rec = (await loadPvp(store, req.match)).rec; // l'ha già fatto un'altra richiesta
        }
      }
      return pvpResponse(store, req.match, rec, now, req.game);
    }

    case 'pvp_play': {
      const { rec, rev } = await loadPvp(store, req.match);
      if (rec.status !== 'playing') throw new GameError('match_finished');
      if (req.game !== rec.games.length - 1) throw new GameError('not_your_turn', 409);
      const side = sideOf(rec, store.me.id)!;
      const state = loadMatch(rec.games[req.game]);
      if (state.chooser !== side) throw new GameError('not_your_turn', 409);
      if (!req.stat || !STATS.some((s) => s.key === req.stat) || !isAvailable(state, req.stat)) throw new GameError('bad_stat');
      const next = await advance(store, ctx, req.match, rec, rev, playRound(state, req.stat));
      return pvpResponse(store, req.match, next, now, req.game);
    }

    case 'pvp_quit': {
      const { rec, rev } = await loadPvp(store, req.match);
      const side = sideOf(rec, store.me.id)!;
      if (rec.status === 'waiting') {
        await store.updatePvp(req.match, { ...rec, status: 'cancelled' }, rev);
        return {};
      }
      if (rec.status !== 'playing') return pvpResponse(store, req.match, rec, now);
      // chi abbandona perde la serie
      const next = await advance(store, ctx, req.match, rec, rev, null, side);
      return pvpResponse(store, req.match, next, now);
    }

    case 'ping': {
      await store.touch(now);
      const invites = (await store.invitesForMe())
        .filter((i) => now - i.rec.createdAt <= PVP_CODE_TTL_MS)
        .map((i) => ({ id: i.id, from: i.rec.hostName }));
      return { invites };
    }

    case 'friends': {
      await store.touch(now);
      const list = await store.listFriends();
      const friends = list
        .map((f) => ({ id: f.id, name: f.name, online: f.lastSeen !== null && now - f.lastSeen < ONLINE_MS }))
        .sort((a, b) => Number(b.online) - Number(a.online) || (a.name ?? '').localeCompare(b.name ?? ''));
      return { friends };
    }

    case 'friend_add': {
      // si può aggiungere solo qualcuno con cui si è giocata una sfida
      const { rec } = await loadPvp(store, req.match);
      const opponent = rec.host === store.me.id ? rec.guest : rec.host;
      if (!opponent) throw new GameError('no_match', 404);
      await store.addFriend(opponent);
      return {};
    }

    case 'friend_remove': {
      // solo id validi (finiscono in un filtro del database)
      if (typeof req.friend === 'string' && /^[0-9a-z-]{1,64}$/i.test(req.friend)) await store.removeFriend(req.friend);
      return {};
    }

    default:
      return null;
  }
}
