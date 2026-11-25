import { CARD_BY_ID } from './cards';
import { addCards, type Progress } from './collection';
import type { Card } from '../types';

/*
 * Scambi tra amici: una carta doppia per una carta doppia dell'amico, della stessa rarità.
 * - si dà solo un doppione (ne resta sempre almeno una copia) e la stessa carta si cede al massimo 2 volte;
 * - si riceve solo una carta che non si ha (lo scambio serve a completare la collezione);
 * - al massimo 3 scambi al giorno a testa, e solo con amici aggiunti da almeno 2 giorni;
 * - la proposta resta valida 24 ore; il server ricontrolla tutto quando l'amico accetta.
 */

export const TRADE_MAX_GIVE = 2; // volte in cui si può cedere la stessa carta
export const TRADE_DAILY = 3; // scambi conclusi al giorno, per giocatore
export const TRADE_FRIEND_MS = 48 * 3_600_000; // amici da almeno 2 giorni
export const TRADE_TTL_MS = 24 * 3_600_000; // una proposta scade dopo 24 ore
export const TRADE_PENDING_MAX = 3; // proposte in attesa che puoi avere aperte

export interface TradeState {
  given?: Record<string, number>; // carta → volte in cui l'hai ceduta
  day?: string; // giorno dell'ultimo scambio concluso
  n?: number; // scambi conclusi quel giorno
}

const stateOf = (p: Progress): TradeState => (p.trade && typeof p.trade === 'object' ? p.trade : {});

// le carte Carriera si sbloccano completando le scuderie del pilota: non si scambiano
export const tradeableCard = (c: Card | undefined): c is Card => !!c && c.kind !== 'career';

export const timesGiven = (p: Progress, id: string) => Math.max(0, Math.floor(Number(stateOf(p).given?.[id]) || 0));

export const tradesToday = (p: Progress, date: string) => {
  const s = stateOf(p);
  return s.day === date ? Math.max(0, Math.floor(Number(s.n) || 0)) : 0;
};

// carte che puoi cedere: doppioni, non ancora ceduti 2 volte
export function giveable(p: Progress): Card[] {
  const out: Card[] = [];
  for (const [id, n] of Object.entries(p.owned)) {
    const c = CARD_BY_ID.get(id);
    if (n >= 2 && tradeableCard(c) && timesGiven(p, id) < TRADE_MAX_GIVE) out.push(c);
  }
  return out;
}

// cosa può entrare in uno scambio tra me e l'amico: i miei doppioni che lui non ha, i suoi che io non ho
export function tradeOptions(me: Progress, friend: Progress) {
  return {
    mine: giveable(me).filter((c) => !friend.owned[c.id]),
    theirs: giveable(friend).filter((c) => !me.owned[c.id]),
  };
}

// Motivo per cui lo scambio "from dà give, riceve want" non si può fare (null se va bene).
export function tradeProblem(from: Progress, to: Progress, give: Card, want: Card, date: string): string | null {
  if (!tradeableCard(give) || !tradeableCard(want) || give.id === want.id) return 'trade_bad_card';
  if (give.rarity !== want.rarity) return 'trade_rarity';
  if ((from.owned[give.id] ?? 0) < 2 || timesGiven(from, give.id) >= TRADE_MAX_GIVE) return 'trade_not_yours';
  if ((to.owned[want.id] ?? 0) < 2 || timesGiven(to, want.id) >= TRADE_MAX_GIVE) return 'trade_not_theirs';
  if (from.owned[want.id] || to.owned[give.id]) return 'trade_already_owned';
  if (tradesToday(from, date) >= TRADE_DAILY || tradesToday(to, date) >= TRADE_DAILY) return 'trade_daily_limit';
  return null;
}

// una parte dello scambio: cede `out`, riceve `inn` (con l'eventuale Carriera sbloccata), conta lo scambio
function side(p: Progress, out: Card, inn: Card, date: string, now: number) {
  const owned = { ...p.owned, [out.id]: p.owned[out.id] - 1 };
  const got = addCards({ ...p, owned }, [inn]);
  const s = stateOf(p);
  const trade: TradeState = {
    given: { ...s.given, [out.id]: timesGiven(p, out.id) + 1 },
    day: date,
    n: tradesToday(p, date) + 1,
  };
  return { progress: { ...got.progress, trade, updatedAt: now }, unlockedCareers: got.unlockedCareers };
}

// applica lo scambio ai due profili (da chiamare solo se tradeProblem è null)
export function applyTrade(from: Progress, to: Progress, give: Card, want: Card, date: string, now: number) {
  return { from: side(from, give, want, date, now), to: side(to, want, give, date, now) };
}
