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
  jolly?: JollyKind; // jolly di gara giocato dal giocatore in questo round
  neutralized?: boolean; // Safety Car: il round perso è stato neutralizzato (conta come pareggio)
  // gare online: anche l'avversario può giocare un jolly
  cpuJolly?: JollyKind;
  cpuNeutralized?: boolean;
}

// Jolly di gara (modalità Strategica): uno a partita, si comprano al mercato.
// DRS: +10% alla tua metrica nel round (−10% per quelle dove vince il valore più basso).
// Safety Car: se perdi il round, viene neutralizzato e conta come pareggio.
export const JOLLY_KINDS = ['drs', 'sc'] as const;
export type JollyKind = (typeof JOLLY_KINDS)[number];
export const isJollyKind = (k: unknown): k is JollyKind => JOLLY_KINDS.includes(k as JollyKind);
export const DRS_BOOST = 0.1;
// Livello della CPU: quanto è forte il suo mazzo (quante card valuta per ogni posto), quanto spesso sbaglia
// la metrica e quanto "a caso" sceglie la carta quando risponde nella modalità Strategica.
export const CPU_LEVELS = ['easy', 'normal', 'hard'] as const;
export type CpuLevel = (typeof CPU_LEVELS)[number];
export const isCpuLevel = (l: unknown): l is CpuLevel => CPU_LEVELS.includes(l as CpuLevel);
export const CPU_LEVEL: Record<CpuLevel, { candidates: number; mistake: number; noise: number }> = {
  easy: { candidates: 1, mistake: 0.35, noise: 0.8 },
  normal: { candidates: 3, mistake: 0, noise: 0.3 },
  hard: { candidates: 10, mistake: 0, noise: 0 },
};
const levelOf = (s: { level?: CpuLevel }) => CPU_LEVEL[s.level ?? 'normal'];

// Modalità Strategica: carte in mano (si gioca una delle prime HAND_SIZE del mazzo, poi si pesca)
export const HAND_SIZE = 3;

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
  hand?: number; // modalità Strategica: carte in mano (assente = classica, la carta del round è fissa)
  jollyUsed?: boolean; // il giocatore ha già usato il jolly di gara in questa partita
  cpuJollyUsed?: boolean; // gare online: l'avversario ha già usato il suo
  // gare online in modalità Strategica: mosse già scelte in questo round, segrete finché non hanno scelto entrambi
  pending?: Partial<Record<Side, HandMove>>;
  level?: CpuLevel; // livello della CPU (assente = normale)
}

// Contro la CPU il primo round lo sceglie sempre il giocatore.
export function newMatch(
  playerDeck: Card[],
  cpuDeck: Card[],
  rng: Rng = Math.random,
  firstChooser: Side = 'player',
  hand?: number,
  level?: CpuLevel,
): MatchState {
  return {
    player: shuffle(playerDeck, rng),
    cpu: shuffle(cpuDeck, rng),
    round: 0,
    chooser: firstChooser,
    usedStats: [],
    score: { player: 0, cpu: 0 },
    history: [],
    ...(hand ? { hand } : {}),
    ...(level && level !== 'normal' ? { level } : {}),
  };
}

export const currentCards = (s: MatchState) => ({ player: s.player[s.round], cpu: s.cpu[s.round] });

export const isAvailable = (s: MatchState, stat: StatKey) => !s.usedStats.includes(stat);

export const availableStats = (s: MatchState) => STATS.map((x) => x.key).filter((k) => isAvailable(s, k));

export function playRound(state: MatchState, stat: StatKey, jolly?: JollyKind, cpuJolly?: JollyKind): MatchState {
  if (matchOutcome(state)) throw new Error('Partita già finita');
  if (!isAvailable(state, stat)) throw new Error('Metrica già usata in questa partita');
  if (jolly && state.jollyUsed) throw new Error('Jolly già usato in questa partita');
  if (cpuJolly && state.cpuJollyUsed) throw new Error('Jolly già usato in questa partita');
  const { player: playerCard, cpu: cpuCard } = currentCards(state);
  const boost = (v: number, j?: JollyKind) => (j === 'drs' ? v * (STAT_BY_KEY[stat].lowerWins ? 1 - DRS_BOOST : 1 + DRS_BOOST) : v);
  const cmp = compareStat(stat, boost(playerCard.stats[stat], jolly), boost(cpuCard.stats[stat], cpuJolly));
  let winner: Side | 'tie' = cmp > 0 ? 'player' : cmp < 0 ? 'cpu' : 'tie';
  const neutralized = jolly === 'sc' && winner === 'cpu';
  const cpuNeutralized = cpuJolly === 'sc' && winner === 'player';
  if (neutralized || cpuNeutralized) winner = 'tie';
  return {
    ...state,
    round: state.round + 1,
    chooser: winner === 'tie' ? (state.chooser === 'player' ? 'cpu' : 'player') : winner, // pareggio: il turno passa all'altro
    usedStats: [...state.usedStats, stat],
    score: winner === 'tie' ? state.score : { ...state.score, [winner]: state.score[winner] + 1 },
    history: [
      ...state.history,
      {
        stat,
        chooser: state.chooser,
        playerCard,
        cpuCard,
        winner,
        ...(jolly ? { jolly } : {}),
        ...(neutralized ? { neutralized } : {}),
        ...(cpuJolly ? { cpuJolly } : {}),
        ...(cpuNeutralized ? { cpuNeutralized } : {}),
      },
    ],
    passed: false,
    pending: undefined,
    ...(jolly ? { jollyUsed: true } : {}),
    ...(cpuJolly ? { cpuJollyUsed: true } : {}),
  };
}

// ---- modalità Strategica: mano di carte ----

// Le carte in mano: le prossime del mazzo (dopo ogni round se ne pesca una nuova).
export const handOf = (s: MatchState, side: Side): Card[] => (s.hand ? s[side].slice(s.round, s.round + s.hand) : [s[side][s.round]]);

// Gioca la carta in posizione `index` della mano: diventa la carta di questo round (scambio nel mazzo).
export function pickCard(s: MatchState, side: Side, index: number): MatchState {
  const size = handOf(s, side).length;
  if (!Number.isInteger(index) || index < 0 || index >= size) throw new Error('Carta non in mano');
  if (index === 0) return s;
  const deck = [...s[side]];
  [deck[s.round], deck[s.round + index]] = [deck[s.round + index], deck[s.round]];
  return { ...s, [side]: deck };
}

// La CPU sceglie la sua carta. Se tocca a lei scegliere, prende la coppia carta-metrica più forte;
// se risponde, non conosce la metrica: gioca la carta più forte in media sulle metriche ancora libere
// (con un po' di caso, per non essere prevedibile). Non guarda mai la carta del giocatore.
export function cpuPickCard(s: MatchState, rng: Rng = Math.random): { state: MatchState; stat?: StatKey } {
  const hand = handOf(s, 'cpu');
  const free = availableStats(s);
  const lv = levelOf(s);
  if (s.chooser === 'cpu') {
    // livello Facile: a volte gioca una carta e una metrica a caso
    if (rng() < lv.mistake) {
      const i = Math.floor(rng() * hand.length);
      return { state: pickCard(s, 'cpu', i), stat: free[Math.floor(rng() * free.length)] };
    }
    let best = { i: 0, stat: free[0], p: -1 };
    hand.forEach((c, i) => {
      const stat = bestStat(c, free);
      const p = percentile(stat, c.stats[stat]);
      if (p > best.p) best = { i, stat, p };
    });
    return { state: pickCard(s, 'cpu', best.i), stat: best.stat };
  }
  const score = (c: Card) => free.reduce((sum, k) => sum + percentile(k, c.stats[k]), 0) / free.length;
  let bi = 0;
  let bv = -1;
  hand.forEach((c, i) => {
    const v = score(c) * (1 - lv.noise / 2 + lv.noise * rng());
    if (v > bv) [bi, bv] = [i, v];
  });
  return { state: pickCard(s, 'cpu', bi) };
}

export interface HandMove {
  stat?: StatKey; // la metrica, se tocca al giocatore sceglierla
  card: number; // posizione nella mano della carta giocata
  jolly?: JollyKind;
}

// Un round della modalità Strategica contro la CPU: carta del giocatore, carta (e magari metrica) della CPU, esito.
export function playHandRound(s: MatchState, move: HandMove, rng: Rng = Math.random): MatchState {
  if (!s.hand) throw new Error('Partita senza mano');
  let next = pickCard(s, 'player', move.card);
  const cpu = cpuPickCard(next, rng);
  next = cpu.state;
  const stat = next.chooser === 'cpu' ? cpu.stat! : move.stat;
  if (!stat) throw new Error('metrica mancante');
  return playRound(next, stat, move.jolly);
}

// ---- gare online in modalità Strategica: i due giocatori scelgono in segreto, poi si scopre ----

export const jollyUsedBy = (s: MatchState, side: Side) => !!(side === 'player' ? s.jollyUsed : s.cpuJollyUsed);

// Mossa di un giocatore (carta, metrica se guida lui, jolly): resta segreta finché non sceglie anche l'altro.
export function commitMove(s: MatchState, side: Side, move: HandMove): MatchState {
  if (!s.hand) throw new Error('Partita senza mano');
  if (matchOutcome(s)) throw new Error('Partita già finita');
  if (s.pending?.[side]) throw new Error('Mossa già scelta');
  if (!Number.isInteger(move.card) || move.card < 0 || move.card >= handOf(s, side).length) throw new Error('Carta non in mano');
  if (s.chooser === side && (!move.stat || !isAvailable(s, move.stat))) throw new Error('Metrica non valida');
  if (move.jolly && (!isJollyKind(move.jolly) || jollyUsedBy(s, side))) throw new Error('Jolly non disponibile');
  const clean: HandMove = { card: move.card, ...(s.chooser === side ? { stat: move.stat } : {}), ...(move.jolly ? { jolly: move.jolly } : {}) };
  return { ...s, pending: { ...s.pending, [side]: clean } };
}

// Tempo scaduto: chi non ha scelto gioca la prima carta della mano (e, se guida, la sua metrica migliore).
export function autoMove(s: MatchState, side: Side): HandMove {
  const card = handOf(s, side)[0];
  return { card: 0, ...(s.chooser === side ? { stat: bestStat(card, availableStats(s)) } : {}) };
}

// Hanno scelto entrambi: si giocano le due carte con la metrica di chi guida.
export function resolveCommitted(s: MatchState): MatchState | null {
  const p = s.pending?.player;
  const c = s.pending?.cpu;
  if (!p || !c) return null;
  let next = pickCard(s, 'player', p.card);
  next = pickCard(next, 'cpu', c.card);
  const stat = (s.chooser === 'player' ? p : c).stat!;
  return playRound(next, stat, p.jolly, c.jolly);
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
export function cpuChooseStat(state: MatchState, rng: Rng = Math.random, mistakeRate = levelOf(state).mistake): StatKey {
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
