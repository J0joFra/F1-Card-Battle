import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CARD_BY_ID, teamCardsOfDriver } from './cards';
import { DECK_SIZE, newMatch, playRound, type MatchState } from './engine';
import {
  claimMission,
  currentStreak,
  dailyChallenge,
  dailyPlayed,
  emptyDaily,
  finishDaily,
  generateMissions,
  missionDone,
  missionsAfterMatch,
  missionsAfterPack,
  missionsFor,
  seededRng,
  startDaily,
  themePool,
  todayKey,
  type MissionsState,
} from './daily';
import { mergeProgress, normalizeProgress, starterProgress } from './collection';

const owned = Object.fromEntries(ALL_CARDS.slice(0, 60).map((c) => [c.id, 1]));

describe('sfida del giorno', () => {
  it('stessa data, stessa sfida; date diverse, sfide diverse', () => {
    const a = dailyChallenge('2026-10-16');
    const b = dailyChallenge('2026-10-16');
    expect(a.cpuDeck.map((c) => c.id)).toEqual(b.cpuDeck.map((c) => c.id));
    const others = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'].map((d) => dailyChallenge(d).cpuDeck.map((c) => c.id).join());
    expect(new Set([a.cpuDeck.map((c) => c.id).join(), ...others]).size).toBeGreaterThan(1);
  });

  it('il mazzo CPU ha 7 card tutte del tema, per un anno intero di sfide', () => {
    for (let i = 0; i < 365; i++) {
      const date = todayKey(new Date(2026, 0, 1 + i));
      const c = dailyChallenge(date);
      expect(c.cpuDeck).toHaveLength(DECK_SIZE);
      expect(new Set(c.cpuDeck.map((x) => x.id)).size).toBe(DECK_SIZE);
      const pool = new Set(themePool(c.theme).map((x) => x.id));
      expect(c.cpuDeck.every((x) => pool.has(x.id))).toBe(true);
    }
  });

  it('una sola partita al giorno e serie di vittorie', () => {
    let d = emptyDaily();
    expect(dailyPlayed(d, '2026-10-16')).toBe(false);
    d = startDaily(d, '2026-10-16');
    expect(dailyPlayed(d, '2026-10-16')).toBe(true);
    d = finishDaily(d, true, '2026-10-16');
    expect(currentStreak(d, '2026-10-16')).toBe(1);
    d = finishDaily(startDaily(d, '2026-10-17'), true, '2026-10-17');
    expect(currentStreak(d, '2026-10-17')).toBe(2);
    expect(currentStreak(d, '2026-10-18')).toBe(2); // oggi non ancora giocata: la serie resta viva
    expect(currentStreak(d, '2026-10-19')).toBe(0); // saltato un giorno: serie azzerata
    d = finishDaily(startDaily(d, '2026-10-19'), true, '2026-10-19');
    expect(currentStreak(d, '2026-10-19')).toBe(1);
  });
});

describe('missioni', () => {
  it('tre missioni diverse, uguali per lo stesso giorno', () => {
    const a = generateMissions(owned, '2026-10-16');
    expect(a.list).toHaveLength(3);
    expect(new Set(a.list.map((m) => m.mission.kind)).size).toBe(3);
    expect(generateMissions(owned, '2026-10-16')).toEqual(a);
  });

  it('le missioni su scuderie e decenni usano card che possiedi', () => {
    for (let i = 0; i < 60; i++) {
      const ms = generateMissions(owned, todayKey(new Date(2026, 0, 1 + i)));
      for (const { mission } of ms.list) {
        if (mission.kind === 'winWithTeam') expect(Object.keys(owned).some((id) => CARD_BY_ID.get(id)!.team.id === mission.team)).toBe(true);
        if (mission.kind === 'winWithDecade')
          expect(Object.keys(owned).some((id) => Math.floor(CARD_BY_ID.get(id)!.firstYear / 10) * 10 === mission.decade)).toBe(true);
      }
    }
  });

  it('i progressi si aggiornano a fine partita e il premio si ritira una volta sola', () => {
    const deck = teamCardsOfDriver('lewis-hamilton').concat(ALL_CARDS.filter((c) => c.rarity === 'bronzo').slice(0, 4));
    const cpu = ALL_CARDS.filter((c) => c.rarity === 'bronzo').slice(10, 17);
    let state: MatchState = newMatch(deck, cpu, seededRng('x'));
    for (const stat of ['gare', 'top10', 'puntiGara', 'migliorArrivo', 'grigliaMedia', 'percArrivi', 'percCompagno'] as const)
      state = playRound(state, stat);
    const ms: MissionsState = {
      date: '2026-10-16',
      list: [
        { mission: { kind: 'play', target: 3 }, reward: 10, progress: 0, claimed: false },
        { mission: { kind: 'win', target: 1 }, reward: 15, progress: 0, claimed: false },
        { mission: { kind: 'openPack', target: 1 }, reward: 10, progress: 0, claimed: false },
      ],
    };
    const after = missionsAfterMatch(ms, state, deck);
    expect(after.list[0].progress).toBe(1);
    expect(after.list[1].progress).toBe(state.score.player > state.score.cpu ? 1 : 0);
    expect(after.list[2].progress).toBe(0);
    const packed = missionsAfterPack(after);
    expect(missionDone(packed.list[2])).toBe(true);
    const first = claimMission(packed, 2);
    expect(first.credits).toBe(10);
    expect(claimMission(first.missions, 2).credits).toBe(0); // già ritirata
    expect(claimMission(packed, 0).credits).toBe(0); // non completata
  });

  it('cambiando giorno arrivano missioni nuove', () => {
    const old = generateMissions(owned, '2026-10-15');
    expect(missionsFor(old, owned, '2026-10-15')).toBe(old);
    expect(missionsFor(old, owned, '2026-10-16').date).toBe('2026-10-16');
  });
});

describe('salvataggio', () => {
  it('i salvataggi vecchi ricevono la sfida vuota; unendo vince il giorno più recente', () => {
    const p = normalizeProgress({ owned: {}, wins: 1 });
    expect(p.daily).toEqual(emptyDaily());
    const account = { ...starterProgress(), daily: { ...emptyDaily(), date: '2026-10-15' } };
    const device = { ...starterProgress(), daily: { ...emptyDaily(), date: '2026-10-16', won: true, lastWin: '2026-10-16', streak: 1 } };
    expect(mergeProgress(account, device).daily.date).toBe('2026-10-16');
  });
});
