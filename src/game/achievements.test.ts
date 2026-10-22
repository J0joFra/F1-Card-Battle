import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementState } from './achievements';
import { cardsOfRarity } from './cards';
import { bumpStats, mergeProgress, openPack, starterProgress } from './collection';
import { newMatch, playRound, type MatchState } from './engine';
import { applyMatchEnd, matchStats } from './match';
import { STATS } from './cards';

const ctx = { profile: false, friends: 0 };

// partita già giocata con l'esito dei round scelto
function played(winners: ('player' | 'cpu')[], playerRarity: 'bronzo' | 'oro' = 'oro'): MatchState {
  const mine = cardsOfRarity(playerRarity).slice(0, STATS.length);
  const theirs = cardsOfRarity('argento').slice(0, STATS.length);
  let s = newMatch(mine, theirs, () => 0.5);
  s = { ...s, history: winners.map((w, i) => ({ stat: STATS[i].key, chooser: 'player', playerCard: mine[i], cpuCard: theirs[i], winner: w })) };
  return { ...s, round: winners.length };
}

describe('obiettivi', () => {
  it('ID unici e passi entro il limite di Play Giochi', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS).toHaveLength(50);
    expect(ACHIEVEMENTS.every((a) => !a.steps || a.steps <= 10000)).toBe(true);
  });

  it('nuovo giocatore: niente obiettivi tranne quelli già raggiunti', () => {
    const p = starterProgress(() => 0.3);
    const s = achievementState(p, ctx);
    expect(s.lights_out).toBeUndefined();
    expect(s.collector).toBe(15); // 15 card iniziali su 50
  });

  it('i passi si fermano al massimo e le vittorie contano', () => {
    const p = { ...starterProgress(), wins: 120 };
    const s = achievementState(p, ctx);
    expect(s.lights_out).toBe(1);
    expect(s.points_finish).toBe(10);
    expect(s.world_champion).toBe(100);
    expect(s.dominator).toBe(120);
  });

  it('aprire un pacchetto conta per gli obiettivi', () => {
    const res = openPack(starterProgress(), () => 0.5)!;
    expect(res.progress.stats?.packs).toBe(1);
    expect(achievementState(res.progress, ctx).first_rip).toBe(1);
  });

  it('vittorie speciali', () => {
    const n = STATS.length;
    expect(matchStats(played(Array(n).fill('player')), true, false)).toMatchObject({ flawless: 1 });
    const comeback: ('player' | 'cpu')[] = ['cpu', 'cpu', ...Array(n - 2).fill('player')];
    expect(matchStats(played(comeback), true, true)).toEqual({ comeback: 1, pvpWins: 1 });
    expect(matchStats(played(Array(n).fill('player'), 'bronzo'), true, false)).toMatchObject({ bronze: 1 });
    expect(matchStats(played(Array(n).fill('player')), false, true)).toEqual({});
  });

  it('fine partita: contatori e miglior serie', () => {
    const p = { ...starterProgress(), daily: { date: '', won: false, streak: 4, lastWin: '2026-10-21' } };
    const end = applyMatchEnd(p, played(Array(STATS.length).fill('player')), '2026-10-22', { daily: true, outcome: 'player' });
    expect(end.progress.stats).toMatchObject({ flawless: 1, bestStreak: 5 });
  });

  it('unione dei progressi: tiene il massimo di ogni contatore', () => {
    const a = bumpStats(starterProgress(), { packs: 5, jolly: 1 });
    const b = bumpStats(starterProgress(), { packs: 2, missions: 3 });
    expect(mergeProgress(a, b).stats).toEqual({ packs: 5, jolly: 1, missions: 3 });
  });

  it('una partita vera aggiorna i contatori', () => {
    let s = newMatch(cardsOfRarity('oro').slice(0, STATS.length), cardsOfRarity('bronzo').slice(0, STATS.length), () => 0.5);
    for (const st of STATS) s = playRound(s, s.usedStats.includes(st.key) ? STATS.find((x) => !s.usedStats.includes(x.key))!.key : st.key);
    const end = applyMatchEnd(starterProgress(), s, '2026-10-22');
    expect(end.progress.wins + end.progress.losses + end.progress.draws).toBe(1);
  });
});
