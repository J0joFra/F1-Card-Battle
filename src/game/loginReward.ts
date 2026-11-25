import { BOOST_MAX, boostsOf, type Progress } from './collection';
import type { JollyKind } from './engine';

/*
 * Premio giornaliero (nel negozio): uno al giorno, sette giorni di fila con premi che crescono.
 * Dopo il settimo si ricomincia dal primo; se salti un giorno si riparte dal giorno 1.
 */

export interface LoginReward {
  credits?: number;
  packs?: number; // pacchetti Classici da aprire
  boost?: JollyKind; // jolly di gara (se ne hai già il massimo diventa BOOST_FULL_CREDITS crediti)
  jolly?: number; // Jolly carta
}

export const LOGIN_REWARDS: LoginReward[] = [
  { credits: 20 },
  { packs: 1 },
  { credits: 40 },
  { boost: 'drs' },
  { credits: 60 },
  { packs: 1 },
  { jolly: 1, credits: 100 },
];
export const BOOST_FULL_CREDITS = 30;

export interface LoginState {
  last: string; // giorno dell'ultimo premio ritirato (AAAA-MM-GG)
  day: number; // giorno della serie ritirato quel giorno (1-7)
}

const prevDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

function stateOf(p: Progress): LoginState | null {
  const s = p.login;
  if (!s || typeof s.last !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.last)) return null;
  const day = Math.floor(Number(s.day));
  return day >= 1 && day <= LOGIN_REWARDS.length ? { last: s.last, day } : null;
}

// Il premio di oggi: quale giorno della serie (1-7) e se l'hai già ritirato.
export function loginStatus(p: Progress, date: string) {
  const s = stateOf(p);
  if (s?.last === date) return { day: s.day, claimed: true };
  const goesOn = s && s.last === prevDay(date);
  return { day: goesOn ? (s.day % LOGIN_REWARDS.length) + 1 : 1, claimed: false };
}

// Ritira il premio di oggi (null se l'hai già ritirato).
export function claimLogin(p: Progress, date: string): { progress: Progress; day: number; reward: LoginReward } | null {
  const { day, claimed } = loginStatus(p, date);
  if (claimed) return null;
  const reward = LOGIN_REWARDS[day - 1];
  let next: Progress = { ...p, login: { last: date, day } };
  if (reward.credits) next.credits += reward.credits;
  if (reward.packs) next.packs += reward.packs;
  if (reward.jolly) next.jolly += reward.jolly;
  if (reward.boost) {
    if (boostsOf(next, reward.boost) >= BOOST_MAX) next.credits += BOOST_FULL_CREDITS;
    else next = { ...next, boosts: { ...next.boosts, [reward.boost]: boostsOf(next, reward.boost) + 1 } };
  }
  return { progress: next, day, reward };
}
