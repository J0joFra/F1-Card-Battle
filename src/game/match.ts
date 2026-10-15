import type { Card, StatKey } from '../types';
import { CARD_BY_ID } from './cards';
import { DAILY_REWARD_CREDITS, finishDaily, missionDone, missionsAfterMatch, missionsFor } from './daily';
import { cpuChooseStat, matchOutcome, playRound, type MatchOutcome, type MatchState, type Side } from './engine';
import { FRIEND_DRAW_CREDITS, FRIEND_WIN_CREDITS, recordMatch, type Progress } from './collection';

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
}

export interface MatchView {
  round: number;
  chooser: Side;
  usedStats: StatKey[];
  score: Record<Side, number>;
  history: RoundView[];
  current: string | null; // la tua card di questo round (quella della CPU resta coperta)
  outcome: MatchOutcome;
  opponentLeft?: boolean; // sfida tra amici: l'avversario ha abbandonato
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
    })),
    current: outcome ? null : (s.player[s.round]?.id ?? null),
    outcome,
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
    history: m.history.map((h) => ({
      stat: h.stat,
      chooser: h.chooser,
      playerCard: card(h.player),
      cpuCard: card(h.cpu),
      winner: h.winner,
    })),
  };
}

export interface MatchRewards {
  packEarned: boolean;
  dailyWon: boolean;
  missionsCompleted: number; // missioni completate da questa partita
  credits: number; // crediti vinti (sfida tra amici)
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
  const credits = opts.friend ? (outcome === 'player' ? FRIEND_WIN_CREDITS : outcome === 'draw' ? FRIEND_DRAW_CREDITS : 0) : 0;
  next = { ...next, credits: next.credits + credits };
  return {
    progress: next,
    rewards: { packEarned, dailyWon, missionsCompleted: after.list.filter(missionDone).length - before, credits },
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
    history: s.history.map((h) => ({
      stat: h.stat,
      chooser: other(h.chooser),
      playerCard: h.cpuCard,
      cpuCard: h.playerCard,
      winner: h.winner === 'tie' ? 'tie' : other(h.winner),
    })),
  };
}

/*
 * Chi "arbitra" la partita: il telefono (ospite) o il server (con l'accesso fatto).
 * La schermata della partita parla solo con questo, quindi funziona uguale nei due casi.
 */
export interface MatchDriver {
  start: MatchView;
  // gioca il round: con la metrica scelta dal giocatore, o senza quando tocca alla CPU
  play(stat?: StatKey): Promise<MatchView>;
  quit(): void;
}

export function localDriver(initial: MatchState, onEnd: (final: MatchState) => void): MatchDriver {
  let state = initial;
  return {
    start: toView(state),
    async play(stat) {
      const chosen = state.chooser === 'cpu' ? cpuChooseStat(state) : stat;
      if (!chosen) throw new Error('metrica mancante');
      state = playRound(state, chosen);
      if (matchOutcome(state)) onEnd(state);
      return toView(state);
    },
    quit() {},
  };
}
