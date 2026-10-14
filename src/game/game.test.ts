import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import { ALL_CARDS, CARD_BY_ID, careerCardOf, teamCardsOfDriver } from './cards';
import { buildCpuDeck, cpuChooseStat, matchOutcome, newMatch, playRound, percentile, type MatchState } from './engine';
import { addCards, drawPack, matchDeck, recordMatch, starterProgress, WINS_PER_PACK } from './collection';

// rng deterministico per test ripetibili
const seeded = (seed = 42) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const card = (id: string) => CARD_BY_ID.get(id)!;

describe('dati delle card', () => {
  it('Hamilton ha una card per ogni scuderia più la Carriera', () => {
    const teams = teamCardsOfDriver('lewis-hamilton').map((c) => c.team.id);
    expect(teams).toEqual(['mclaren', 'mercedes', 'ferrari']);
    const career = careerCardOf('lewis-hamilton')!;
    expect(career.rarity).toBe('leggendaria');
    expect(career.stats.mondiali).toBe(7);
  });

  it('le statistiche della Carriera sono la somma delle scuderie', () => {
    for (const id of ['lewis-hamilton', 'michael-schumacher', 'fernando-alonso']) {
      const career = careerCardOf(id)!;
      const teams = teamCardsOfDriver(id);
      const sum = teams.reduce((n, c) => n + c.stats.vittorie, 0);
      // può includere stint brevi senza card (meno di 3 gare)
      expect(career.stats.vittorie).toBeGreaterThanOrEqual(sum);
      expect(career.stats.gare).toBeGreaterThanOrEqual(teams.reduce((n, c) => n + c.stats.gare, 0));
    }
  });

  it('id univoci', () => {
    expect(new Set(ALL_CARDS.map((c) => c.id)).size).toBe(ALL_CARDS.length);
  });
});

describe('motore di gioco', () => {
  const hamMerc = card('lewis-hamilton__mercedes');
  const hamFerr = card('lewis-hamilton__ferrari');

  it('vince il valore più alto e prende entrambe le card', () => {
    const state: MatchState = { player: [hamMerc], cpu: [hamFerr], pot: [], turn: 'player', round: 1 };
    const { state: next, result } = playRound(state, 'vittorie');
    expect(result.winner).toBe('player');
    expect(next.player.map((c) => c.id)).toEqual([hamMerc.id, hamFerr.id]);
    expect(next.cpu).toHaveLength(0);
    expect(matchOutcome(next)).toBe('player');
  });

  it('il pareggio mette le card nel piatto e il chooser non cambia', () => {
    const a = { ...hamMerc, id: 'a' } as Card;
    const b = { ...hamMerc, id: 'b' } as Card;
    const state: MatchState = { player: [a, hamMerc], cpu: [b, hamFerr], pot: [], turn: 'cpu', round: 1 };
    const tie = playRound(state, 'gare');
    expect(tie.result.winner).toBe('tie');
    expect(tie.state.pot).toHaveLength(2);
    expect(tie.state.turn).toBe('cpu');
    const win = playRound(tie.state, 'vittorie');
    expect(win.result.won).toBe(4);
    expect(win.state.player).toHaveLength(4);
    expect(win.state.pot).toHaveLength(0);
  });

  it('il mazzo CPU ha la stessa composizione di rarità', () => {
    const deck = ALL_CARDS.filter((c, i) => i % 50 === 0).slice(0, 10);
    const cpu = buildCpuDeck(deck, seeded());
    const count = (cs: Card[]) => cs.map((c) => c.rarity).sort().join();
    expect(count(cpu)).toBe(count(deck));
    expect(cpu.some((c) => deck.includes(c))).toBe(false);
  });

  it('nel miglior arrivo vince il valore più basso', () => {
    const state: MatchState = { player: [hamFerr], cpu: [card('jean-alesi__tyrrell')], pot: [], turn: 'player', round: 1 };
    expect(hamFerr.stats.migliorArrivo).toBe(1);
    expect(playRound(state, 'migliorArrivo').result.winner).toBe('player');
    expect(percentile('migliorArrivo', 1)).toBeGreaterThan(percentile('migliorArrivo', 10));
  });

  it('la CPU sceglie la statistica più forte della sua card', () => {
    const noMistakes = cpuChooseStat(hamMerc, seeded(), 0);
    expect(['vittorie', 'pole', 'percVittorie', 'mondiali', 'podi', 'gare', 'migliorArrivo']).toContain(noMistakes);
    expect(percentile(noMistakes, hamMerc.stats[noMistakes])).toBeGreaterThan(0.95);
  });

  it('una partita simulata finisce sempre', () => {
    const rng = seeded(7);
    const deck = ALL_CARDS.slice(0, 10);
    let state = newMatch(deck, buildCpuDeck(deck, rng), rng);
    let guard = 0;
    while (!matchOutcome(state) && guard++ < 100) {
      const chooser = state.turn === 'player' ? state.player[0] : state.cpu[0];
      state = playRound(state, cpuChooseStat(chooser, rng)).state;
    }
    expect(matchOutcome(state)).not.toBeNull();
  });
});

describe('collezione', () => {
  it('starter da 15 card senza leggendarie e un pacchetto in regalo', () => {
    const p = starterProgress(seeded());
    expect(Object.keys(p.owned)).toHaveLength(15);
    expect(Object.keys(p.owned).some((id) => card(id).rarity === 'leggendaria')).toBe(false);
    expect(p.packs).toBe(1);
    expect(matchDeck(p, seeded())).toHaveLength(10);
  });

  it('pacchetto da 5 card, l\'ultima almeno Argento', () => {
    for (let s = 1; s < 30; s++) {
      const pack = drawPack(seeded(s));
      expect(pack).toHaveLength(5);
      expect(pack[4].rarity).not.toBe('bronzo');
    }
  });

  it('i doppioni diventano crediti', () => {
    const p = starterProgress(seeded());
    const dup = card(Object.keys(p.owned)[0]);
    const res = addCards(p, [dup]);
    expect(res.added[0].duplicate).toBe(true);
    expect(res.progress.credits).toBeGreaterThan(p.credits);
    expect(res.progress.owned[dup.id]).toBe(2);
  });

  it('completare le scuderie sblocca la Carriera', () => {
    const p = { ...starterProgress(seeded()), owned: {} };
    const res = addCards(p, teamCardsOfDriver('lewis-hamilton'));
    expect(res.unlockedCareers.map((c) => c.id)).toEqual(['lewis-hamilton__career']);
    expect(res.progress.owned['lewis-hamilton__career']).toBe(1);
  });

  it(`un pacchetto ogni ${WINS_PER_PACK} vittorie`, () => {
    let p = { ...starterProgress(seeded()), packs: 0 };
    for (let i = 0; i < WINS_PER_PACK - 1; i++) {
      const r = recordMatch(p, 'player');
      expect(r.packEarned).toBe(false);
      p = r.progress;
    }
    const r = recordMatch(p, 'player');
    expect(r.packEarned).toBe(true);
    expect(r.progress.packs).toBe(1);
    expect(r.progress.winsTowardPack).toBe(0);
    expect(recordMatch(r.progress, 'cpu').progress.losses).toBe(1);
  });
});
