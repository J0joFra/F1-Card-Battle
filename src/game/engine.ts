import type { Card, Rarity, StatKey } from '../types';
import { PLAYABLE_CARDS, STATS, STAT_BY_KEY, compareStat } from './cards';

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

// Percentile di un valore rispetto a tutte le card (1 = il migliore), già girato per le metriche "↓".
const sortedByStat = Object.fromEntries(
  STATS.map((s) => [s.key, PLAYABLE_CARDS.map((c) => c.stats[s.key]).sort((a, b) => a - b)]),
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
  // media tra "strettamente minori" e "minori o uguali" per gestire i pari merito
  let hiEq = lo;
  while (hiEq < arr.length && arr[hiEq] === value) hiEq++;
  const p = (lo + hiEq) / 2 / arr.length;
  return STAT_BY_KEY[stat].lowerWins ? 1 - p : p;
}

// Quanto un mazzo copre le metriche: somma, per ogni metrica, del miglior percentile presente.
const coverage = (deck: Card[]) =>
  STATS.reduce((sum, s) => sum + Math.max(0, ...deck.map((c) => percentile(s.key, c.stats[s.key]))), 0);

// Mazzo CPU con la stessa composizione di rarità del mazzo del giocatore. Per ogni posto la CPU
// valuta qualche card a caso e tiene quella che rende il mazzo più forte su metriche diverse.
export function buildCpuDeck(
  playerDeck: Card[],
  rng: Rng = Math.random,
  pool: Card[] = PLAYABLE_CARDS,
  candidates = 3,
): Card[] {
  const playerIds = new Set(playerDeck.map((c) => c.id));
  const byRarity = new Map<Rarity, Card[]>();
  for (const c of shuffle(pool.filter((c) => !playerIds.has(c.id)), rng)) {
    const list = byRarity.get(c.rarity) ?? [];
    list.push(c);
    byRarity.set(c.rarity, list);
  }
  const deck: Card[] = [];
  for (const pc of playerDeck) {
    const list = byRarity.get(pc.rarity) ?? [];
    const options = list.slice(-candidates);
    if (!options.length) {
      deck.push(pc);
      continue;
    }
    const best = options.reduce((a, b) => (coverage([...deck, b]) > coverage([...deck, a]) ? b : a));
    list.splice(list.indexOf(best), 1);
    deck.push(best);
  }
  return deck;
}

export interface RoundResult {
  stat: StatKey;
  chooser: Side;
  playerCard: Card;
  cpuCard: Card;
  winner: Side | 'tie';
}

export interface MatchState {
  // mescolati all'inizio: la card del round i è la i-esima, quindi l'ordine è casuale
  player: Card[];
  cpu: Card[];
  round: number; // indice del round da giocare (0-based)
  chooser: Side; // chi sceglie la metrica: chi ha vinto il round precedente
  usedStats: StatKey[]; // ogni metrica si usa una sola volta per partita
  score: Record<Side, number>;
  history: RoundResult[];
  passed?: boolean; // in questo round chi doveva scegliere ha lasciato scadere il tempo: sceglie l'avversario
}

// Contro la CPU il primo round lo sceglie sempre il giocatore.
export function newMatch(
  playerDeck: Card[],
  cpuDeck: Card[],
  rng: Rng = Math.random,
  firstChooser: Side = 'player',
): MatchState {
  return {
    player: shuffle(playerDeck, rng),
    cpu: shuffle(cpuDeck, rng),
    round: 0,
    chooser: firstChooser,
    usedStats: [],
    score: { player: 0, cpu: 0 },
    history: [],
  };
}

export const currentCards = (s: MatchState) => ({ player: s.player[s.round], cpu: s.cpu[s.round] });

export const isAvailable = (s: MatchState, stat: StatKey) => !s.usedStats.includes(stat);

export const availableStats = (s: MatchState) => STATS.map((x) => x.key).filter((k) => isAvailable(s, k));

export function playRound(state: MatchState, stat: StatKey): MatchState {
  if (matchOutcome(state)) throw new Error('Partita già finita');
  if (!isAvailable(state, stat)) throw new Error('Metrica già usata in questa partita');
  const { player: playerCard, cpu: cpuCard } = currentCards(state);
  const cmp = compareStat(stat, playerCard.stats[stat], cpuCard.stats[stat]);
  const winner: Side | 'tie' = cmp > 0 ? 'player' : cmp < 0 ? 'cpu' : 'tie';
  return {
    ...state,
    round: state.round + 1,
    chooser: winner === 'tie' ? (state.chooser === 'player' ? 'cpu' : 'player') : winner, // pareggio: il turno passa all'altro
    usedStats: [...state.usedStats, stat],
    score: winner === 'tie' ? state.score : { ...state.score, [winner]: state.score[winner] + 1 },
    history: [...state.history, { stat, chooser: state.chooser, playerCard, cpuCard, winner }],
    passed: false,
  };
}

// Tempo scaduto: la scelta della metrica passa all'avversario (una volta sola per round).
export function passTurn(state: MatchState): MatchState {
  if (matchOutcome(state)) throw new Error('Partita già finita');
  if (state.passed) throw new Error('Turno già passato');
  return { ...state, chooser: state.chooser === 'player' ? 'cpu' : 'player', passed: true };
}

export type MatchOutcome = Side | 'draw' | null;

export function matchOutcome(state: MatchState): MatchOutcome {
  if (state.round < Math.min(state.player.length, state.cpu.length)) return null;
  const { player, cpu } = state.score;
  return player > cpu ? 'player' : cpu > player ? 'cpu' : 'draw';
}

// Forza di una metrica da 0 (debole) a 1 (fortissima), per la barretta colorata.
// Di solito è il percentile rispetto a tutte le card; per le posizioni (vince il numero più basso) si usa
// la scala "da appassionato", perché le tante card di fondo griglia farebbero sembrare buono anche un 12° posto:
// griglia media 3° o meglio = piena, 20° o peggio = vuota; miglior arrivo 1° = piena, 15° o peggio = vuota.
const POSITION_SCALE: Partial<Record<StatKey, [best: number, worst: number]>> = {
  grigliaMedia: [3, 20],
  migliorArrivo: [1, 15],
};
export function statStrength(key: StatKey, value: number) {
  const scale = POSITION_SCALE[key];
  if (!scale) return percentile(key, value);
  const [best, worst] = scale;
  return Math.min(1, Math.max(0, (worst - value) / (worst - best)));
}

// La CPU non vede la tua carta: sceglie, tra le metriche ancora libere, la migliore della propria.
// "Migliore" = il valore più alto rispetto a tutte le card del gioco (percentile), perché metriche
// diverse hanno scale diverse (es. 120 GP contro 8,5 punti a gara).
export function cpuChooseStat(state: MatchState, rng: Rng = Math.random, mistakeRate = 0): StatKey {
  const free = availableStats(state);
  if (rng() < mistakeRate) return free[Math.floor(rng() * free.length)];
  return bestStat(currentCards(state).cpu, free);
}

// La metrica più forte di una card (per percentile) tra quelle ancora libere.
// La usa la CPU, e anche chi lascia scadere il tempo: il gioco sceglie per lui.
export function bestStat(card: Card, free: StatKey[]): StatKey {
  return free.reduce((best, k) => (percentile(k, card.stats[k]) > percentile(best, card.stats[best]) ? k : best));
}

// Tempo per scegliere la metrica; allo scadere si gioca la migliore della propria card.
export const TURN_SECONDS = 30;
