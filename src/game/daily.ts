import type { Card, Rarity, StatKey } from '../types';
import { ALL_CARDS, CARD_BY_ID, CARDS_DATA, STATS } from './cards';
import { DECK_SIZE, shuffle, type MatchState, type Rng } from './engine';

/*
 * Sfida del giorno e missioni giornaliere.
 * Tutto è deciso dalla data: lo stesso giorno chiunque trova la stessa sfida
 * (stesso tema e stesso mazzo della CPU) e missioni dello stesso tipo.
 */

// ---------- data e numeri casuali "fissi" per la giornata ----------

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const yesterdayKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d - 1));
};

// generatore pseudo-casuale con seme (mulberry32): stessi numeri per la stessa stringa
export function seededRng(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(items: T[], rng: Rng) => items[Math.floor(rng() * items.length)];

// ---------- sfida del giorno ----------

export type DailyTheme = { kind: 'team'; team: string; name: string } | { kind: 'decade'; decade: number };

export interface DailyChallenge {
  date: string;
  theme: DailyTheme;
  cpuDeck: Card[];
}

export const DAILY_REWARD_CREDITS = 25;

// temi possibili: le scuderie con tante card e i decenni dagli anni '70 in poi
const TEAM_THEMES = Object.entries(
  ALL_CARDS.reduce<Record<string, number>>((m, c) => {
    if (c.kind === 'team') m[c.team.id] = (m[c.team.id] ?? 0) + 1;
    return m;
  }, {}),
)
  .filter(([, n]) => n >= 12)
  .map(([team]) => team)
  .sort();
const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];

const decadeOf = (c: Card) => Math.floor(c.firstYear / 10) * 10;

export function themePool(theme: DailyTheme): Card[] {
  return theme.kind === 'team'
    ? ALL_CARDS.filter((c) => c.kind === 'team' && c.team.id === theme.team)
    : ALL_CARDS.filter((c) => c.rarity !== 'leggendaria' && decadeOf(c) === theme.decade);
}

// mazzo della CPU: 1 Oro, 2 Argento, 4 Bronzo presi dal tema (se mancano, si prende quello che c'è)
const DAILY_MIX: Rarity[] = ['oro', 'argento', 'argento', 'bronzo', 'bronzo', 'bronzo', 'bronzo'];

export function dailyChallenge(date = todayKey()): DailyChallenge {
  const rng = seededRng(`daily:${date}`);
  const theme: DailyTheme =
    rng() < 0.55
      ? (() => {
          const team = pick(TEAM_THEMES, rng);
          return { kind: 'team' as const, team, name: CARDS_DATA.teams[team] ?? team };
        })()
      : { kind: 'decade', decade: pick(DECADES, rng) };
  const pool = shuffle(themePool(theme), rng);
  const deck: Card[] = [];
  for (const rarity of DAILY_MIX) {
    const c = pool.find((x) => x.rarity === rarity && !deck.includes(x)) ?? pool.find((x) => !deck.includes(x));
    if (c) deck.push(c);
  }
  return { date, theme, cpuDeck: deck.slice(0, DECK_SIZE) };
}

export interface DailyState {
  date: string; // giorno dell'ultima sfida giocata
  won: boolean;
  streak: number; // giorni di fila con la sfida vinta
  lastWin: string | null;
}

export const emptyDaily = (): DailyState => ({ date: '', won: false, streak: 0, lastWin: null });

// una sola partita al giorno: si segna come giocata appena inizia (così non si può abbandonare e riprovare)
export const dailyPlayed = (d: DailyState, date = todayKey()) => d.date === date;

export function startDaily(d: DailyState, date = todayKey()): DailyState {
  return { ...d, date, won: false };
}

export function finishDaily(d: DailyState, won: boolean, date = todayKey()): DailyState {
  if (!won) return { ...d, date, won: false }; // la serie si interrompe da sola (vedi currentStreak)
  const streak = d.lastWin === yesterdayKey(date) ? d.streak + 1 : d.lastWin === date ? d.streak : 1;
  return { date, won: true, streak, lastWin: date };
}

// la serie si azzera se ieri non si è vinta la sfida
export const currentStreak = (d: DailyState, date = todayKey()) =>
  d.lastWin === date || d.lastWin === yesterdayKey(date) ? d.streak : 0;

// ---------- missioni ----------

export type Mission =
  | { kind: 'win'; target: number }
  | { kind: 'play'; target: number }
  | { kind: 'roundsWithStat'; stat: StatKey; target: number }
  | { kind: 'winWithTeam'; team: string; teamName: string; target: 1 }
  | { kind: 'winWithDecade'; decade: number; target: 1 }
  | { kind: 'openPack'; target: number }
  | { kind: 'bigWin'; points: number; target: 1 }
  | { kind: 'bronzeRounds'; target: number };

export interface MissionState {
  mission: Mission;
  reward: number; // crediti
  progress: number;
  claimed: boolean;
}

export interface MissionsState {
  date: string;
  list: MissionState[];
}

export const MISSIONS_PER_DAY = 3;

/**
 * Tre missioni per la giornata, diverse tra loro. Quelle legate a scuderie o decenni usano solo
 * scuderie/decenni di cui hai almeno una card, così sono sempre completabili.
 */
export function generateMissions(owned: Record<string, number>, date = todayKey()): MissionsState {
  const rng = seededRng(`missions:${date}`);
  const mine = Object.keys(owned)
    .map((id) => CARD_BY_ID.get(id))
    .filter((c): c is Card => !!c);
  const teams = [...new Set(mine.filter((c) => c.kind === 'team').map((c) => c.team.id))].sort();
  const decades = [...new Set(mine.map(decadeOf))].sort();

  const makers: (() => [Mission, number] | null)[] = [
    () => {
      const n = pick([2, 3], rng);
      return [{ kind: 'win', target: n }, n === 2 ? 15 : 25];
    },
    () => [{ kind: 'play', target: 3 }, 10],
    () => [{ kind: 'roundsWithStat', stat: pick(STATS, rng).key, target: 3 }, 15],
    () => {
      if (!teams.length) return null;
      const team = pick(teams, rng);
      return [{ kind: 'winWithTeam', team, teamName: CARDS_DATA.teams[team] ?? team, target: 1 }, 20];
    },
    () => (decades.length ? [{ kind: 'winWithDecade', decade: pick(decades, rng), target: 1 }, 20] : null),
    () => [{ kind: 'openPack', target: 1 }, 10],
    () => [{ kind: 'bigWin', points: 5, target: 1 }, 30],
    () => [{ kind: 'bronzeRounds', target: 3 }, 15],
  ];

  const list: MissionState[] = [];
  for (const make of shuffle(makers, rng)) {
    if (list.length >= MISSIONS_PER_DAY) break;
    const m = make();
    if (m) list.push({ mission: m[0], reward: m[1], progress: 0, claimed: false });
  }
  return { date, list };
}

// missioni di oggi: se quelle salvate sono di un altro giorno se ne generano di nuove
export const missionsFor = (saved: MissionsState | undefined, owned: Record<string, number>, date = todayKey()) =>
  saved && saved.date === date ? saved : generateMissions(owned, date);

export const missionDone = (m: MissionState) => m.progress >= m.mission.target;

function bump(list: MissionState[], amount: (m: Mission) => number): MissionState[] {
  return list.map((s) => {
    if (s.claimed || missionDone(s)) return s;
    const add = amount(s.mission);
    return add ? { ...s, progress: Math.min(s.mission.target, s.progress + add) } : s;
  });
}

// aggiorna le missioni a fine partita
export function missionsAfterMatch(ms: MissionsState, match: MatchState, deck: Card[]): MissionsState {
  const outcome = match.score.player > match.score.cpu ? 'player' : match.score.cpu > match.score.player ? 'cpu' : 'draw';
  const won = outcome === 'player';
  const roundsWon = match.history.filter((h) => h.winner === 'player');
  return {
    ...ms,
    list: bump(ms.list, (m) => {
      switch (m.kind) {
        case 'win':
          return won ? 1 : 0;
        case 'play':
          return 1;
        case 'roundsWithStat':
          return roundsWon.filter((h) => h.stat === m.stat).length;
        case 'winWithTeam':
          return won && deck.some((c) => c.kind === 'team' && c.team.id === m.team) ? 1 : 0;
        case 'winWithDecade':
          return won && deck.some((c) => decadeOf(c) === m.decade) ? 1 : 0;
        case 'bigWin':
          return won && match.score.player >= m.points ? 1 : 0;
        case 'bronzeRounds':
          return roundsWon.filter((h) => h.playerCard.rarity === 'bronzo').length;
        default:
          return 0;
      }
    }),
  };
}

export function missionsAfterPack(ms: MissionsState): MissionsState {
  return { ...ms, list: bump(ms.list, (m) => (m.kind === 'openPack' ? 1 : 0)) };
}

// ritira il premio di una missione completata: restituisce le missioni aggiornate e i crediti guadagnati
export function claimMission(ms: MissionsState, index: number): { missions: MissionsState; credits: number } {
  const s = ms.list[index];
  if (!s || s.claimed || !missionDone(s)) return { missions: ms, credits: 0 };
  return {
    missions: { ...ms, list: ms.list.map((x, i) => (i === index ? { ...x, claimed: true } : x)) },
    credits: s.reward,
  };
}
