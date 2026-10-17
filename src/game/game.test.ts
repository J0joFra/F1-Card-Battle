import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import { ALL_CARDS, CARD_BY_ID, RARITY_THRESHOLDS, STATS, careerCardOf, teamCardsOfDriver } from './cards';
import {
  DECK_SIZE,
  ROUNDS,
  availableStats,
  buildCpuDeck,
  cpuChooseStat,
  currentCards,
  isAvailable,
  matchOutcome,
  newMatch,
  percentile,
  playRound,
} from './engine';
import { canAdd, deckProblems } from './deckRules';
import {
  addCards,
  autoFillDeck,
  drawPack,
  isUntouched,
  jollyTargets,
  mergeProgress,
  normalizeProgress,
  openPack,
  recordMatch,
  spendJolly,
  starterProgress,
  WINS_PER_PACK,
} from './collection';

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
      // con tutti i piloti dal 1980 (anche chi non è mai arrivato nei 10) top 10 e punti a gara sono 0 per circa 1 card su 8
      expect(zeros / ALL_CARDS.length).toBeLessThan(0.2);
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

  it('ogni metrica si usa una sola volta per partita', () => {
    const state = playRound(newMatch(deck, buildCpuDeck(deck, seeded()), seeded()), 'gare');
    expect(isAvailable(state, 'gare')).toBe(false);
    expect(() => playRound(state, 'gare')).toThrow();
    const after = playRound(state, 'top10');
    expect(isAvailable(after, 'gare')).toBe(false);
    expect(availableStats(after)).toHaveLength(ROUNDS - 2);
  });

  it('sceglie chi vince il round; in caso di pareggio il turno passa all\'altro', () => {
    const won = playRound({ ...newMatch([hamMerc], [hamFerr], seeded()), chooser: 'cpu' }, 'top10');
    expect(won.history[0].chooser).toBe('cpu');
    expect(won.chooser).toBe('player');
    const tie = playRound({ ...newMatch([hamMerc], [{ ...hamMerc, id: 'copia' }], seeded()), chooser: 'cpu' }, 'gare');
    expect(tie.chooser).toBe('player');
  });

  it('contro la CPU il primo round lo sceglie il giocatore', () => {
    for (let i = 1; i <= 10; i++) expect(newMatch(deck, deck, seeded(i)).chooser).toBe('player');
  });

  it('la CPU sceglie una metrica libera in cui la sua carta è forte', () => {
    const state = { ...newMatch([hamFerr], [hamMerc], seeded()), chooser: 'cpu' as const };
    const stat = cpuChooseStat(state);
    // è la metrica più forte della sua carta
    for (const s of STATS) expect(percentile(stat, hamMerc.stats[stat])).toBeGreaterThanOrEqual(percentile(s.key, hamMerc.stats[s.key]));
    const used = { ...state, usedStats: [stat] };
    expect(cpuChooseStat(used)).not.toBe(stat);
  });

  it('partita completa: 7 round, ogni metrica e ogni card usate una volta', () => {
    const rng = seeded(3);
    let state = newMatch(deck, buildCpuDeck(deck, rng), rng);
    const used: string[] = [];
    while (!matchOutcome(state)) {
      used.push(currentCards(state).player.id);
      state = playRound(state, cpuChooseStat(state, rng));
    }
    expect(state.history).toHaveLength(ROUNDS);
    expect([...state.usedStats].sort()).toEqual(STATS.map((x) => x.key).sort());
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

  it('Jolly: prende una card scuderia mancante di un pilota iniziato', () => {
    const [mclaren, mercedes, ferrari] = teamCardsOfDriver('lewis-hamilton');
    const p = { ...starterProgress(seeded()), owned: { [mclaren.id]: 1 }, jolly: 1 };
    const target = jollyTargets(p).find((t) => t.driverId === 'lewis-hamilton')!;
    expect(target.missing.map((c) => c.id)).toEqual([mercedes.id, ferrari.id]);
    // non si può usare su piloti mai iniziati
    expect(spendJolly(p, teamCardsOfDriver('fernando-alonso')[0])).toBeNull();
    const res = spendJolly(p, mercedes)!;
    expect(res.progress.jolly).toBe(0);
    expect(res.progress.owned[mercedes.id]).toBe(1);
    expect(spendJolly(res.progress, ferrari)).toBeNull(); // Jolly finiti
  });

  it('Jolly: completare le scuderie col Jolly sblocca la Carriera', () => {
    const [mclaren, mercedes, ferrari] = teamCardsOfDriver('lewis-hamilton');
    const p = { ...starterProgress(seeded()), owned: { [mclaren.id]: 1, [mercedes.id]: 1 }, jolly: 1 };
    expect(spendJolly(p, ferrari)!.unlockedCareers.map((c) => c.id)).toEqual(['lewis-hamilton__career']);
  });

  it('Jolly: esce in circa un pacchetto su 5', () => {
    let jolly = 0;
    for (let i = 1; i <= 400; i++) if (openPack({ ...starterProgress(seeded(i)), packs: 1 }, seeded(i * 7))!.jolly) jolly++;
    expect(jolly).toBeGreaterThan(40);
    expect(jolly).toBeLessThan(140);
  });
});

describe('salvataggio online', () => {
  it('la collezione iniziale non toccata si riconosce', () => {
    const p = starterProgress(seeded());
    expect(isUntouched(p)).toBe(true);
    expect(isUntouched(recordMatch(p, 'player').progress)).toBe(false);
  });

  it("unire dispositivo e account non perde card e non duplica i progressi", () => {
    const account = { ...starterProgress(seeded(1)), wins: 10, credits: 30, deck: ['x'] };
    const device = { ...starterProgress(seeded(2)), wins: 3, credits: 50, jolly: 1 };
    const merged = mergeProgress(account, device);
    for (const id of [...Object.keys(account.owned), ...Object.keys(device.owned)]) expect(merged.owned[id]).toBeGreaterThan(0);
    expect(merged.wins).toBe(10);
    expect(merged.credits).toBe(50);
    expect(merged.jolly).toBe(1);
    expect(merged.deck).toEqual(['x']);
  });

  it('i salvataggi vecchi o incompleti vengono resi validi', () => {
    const p = normalizeProgress({ owned: { 'lewis-hamilton__mercedes': 1, 'card-inesistente': 1 }, wins: 2 });
    expect(p.owned).toEqual({ 'lewis-hamilton__mercedes': 1 });
    expect(p.wins).toBe(2);
    expect(p.jolly).toBe(0);
    expect(p.updatedAt).toBe(0);
  });
});


describe('rarità dalla valutazione', () => {
  it('le card carriera sono leggendarie, le altre seguono la valutazione', () => {
    for (const c of ALL_CARDS) {
      expect(c.ovr).toBeGreaterThanOrEqual(0);
      expect(c.ovr).toBeLessThanOrEqual(100);
      if (c.kind === 'career') expect(c.rarity).toBe('leggendaria');
      else if (c.kind === 'pioneer') expect(c.rarity).toBe('pioniere');
      else {
        const [, min] = RARITY_THRESHOLDS.find(([r]) => r === c.rarity)!;
        expect(c.ovr).toBeGreaterThanOrEqual(min);
      }
    }
  });
  it('ci sono card di ogni rarità, le più rare sono le meno', () => {
    const n = (r: string) => ALL_CARDS.filter((c) => c.rarity === r).length;
    expect(n('platino')).toBeGreaterThan(0);
    expect(n('platino')).toBeLessThan(n('oro'));
    expect(n('oro')).toBeLessThan(n('argento'));
    expect(n('argento')).toBeLessThan(n('bronzo'));
  });
});

describe('regole del mazzo classico', () => {
  const pick = (r: string, n: number) => ALL_CARDS.filter((c) => c.rarity === r).slice(0, n);
  const deckOf = (...parts: Card[][]) => {
    const top = parts.flat();
    return [...top, ...pick('bronzo', 7 - top.length)];
  };
  it('1 Leggendaria + 1 Platino + 2 Oro, oppure 2 Platino + 2 Oro', () => {
    expect(deckProblems(deckOf(pick('leggendaria', 1), pick('platino', 1), pick('oro', 2)))).toEqual([]);
    expect(deckProblems(deckOf(pick('platino', 2), pick('oro', 2)))).toEqual([]);
    expect(deckProblems(deckOf(pick('leggendaria', 1), pick('platino', 2)))).not.toEqual([]);
    expect(deckProblems(deckOf(pick('leggendaria', 2)))).not.toEqual([]);
    expect(deckProblems(deckOf(pick('oro', 3)))).not.toEqual([]);
  });
  it('con 2 Platino non si può aggiungere una Leggendaria', () => {
    const deck = pick('platino', 2);
    expect(canAdd(deck, pick('leggendaria', 1)[0])).toBe(false);
    expect(canAdd(pick('platino', 1), pick('leggendaria', 1)[0])).toBe(true);
  });
});

describe('card Pioniere', () => {
  const pioneers = ALL_CARDS.filter((c) => c.kind === 'pioneer');
  it('ci sono, sono dei piloti fino al 1979 e non si possono mettere nel mazzo', () => {
    expect(pioneers.length).toBeGreaterThan(50);
    expect(pioneers.every((c) => c.firstYear < 1980 && c.rarity === 'pioniere')).toBe(true);
    expect(canAdd([], pioneers[0])).toBe(false);
    const deck = [pioneers[0], ...ALL_CARDS.filter((c) => c.rarity === 'bronzo').slice(0, 6)];
    expect(deckProblems(deck)).not.toEqual([]);
  });
  it('non finiscono nei mazzi completati in automatico', () => {
    const p = { ...starterProgress(seeded()), owned: Object.fromEntries([...pioneers, ...ALL_CARDS.filter((c) => c.rarity === 'bronzo').slice(0, 10)].map((c) => [c.id, 1])) };
    expect(autoFillDeck(p, []).some((c) => c.kind === 'pioneer')).toBe(false);
  });
});
