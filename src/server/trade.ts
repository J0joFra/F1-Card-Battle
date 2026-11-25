import { CARD_BY_ID } from '../game/cards';
import { normalizeProgress } from '../game/collection';
import {
  applyTrade,
  TRADE_FRIEND_MS,
  TRADE_PENDING_MAX,
  TRADE_TTL_MS,
  tradeOptions,
  tradeProblem,
  tradesToday,
} from '../game/trade';
import type { Card, Rarity } from '../types';
import { cardOrThrow, checkDate, GameError, myProgress, nowOf, type Ctx } from './common';
import type { GameRequest, GameResponse, Store, TradeRecord, TradeView } from './types';

/*
 * Scambi tra amici (regole in game/trade.ts). Il server controlla tutto due volte: quando la proposta
 * nasce e quando l'amico la accetta; lo scambio vero salva i due profili insieme, o nessuno dei due.
 */

const ID = /^[0-9a-z-]{1,64}$/i;
const RARITY_ORDER: Record<Rarity, number> = { leggendaria: 7, platino: 6, oro: 5, pioniere: 4, classica: 3, argento: 2, bronzo: 1 };
const byValue = (a: Card, b: Card) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || b.ovr - a.ovr || a.id.localeCompare(b.id);
const MAX_RETRIES = 4;

function friendId(v: unknown) {
  if (typeof v !== 'string' || !ID.test(v)) throw new GameError('bad_friend');
  return v;
}

// amici da abbastanza tempo per scambiare? restituisce da quando si può
async function readyAt(store: Store, friend: string) {
  const since = await store.friendSince(friend);
  if (since === null) throw new GameError('not_friend', 403);
  return since + TRADE_FRIEND_MS;
}

async function profileOf(store: Store, uid: string) {
  const row = await store.getProfile(uid);
  if (!row) throw new GameError('no_profile', 409);
  return { progress: normalizeProgress(row.progress), version: row.version };
}

// proposte in attesa che ti riguardano, ancora valide e con un amico (nome dall'elenco amici)
async function myTrades(store: Store, now: number): Promise<TradeView[]> {
  const me = store.me.id;
  const pending = (await store.pendingTrades()).filter((t) => now - t.createdAt < TRADE_TTL_MS);
  if (!pending.length) return [];
  const names = new Map((await store.listFriends()).map((f) => [f.id, f.name]));
  return pending
    .filter((t) => names.has(t.from === me ? t.to : t.from))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => {
      const incoming = t.to === me;
      const friend = incoming ? t.from : t.to;
      // dal tuo punto di vista: give è quello che cedi, want quello che ricevi
      return {
        id: t.id,
        incoming,
        friend,
        friendName: names.get(friend) ?? null,
        give: incoming ? t.want : t.give,
        want: incoming ? t.give : t.want,
        expiresAt: t.createdAt + TRADE_TTL_MS,
      };
    });
}

async function loadTrade(store: Store, id: unknown, now: number): Promise<TradeRecord> {
  if (typeof id !== 'string' || !ID.test(id)) throw new GameError('no_trade', 404);
  const t = await store.getTrade(id);
  if (!t || t.status !== 'pending' || now - t.createdAt >= TRADE_TTL_MS) throw new GameError('no_trade', 404);
  return t;
}

export async function handleTrade(req: GameRequest, store: Store, ctx: Ctx): Promise<GameResponse | null> {
  const now = nowOf(ctx);
  const me = store.me.id;
  switch (req.action) {
    case 'trade_options': {
      checkDate(req.date, ctx.today);
      const friend = friendId(req.friend);
      const ready = await readyAt(store, friend);
      const [mine, theirs] = [await myProgress(store), (await profileOf(store, friend)).progress];
      const o = tradeOptions(mine, theirs);
      return {
        tradeOptions: {
          mine: o.mine.sort(byValue).map((c) => c.id),
          theirs: o.theirs.sort(byValue).map((c) => c.id),
          readyAt: ready,
          today: tradesToday(mine, req.date),
        },
        trades: await myTrades(store, now),
      };
    }

    case 'trade_propose': {
      checkDate(req.date, ctx.today);
      const friend = friendId(req.friend);
      if (friend === me) throw new GameError('bad_friend');
      if ((await readyAt(store, friend)) > now) throw new GameError('trade_too_soon');
      const give = cardOrThrow(req.give);
      const want = cardOrThrow(req.want);
      const open = (await store.pendingTrades()).filter((t) => t.from === me && now - t.createdAt < TRADE_TTL_MS);
      // la stessa proposta già aperta: non se ne crea un'altra
      if (!open.some((t) => t.to === friend && t.give === give.id && t.want === want.id)) {
        if (open.length >= TRADE_PENDING_MAX) throw new GameError('trade_pending_max');
        const problem = tradeProblem(await myProgress(store), (await profileOf(store, friend)).progress, give, want, req.date);
        if (problem) throw new GameError(problem);
        await store.createTrade({ from: me, to: friend, give: give.id, want: want.id });
      }
      return { trades: await myTrades(store, now) };
    }

    case 'trade_list':
      return { trades: await myTrades(store, now) };

    case 'trade_decline':
    case 'trade_cancel': {
      const t = await loadTrade(store, req.trade, now);
      const mineToClose = req.action === 'trade_decline' ? t.to === me : t.from === me;
      if (!mineToClose) throw new GameError('no_trade', 404);
      await store.closeTrade(t.id, req.action === 'trade_decline' ? 'declined' : 'cancelled');
      return { trades: await myTrades(store, now) };
    }

    case 'trade_accept': {
      checkDate(req.date, ctx.today);
      const t = await loadTrade(store, req.trade, now);
      if (t.to !== me) throw new GameError('no_trade', 404);
      if ((await readyAt(store, t.from)) > now) throw new GameError('trade_too_soon');
      const give = CARD_BY_ID.get(t.give);
      const want = CARD_BY_ID.get(t.want);
      if (!give || !want) {
        await store.closeTrade(t.id, 'cancelled');
        throw new GameError('trade_bad_card');
      }
      for (let i = 0; i < MAX_RETRIES; i++) {
        const from = await profileOf(store, t.from);
        const to = await profileOf(store, me);
        const problem = tradeProblem(from.progress, to.progress, give, want, req.date);
        if (problem) {
          // non più possibile (carta ceduta o già ottenuta in altro modo): la proposta si chiude.
          // Il limite di oggi invece passa: la proposta resta per domani (finché non scade).
          if (problem !== 'trade_daily_limit') await store.closeTrade(t.id, 'cancelled');
          throw new GameError(problem);
        }
        const done = applyTrade(from.progress, to.progress, give, want, req.date, now);
        const saved = await store.completeTrade(
          t.id,
          { uid: t.from, progress: done.from.progress, version: from.version },
          { uid: me, progress: done.to.progress, version: to.version },
        );
        if (saved)
          return {
            progress: done.to.progress,
            unlockedCareers: done.to.unlockedCareers.map((c) => c.id),
            trades: await myTrades(store, now),
          };
        // un profilo è cambiato nel frattempo (o la proposta non è più in attesa): si ricontrolla
        await loadTrade(store, t.id, now);
      }
      throw new GameError('busy', 409);
    }

    default:
      return null;
  }
}
