import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import { ALL_CARDS, CARD_BY_ID, STATS, careerCardOf, teamCardsOfDriver } from './cards';
import { DECK_SIZE, ROUNDS, buildCpuDeck, currentCards, isAvailable, matchOutcome, newMatch, playRound } from './engine';
import { canAdd, deckProblems } from './deckRules';
import { addCards, autoFillDeck, drawPack, recordMatch, starterProgress, WINS_PER_PACK } from './collection';

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
    expect(career.palmares.mondiali).toBe(7);
  });

  it('le statistiche della Carriera sono la somma delle scuderie', () => {
    for (const id of ['lewis-hamilton', 'michael-schumacher', 'fernando-alonso']) {
      const career = careerCardOf(id)!;
      const teams = teamCardsOfDriver(id);
      const sum = teams.reduce((n, c) => n + c.palmares.vittorie, 0);
      // può includere stint brevi senza card (meno di 3 gare)
      expect(career.palmares.vittorie).toBeGreaterThanOrEqual(sum);
      expect(career.stats.top10).toBeGreaterThanOrEqual(teams.reduce((n, c) => n + c.stats.top10, 0));
      expect(career.stats.gare).toBeGreaterThanOrEqual(teams.reduce((n, c) => n + c.stats.gare, 0));
    }
  });

  it('le metriche di gioco sono quasi sempre diverse da 0', () => {
    for (const s of STATS) {
      const zeros = ALL_CARDS.filter((c) => c.stats[s.key] === 0).length;
      expect(zeros / ALL_CARDS.length).toBeLessThan(0.1);
    }
  });

  it('id univoci', () => {
    expect(new Set(ALL_CARDS.map((c) => c.id)).size).toBe(ALL_CARDS.length);
  });
});

describe('motore di gioco', () => {
  const hamMerc = card('lewis-hamilton__mercedes');
  const hamFerr = card('lewis-hamilton__ferrari');
  const deck = ALL_CARDS.filter((c) => c.rarity === 'bronzo').slice(0, DECK_SIZE);

  it('una partita dura un round per metrica', () => {
    expect(ROUNDS).toBe(STATS.length);
    expect(DECK_SIZE).toBe(ROUNDS);
  });

  it('vince il valore più alto e prende il punto', () => {
    const state = newMatch([hamMerc], [hamFerr], seeded());
    const next = playRound(state, 'top10');
    expect(next.history[0].winner).toBe('player');
    expect(next.score).toEqual({ player: 1, cpu: 0 });
    expect(matchOutcome(next)).toBe('player');
  });

  it('nelle metriche ↓ vince il valore più basso', () => {
    const alesi = card('jean-alesi__tyrrell');
    expect(hamMerc.stats.grigliaMedia).toBeLessThan(alesi.stats.grigliaMedia);
    expect(playRound(newMatch([hamMerc], [alesi], seeded()), 'grigliaMedia').history[0].winner).toBe('player');
  });

  it('pareggio: nessun punto', () => {
    const next = playRound(newMatch([hamMerc], [{ ...hamMerc, id: 'copia' }], seeded()), 'gare');
    expect(next.history[0].winner).toBe('tie');
    expect(next.score).toEqual({ player: 0, cpu: 0 });
    expect(matchOutcome(next)).toBe('draw');
  });

  it('non si può ripetere la metrica del round precedente', () => {
    const state = playRound(newMatch(deck, buildCpuDeck(deck, seeded()), seeded()), 'gare');
    expect(isAvailable(state, 'gare')).toBe(false);
    expect(() => playRound(state, 'gare')).toThrow();
    const after = playRound(state, 'top10');
    expect(isAvailable(after, 'gare')).toBe(true);
  });

  it('ogni card del mazzo viene giocata una volta, in ordine casuale', () => {
    const rng = seeded(3);
    let state = newMatch(deck, buildCpuDeck(deck, rng), rng);
    const used: string[] = [];
    let i = 0;
    while (!matchOutcome(state)) {
      used.push(currentCards(state).player.id);
      const stat = STATS.map((s) => s.key).find((k) => isAvailable(state, k) && k !== STATS[i % 2].key)!;
      state = playRound(state, stat);
      i++;
    }
    expect(state.history).toHaveLength(ROUNDS);
    expect([...used].sort()).toEqual(deck.map((c) => c.id).sort());
    expect(state.score.player + state.score.cpu).toBeLessThanOrEqual(ROUNDS);
  });

  it('il mazzo CPU ha la stessa composizione di rarità', () => {
    const mixed = [...ALL_CARDS.filter((c) => c.rarity === 'argento').slice(0, 3), ...deck.slice(0, 4)];
    const cpu = buildCpuDeck(mixed, seeded());
    const count = (cs: Card[]) => cs.map((c) => c.rarity).sort().join();
    expect(count(cpu)).toBe(count(mixed));
    expect(cpu.some((c) => mixed.includes(c))).toBe(false);
  });
});

describe('regole del mazzo', () => {
  const legends = ALL_CARDS.filter((c) => c.rarity === 'leggendaria');
  const bronze = ALL_CARDS.filter((c) => c.rarity === 'bronzo');

  it('serve il numero giusto di card', () => {
    expect(deckProblems(bronze.slice(0, DECK_SIZE))).toEqual([]);
    expect(deckProblems(bronze.slice(0, DECK_SIZE - 1))).toHaveLength(1);
  });

  it('non si può fare un mazzo di sole leggende', () => {
    expect(deckProblems(legends.slice(0, DECK_SIZE)).length).toBeGreaterThan(0);
    expect(canAdd([legends[0]], legends[1])).toBe(false);
    expect(canAdd([legends[0]], bronze[0])).toBe(true);
  });

  it('il completamento automatico rispetta i limiti', () => {
    const owned = Object.fromEntries(ALL_CARDS.slice(0, 120).map((c) => [c.id, 1]));
    const p = { ...starterProgress(seeded()), owned };
    const filled = autoFillDeck(p, [], seeded(5));
    expect(filled).toHaveLength(DECK_SIZE);
    expect(deckProblems(filled)).toEqual([]);
  });
});

describe('collezione', () => {
  it('starter da 15 card senza leggendarie e un pacchetto in regalo', () => {
    const p = starterProgress(seeded());
    expect(Object.keys(p.owned)).toHaveLength(15);
    expect(Object.keys(p.owned).some((id) => card(id).rarity === 'leggendaria')).toBe(false);
    expect(p.packs).toBe(1);
    expect(autoFillDeck(p, [], seeded())).toHaveLength(DECK_SIZE);
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
