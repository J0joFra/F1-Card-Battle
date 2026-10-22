import { ACHIEVEMENTS, achievementState } from '../game/achievements';
import type { Progress } from '../game/collection';
import { playGamesAvailable, reportAchievements } from './playGames';

/*
 * Manda a Play Giochi gli obiettivi che sono avanzati dall'ultima volta. Quello già mandato si ricorda sul
 * telefono (per account), così non si ripete a ogni modifica dei progressi.
 */

const SENT_KEY = 'f1-card-battle:achievements';
const BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

let friends = 0;
let running = false;
let pending: (() => Promise<void>) | null = null;

function readSent(account: string): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}');
    return all?.[account] ?? {};
  } catch {
    return {};
  }
}

function writeSent(account: string, sent: Record<string, number>) {
  try {
    const all = JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') ?? {};
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...all, [account]: sent }));
  } catch {
    // salvataggio non disponibile: si rimanda tutto la prossima volta (Play Giochi ignora i doppioni)
  }
}

async function send(progress: Progress, profile: boolean, account: string) {
  const state = achievementState(progress, { profile, friends });
  const sent = readSent(account);
  const changed = Object.entries(state).filter(([key, n]) => n > (sent[key] ?? 0));
  if (!changed.length) return;
  const items = changed.map(([key, n]) => {
    const a = BY_KEY.get(key)!;
    return a.steps ? { id: a.id, steps: n } : { id: a.id };
  });
  if (await reportAchievements(items)) writeSent(account, { ...sent, ...Object.fromEntries(changed) });
}

// una richiesta alla volta: quella arrivata nel frattempo parte subito dopo, con i dati più recenti
export function syncAchievements(progress: Progress, profile: boolean, account: string | null) {
  if (!account || !playGamesAvailable()) return;
  const job = () => send(progress, profile, account);
  if (running) {
    pending = job;
    return;
  }
  running = true;
  void (async () => {
    let next: (() => Promise<void>) | null = job;
    while (next) {
      pending = null;
      await next().catch(() => {});
      next = pending;
    }
    running = false;
  })();
}

// numero di amici (dalla schermata Amici): serve per l'obiettivo "Teammate"
export function noteFriends(n: number) {
  friends = Math.max(friends, n);
}

// dopo l'accesso a Play Giochi si rimanda tutto (l'account Play Giochi potrebbe essere nuovo)
export function resetSentAchievements() {
  try {
    localStorage.removeItem(SENT_KEY);
  } catch {
    // niente
  }
}
