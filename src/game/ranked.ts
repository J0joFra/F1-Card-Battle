import type { Progress } from './collection';
import type { MatchOutcome, Rng, Side } from './engine';
import type { Card } from '../types';

/*
 * Gara classificata (stile Clash Royale): sfide online contro altri giocatori con punti simili.
 * I punti campionato decidono il campionato: dal Karting alla Formula 1.
 * Si può retrocedere di campionato, ma le coppe non scendono mai sotto zero.
 */

// il Karting è diviso nelle sue categorie: OK-Junior, OK, KZ
export const LEAGUES = [
  { id: 'okj', min: 0 },
  { id: 'ok', min: 100 },
  { id: 'kz', min: 200 },
  { id: 'f4', min: 300 },
  { id: 'fr', min: 700 },
  { id: 'f3', min: 1200 },
  { id: 'f2', min: 1800 },
  { id: 'f1', min: 2600 },
] as const;
export type LeagueId = (typeof LEAGUES)[number]['id'];

export const RANKED_POINTS = { player: 10, draw: 2, cpu: -7 } as const;

// Oro ammesse nel mazzo in ogni campionato (Platino e Leggendaria restano limitate come sempre):
// più si sale, più i mazzi sono fatti di Oro; in Formula 1 nessun limite (7 su 7).
export const LEAGUE_MAX_ORO = [2, 2, 2, 3, 4, 5, 6, 7];

// premio della prima promozione in ogni campionato: pacchetti base da aprire e crediti
export const PROMOTION_REWARD: { packs: number; credits: number }[] = [
  { packs: 0, credits: 0 },
  { packs: 0, credits: 50 },
  { packs: 1, credits: 50 },
  { packs: 1, credits: 100 },
  { packs: 2, credits: 150 },
  { packs: 2, credits: 250 },
  { packs: 3, credits: 350 },
  { packs: 5, credits: 500 },
];

// Inviti: chi porta un amico (che crea l'account con il suo codice) riceve 2 pacchetti base, per al massimo 10 amici.
export const REFERRAL_PACKS = 2;
export const MAX_REFERRALS = 10;

export interface RankedState {
  points: number;
  best: number; // campionato più alto raggiunto (per dare il premio di promozione una volta sola)
}

export const rankedOf = (p: Progress): RankedState => ({ points: p.ranked?.points ?? 0, best: p.ranked?.best ?? 0 });

export function leagueOf(points: number): number {
  let i = 0;
  while (i + 1 < LEAGUES.length && points >= LEAGUES[i + 1].min) i++;
  return i;
}

// avanzamento nel campionato (0-1) e punti per il prossimo (null in F1)
export function leagueProgress(points: number) {
  const i = leagueOf(points);
  const next = LEAGUES[i + 1];
  if (!next) return { league: i, ratio: 1, toNext: null };
  const from = LEAGUES[i].min;
  return { league: i, ratio: (points - from) / (next.min - from), toNext: next.min - points };
}

export interface RankedResult {
  delta: number;
  points: number;
  league: number;
  promoted?: number; // nuovo campionato raggiunto per la prima volta
  packs?: number;
  credits?: number;
}

// Fine di una gara classificata: punti, eventuale promozione e premio (dal punto di vista del giocatore).
export function applyRanked(p: Progress, outcome: Exclude<MatchOutcome, null>): { progress: Progress; result: RankedResult } {
  const r = rankedOf(p);
  // si può retrocedere di campionato, ma le coppe non scendono mai sotto zero
  const points = Math.max(0, r.points + RANKED_POINTS[outcome]);
  const league = leagueOf(points);
  const result: RankedResult = { delta: points - r.points, points, league };
  let next: Progress = { ...p, ranked: { points, best: Math.max(r.best, league) } };
  if (league > r.best) {
    let packs = 0;
    let credits = 0;
    for (let i = r.best + 1; i <= league; i++) {
      packs += PROMOTION_REWARD[i].packs;
      credits += PROMOTION_REWARD[i].credits;
    }
    next = { ...next, packs: next.packs + packs, credits: next.credits + credits };
    Object.assign(result, { promoted: league, packs, credits });
  }
  return { progress: next, result };
}

// Chi guida il primo round: chi ha la carta più debole (overall più basso). A parità si confronta la seconda
// più debole, poi la terza…; mazzi uguali: chi ha meno coppe; ancora pari: a sorte.
// (player = host, cpu = ospite)
export function firstLeader(host: Card[], guest: Card[], hostPoints: number, guestPoints: number, rng: Rng): Side {
  const a = host.map((c) => c.ovr).sort((x, y) => x - y);
  const b = guest.map((c) => c.ovr).sort((x, y) => x - y);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? 'player' : 'cpu';
  if (hostPoints !== guestPoints) return hostPoints < guestPoints ? 'player' : 'cpu';
  return rng() < 0.5 ? 'player' : 'cpu';
}

// Coda: si cerca un avversario con punti vicini; più si aspetta, più la ricerca si allarga.
export const QUEUE_WINDOW = (waitedMs: number) => Math.min(1500, 100 + Math.floor(waitedMs / 1000) * 15);
export const QUEUE_FRESH_MS = 12_000; // in coda solo chi ha controllato da poco (app ancora aperta)
export const QUEUE_POLL_MS = 3000;
