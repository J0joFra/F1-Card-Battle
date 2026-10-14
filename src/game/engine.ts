import type { Card, Rarity, StatKey } from '../types';
import { ALL_CARDS, STATS, STAT_BY_KEY, compareStat } from './cards';

export type Rng = () => number;
export type Side = 'player' | 'cpu';

export const DECK_SIZE = 10;
export const MAX_ROUNDS = 40;

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Mazzo CPU con la stessa composizione di rarità del mazzo del giocatore,
// così la sfida resta equilibrata qualunque sia la collezione.
export function buildCpuDeck(playerDeck: Card[], rng: Rng = Math.random, pool: Card[] = ALL_CARDS): Card[] {
  const playerIds = new Set(playerDeck.map((c) => c.id));
  const byRarity = new Map<Rarity, Card[]>();
  for (const c of shuffle(pool.filter((c) => !playerIds.has(c.id)), rng)) {
    const list = byRarity.get(c.rarity) ?? [];
    list.push(c);
    byRarity.set(c.rarity, list);
  }
  return shuffle(
    playerDeck.map((pc) => byRarity.get(pc.rarity)?.pop() ?? pc),
    rng,
  );
}

export interface MatchState {
  player: Card[]; // indice 0 = carta in cima
  cpu: Card[];
  pot: Card[]; // carte in palio dopo un pareggio
  turn: Side; // chi sceglie la statistica
  round: number;
}

export function newMatch(playerDeck: Card[], cpuDeck: Card[], rng: Rng = Math.random): MatchState {
  return {
    player: shuffle(playerDeck, rng),
    cpu: shuffle(cpuDeck, rng),
    pot: [],
    turn: rng() < 0.5 ? 'player' : 'cpu',
    round: 1,
  };
}

export interface RoundResult {
  stat: StatKey;
  playerCard: Card;
  cpuCard: Card;
  winner: Side | 'tie';
  won: number; // carte vinte (incluso il piatto)
}

export function playRound(state: MatchState, stat: StatKey): { state: MatchState; result: RoundResult } {
  const [playerCard, ...playerRest] = state.player;
  const [cpuCard, ...cpuRest] = state.cpu;
  const cmp = compareStat(stat, playerCard.stats[stat], cpuCard.stats[stat]);
  const winner: Side | 'tie' = cmp > 0 ? 'player' : cmp < 0 ? 'cpu' : 'tie';
  const table = [playerCard, cpuCard];

  let next: MatchState;
  if (winner === 'tie') {
    next = { ...state, player: playerRest, cpu: cpuRest, pot: [...state.pot, ...table], round: state.round + 1 };
  } else {
    // il vincitore mette in fondo la propria carta, poi quella avversaria e il piatto
    const ordered = winner === 'player' ? [playerCard, cpuCard] : [cpuCard, playerCard];
    const prize = [...ordered, ...state.pot];
    next = {
      player: winner === 'player' ? [...playerRest, ...prize] : playerRest,
      cpu: winner === 'cpu' ? [...cpuRest, ...prize] : cpuRest,
      pot: [],
      turn: winner,
      round: state.round + 1,
    };
  }
  return {
    state: next,
    result: { stat, playerCard, cpuCard, winner, won: winner === 'tie' ? 0 : 2 + state.pot.length },
  };
}

export type MatchOutcome = Side | 'draw' | null;

export function matchOutcome(state: MatchState): MatchOutcome {
  if (state.player.length === 0 && state.cpu.length === 0) return 'draw';
  if (state.cpu.length === 0) return 'player';
  if (state.player.length === 0) return 'cpu';
  if (state.round > MAX_ROUNDS) {
    if (state.player.length === state.cpu.length) return 'draw';
    return state.player.length > state.cpu.length ? 'player' : 'cpu';
  }
  return null;
}

// Percentile di ogni valore rispetto a tutte le card: serve alla CPU per capire
// quale statistica della propria carta è più forte.
const sortedByStat = Object.fromEntries(
  STATS.map((s) => [s.key, ALL_CARDS.map((c) => c.stats[s.key]).sort((a, b) => a - b)]),
) as Record<StatKey, number[]>;

export function percentile(stat: StatKey, value: number): number {
  const arr = sortedByStat[stat];
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  // media tra "strettamente minori" e "minori o uguali" per gestire i pari merito (es. tanti 0 mondiali)
  let hiEq = lo;
  while (hiEq < arr.length && arr[hiEq] === value) hiEq++;
  const p = (lo + hiEq) / 2 / arr.length;
  return STAT_BY_KEY[stat].lowerWins ? 1 - p : p;
}

// La CPU conosce solo la propria carta: di solito sceglie la statistica migliore,
// ogni tanto sbaglia per non essere imbattibile.
export function cpuChooseStat(card: Card, rng: Rng = Math.random, mistakeRate = 0.2): StatKey {
  if (rng() < mistakeRate) return STATS[Math.floor(rng() * STATS.length)].key;
  let best = STATS[0].key;
  let bestP = -1;
  for (const s of STATS) {
    const p = percentile(s.key, card.stats[s.key]);
    if (p > bestP) {
      bestP = p;
      best = s.key;
    }
  }
  return best;
}
