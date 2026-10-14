import type { Card, Rarity, StatKey } from '../types';
import { ALL_CARDS, STATS, compareStat } from './cards';

export type Rng = () => number;
export type Side = 'player' | 'cpu';

// Una partita dura un round per ogni metrica, e il mazzo ha una card per round.
export const ROUNDS = STATS.length;
export const DECK_SIZE = ROUNDS;

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
  return playerDeck.map((pc) => byRarity.get(pc.rarity)?.pop() ?? pc);
}

export interface RoundResult {
  stat: StatKey;
  playerCard: Card;
  cpuCard: Card;
  winner: Side | 'tie';
}

export interface MatchState {
  // mescolati all'inizio: la card del round i è la i-esima, quindi l'ordine è casuale
  player: Card[];
  cpu: Card[];
  round: number; // indice del round da giocare (0-based)
  lastStat: StatKey | null; // non si può scegliere due volte di fila
  score: Record<Side, number>;
  history: RoundResult[];
}

export function newMatch(playerDeck: Card[], cpuDeck: Card[], rng: Rng = Math.random): MatchState {
  return {
    player: shuffle(playerDeck, rng),
    cpu: shuffle(cpuDeck, rng),
    round: 0,
    lastStat: null,
    score: { player: 0, cpu: 0 },
    history: [],
  };
}

export const currentCards = (s: MatchState) => ({ player: s.player[s.round], cpu: s.cpu[s.round] });

export const isAvailable = (s: MatchState, stat: StatKey) => stat !== s.lastStat;

export function playRound(state: MatchState, stat: StatKey): MatchState {
  if (matchOutcome(state)) throw new Error('Partita già finita');
  if (!isAvailable(state, stat)) throw new Error('Metrica usata nel round precedente');
  const { player: playerCard, cpu: cpuCard } = currentCards(state);
  const cmp = compareStat(stat, playerCard.stats[stat], cpuCard.stats[stat]);
  const winner: Side | 'tie' = cmp > 0 ? 'player' : cmp < 0 ? 'cpu' : 'tie';
  return {
    ...state,
    round: state.round + 1,
    lastStat: stat,
    score: winner === 'tie' ? state.score : { ...state.score, [winner]: state.score[winner] + 1 },
    history: [...state.history, { stat, playerCard, cpuCard, winner }],
  };
}

export type MatchOutcome = Side | 'draw' | null;

export function matchOutcome(state: MatchState): MatchOutcome {
  if (state.round < Math.min(state.player.length, state.cpu.length)) return null;
  const { player, cpu } = state.score;
  return player > cpu ? 'player' : cpu > player ? 'cpu' : 'draw';
}
