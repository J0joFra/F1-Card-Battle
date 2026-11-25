import type { Card, StatKey } from '../types';
import type { RankedResult } from './ranked';
import { CARD_BY_ID } from './cards';
import { DAILY_REWARD_CREDITS, finishDaily, missionDone, missionsAfterMatch, missionsFor } from './daily';
import { cpuChooseStat, handOf, type CpuLevel, matchOutcome, passTurn, playHandRound, playRound, type HandMove, type JollyKind, type MatchOutcome, type MatchState, type Side } from './engine';
import { FIRST_WIN_CREDITS, FRIEND_DRAW_CREDITS, FRIEND_WIN_CREDITS, MATCH_CREDITS, bumpStats, recordMatch, type Progress, type Stats } from './collection';

/*
 * Pezzi condivisi tra il gioco sul telefono e il server:
 * - la "vista" della partita: quello che il giocatore può vedere (mai le carte future della CPU);
 * - il salvataggio compatto della partita (solo id delle card);
 * - i premi di fine partita, calcolati con le stesse regole in locale e sul server.
 */

export interface RoundView {
  stat: StatKey;
  chooser: Side;
  player: string; // id card
  cpu: string;
  winner: Side | 'tie';
  jolly?: JollyKind;
  neutralized?: boolean;
  cpuJolly?: JollyKind; // gare online: jolly dell'avversario
  cpuNeutralized?: boolean;
}

export interface MatchView {
  round: number;
  chooser: Side;
  usedStats: StatKey[];
  score: Record<Side, number>;
  history: RoundView[];
  current: string | null; // la tua card di questo round (quella della CPU resta coperta)
  outcome: MatchOutcome;
  passed?: boolean; // tempo scaduto in questo round: la scelta è passata all'avversario
  opponentLeft?: boolean; // sfida tra amici: l'avversario ha abbandonato
  sinceMove?: number; // sfida tra amici: ms passati dall'ultima mossa (per cambiare carta insieme)
  hand?: string[]; // modalità Strategica: le tue carte in mano (la prima è `current`)
  jollyUsed?: boolean; // jolly di gara già usato in questa partita
  // gare online in modalità Strategica: hai già scelto (in attesa dell'avversario) / l'avversario ha già scelto.
  // La sua mossa resta segreta finché il round non si scopre.
  committed?: boolean;
  oppCommitted?: boolean;
}

export function toView(s: MatchState): MatchView {
  const outcome = matchOutcome(s);
  return {
    round: s.round,
    chooser: s.chooser,
    usedStats: s.usedStats,
    score: s.score,
    history: s.history.map((h) => ({
      stat: h.stat,
      chooser: h.chooser,
      player: h.playerCard.id,
      cpu: h.cpuCard.id,
      winner: h.winner,
      ...(h.jolly ? { jolly: h.jolly } : {}),
      ...(h.neutralized ? { neutralized: true } : {}),
      ...(h.cpuJolly ? { cpuJolly: h.cpuJolly } : {}),
      ...(h.cpuNeutralized ? { cpuNeutralized: true } : {}),
    })),
    current: outcome ? null : (s.player[s.round]?.id ?? null),
    outcome,
    ...(s.passed ? { passed: true } : {}),
    ...(s.hand ? { hand: outcome ? [] : handOf(s, 'player').map((c) => c.id) } : {}),
    ...(s.jollyUsed ? { jollyUsed: true } : {}),
    ...(s.pending?.player ? { committed: true } : {}),
    ...(s.pending?.cpu ? { oppCommitted: true } : {}),
  };
}

// salvataggio compatto (database): solo gli id delle card
export interface StoredMatch {
  player: string[];
  cpu: string[];
  round: number;
  chooser: Side;
  usedStats: StatKey[];
  score: Record<Side, number>;
  history: RoundView[];
  passed?: boolean;
  hand?: number;
  jollyUsed?: boolean;
  cpuJollyUsed?: boolean;
  pending?: Partial<Record<Side, HandMove>>;
  level?: CpuLevel;
}

const card = (id: string): Card => {
  const c = CARD_BY_ID.get(id);
  if (!c) throw new Error(`card sconosciuta: ${id}`);
  return c;
};

export function storeMatch(s: MatchState): StoredMatch {
  const v = toView(s);
  return {
    player: s.player.map((c) => c.id),
    cpu: s.cpu.map((c) => c.id),
    round: s.round,
    chooser: s.chooser,
    usedStats: s.usedStats,
    score: s.score,
    history: v.history,
    ...(s.passed ? { passed: true } : {}),
    ...(s.hand ? { hand: s.hand } : {}),
    ...(s.jollyUsed ? { jollyUsed: true } : {}),
    ...(s.cpuJollyUsed ? { cpuJollyUsed: true } : {}),
    ...(s.pending && (s.pending.player || s.pending.cpu) ? { pending: s.pending } : {}),
    ...(s.level ? { level: s.level } : {}),
  };
}

export function loadMatch(m: StoredMatch): MatchState {
  return {
    player: m.player.map(card),
    cpu: m.cpu.map(card),
    round: m.round,
    chooser: m.chooser,
    usedStats: m.usedStats,
    score: m.score,
    passed: !!m.passed,
    ...(m.hand ? { hand: m.hand } : {}),
    ...(m.jollyUsed ? { jollyUsed: true } : {}),
    ...(m.cpuJollyUsed ? { cpuJollyUsed: true } : {}),
    ...(m.pending ? { pending: m.pending } : {}),
    ...(m.level ? { level: m.level } : {}),
    history: m.history.map((h) => ({
      stat: h.stat,
      chooser: h.chooser,
      playerCard: card(h.player),
      cpuCard: card(h.cpu),
      winner: h.winner,
      ...(h.jolly ? { jolly: h.jolly } : {}),
      ...(h.neutralized ? { neutralized: true } : {}),
      ...(h.cpuJolly ? { cpuJolly: h.cpuJolly } : {}),
      ...(h.cpuNeutralized ? { cpuNeutralized: true } : {}),
    })),
  };
}

// Crediti di una partita contro la CPU secondo il livello (vittoria, pareggio, sconfitta)
export const LEVEL_CREDITS: Record<CpuLevel, Record<'player' | 'draw' | 'cpu', number>> = {
  easy: { player: 4, draw: 3, cpu: 2 },
  normal: MATCH_CREDITS,
  hard: { player: 16, draw: 8, cpu: 4 },
};

export interface MatchRewards {
  packEarned: boolean;
  dailyWon: boolean;
  missionsCompleted: number; // missioni completate da questa partita
  credits: number; // crediti della partita (prima vittoria del giorno compresa, sfida del giorno esclusa)
  firstWin?: boolean; // premio "prima vittoria del giorno"
  ranked?: RankedResult; // gara classificata: punti, campionato, promozione
}

export interface MatchEndOptions {
  daily?: boolean; // sfida del giorno
  friend?: boolean; // sfida contro un amico
  outcome?: Exclude<MatchOutcome, null>; // esito già deciso (es. l'avversario ha abbandonato)
}

// Fine partita: statistiche, avanzamento verso il pacchetto, missioni e premi.
export function applyMatchEnd(
  p: Progress,
  state: MatchState,
  today: string,
  opts: MatchEndOptions = {},
): { progress: Progress; rewards: MatchRewards } {
  const outcome = opts.outcome ?? matchOutcome(state) ?? 'draw';
  let { progress: next, packEarned } = recordMatch(p, outcome);
  const missions = missionsFor(p.missions, p.owned, today);
  const before = missions.list.filter(missionDone).length;
  const after = missionsAfterMatch(missions, state, state.player);
  next = { ...next, missions: after };
  let dailyWon = false;
  if (opts.daily) {
    dailyWon = outcome === 'player';
    next = { ...next, daily: finishDaily(next.daily, dailyWon, today) };
    if (dailyWon) next = { ...next, packs: next.packs + 1, credits: next.credits + DAILY_REWARD_CREDITS };
  }
  const firstWin = outcome === 'player' && p.firstWin !== today;
  const credits =
    (opts.friend
      ? outcome === 'player'
        ? FRIEND_WIN_CREDITS
        : outcome === 'draw'
          ? FRIEND_DRAW_CREDITS
          : 0
      : opts.daily
        ? MATCH_CREDITS[outcome]
        : LEVEL_CREDITS[state.level ?? 'normal'][outcome]) + (firstWin ? FIRST_WIN_CREDITS : 0);
  next = { ...next, credits: next.credits + credits, ...(firstWin ? { firstWin: today } : {}) };
  next = bumpStats(next, matchStats(state, outcome === 'player', !!opts.friend));
  const streak = next.daily.streak;
  if (streak > (next.stats?.bestStreak ?? 0)) next = { ...next, stats: { ...next.stats, bestStreak: streak } };
  return {
    progress: next,
    rewards: { packEarned, dailyWon, missionsCompleted: after.list.filter(missionDone).length - before, credits, firstWin },
  };
}

// Contatori per gli obiettivi: vittorie speciali (senza perdere round, in rimonta, con sole card Bronzo)
export function matchStats(state: MatchState, won: boolean, friend: boolean): Partial<Stats> {
  if (!won) return {};
  let diff = 0;
  let worst = 0;
  for (const h of state.history) {
    if (h.winner !== 'tie') diff += h.winner === 'player' ? 1 : -1;
    worst = Math.min(worst, diff);
  }
  const full = state.history.length === state.player.length;
  return {
    ...(friend ? { pvpWins: 1 } : {}),
    ...(full && state.history.every((h) => h.winner !== 'cpu') ? { flawless: 1 } : {}),
    ...(worst <= -2 ? { comeback: 1 } : {}),
    ...(full && state.player.every((c) => c.rarity === 'bronzo') ? { bronze: 1 } : {}),
  };
}

// La stessa partita vista dall'altro giocatore ("player" diventa "cpu" e viceversa).
const other = (s: Side): Side => (s === 'player' ? 'cpu' : 'player');
export function flipMatch(s: MatchState): MatchState {
  return {
    player: s.cpu,
    cpu: s.player,
    round: s.round,
    chooser: other(s.chooser),
    usedStats: s.usedStats,
    score: { player: s.score.cpu, cpu: s.score.player },
    passed: s.passed,
    ...(s.hand ? { hand: s.hand } : {}),
    ...(s.cpuJollyUsed ? { jollyUsed: true } : {}),
    ...(s.jollyUsed ? { cpuJollyUsed: true } : {}),
    ...(s.pending ? { pending: { ...(s.pending.cpu ? { player: s.pending.cpu } : {}), ...(s.pending.player ? { cpu: s.pending.player } : {}) } } : {}),
    history: s.history.map((h) => ({
      stat: h.stat,
      chooser: other(h.chooser),
      playerCard: h.cpuCard,
      cpuCard: h.playerCard,
      winner: h.winner === 'tie' ? 'tie' : other(h.winner),
      ...(h.cpuJolly ? { jolly: h.cpuJolly } : {}),
      ...(h.cpuNeutralized ? { neutralized: true } : {}),
      ...(h.jolly ? { cpuJolly: h.jolly } : {}),
      ...(h.neutralized ? { cpuNeutralized: true } : {}),
    })),
  };
}

/*
 * Chi "arbitra" la partita: il telefono (ospite) o il server (con l'accesso fatto).
 * La schermata della partita parla solo con questo, quindi funziona uguale nei due casi.
 */
export interface MatchDriver {
  start: MatchView;
  // gioca il round: con la metrica scelta dal giocatore, o senza quando tocca alla CPU.
  // Nella modalità Strategica c'è anche la carta scelta dalla mano (e magari un jolly di gara).
  play(stat?: StatKey, move?: Omit<HandMove, 'stat'>): Promise<MatchView>;
  // tempo scaduto: la scelta passa all'avversario
  pass(): Promise<MatchView>;
  quit(): void;
}

export function localDriver(
  initial: MatchState,
  onEnd: (final: MatchState) => void,
  onJolly?: (kind: JollyKind) => boolean, // toglie il jolly dall'inventario (false = non ce l'hai)
): MatchDriver {
  let state = initial;
  return {
    start: toView(state),
    async play(stat, move) {
      if (state.hand) {
        if (move?.jolly && (state.jollyUsed || !onJolly?.(move.jolly))) throw new Error('jolly non disponibile');
        state = playHandRound(state, { stat, card: move?.card ?? 0, jolly: move?.jolly });
        if (matchOutcome(state)) onEnd(state);
        return toView(state);
      }
      const chosen = state.chooser === 'cpu' ? cpuChooseStat(state) : stat;
      if (!chosen) throw new Error('metrica mancante');
      state = playRound(state, chosen);
      if (matchOutcome(state)) onEnd(state);
      return toView(state);
    },
    async pass() {
      state = passTurn(state);
      return toView(state);
    },
    quit() {},
  };
}
