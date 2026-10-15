import { describe, expect, it } from 'vitest';
import { ALL_CARDS, STATS } from '../game/cards';
import { starterProgress, type Progress } from '../game/collection';
import { autoFillDeck } from '../game/collection';
import { seededRng } from '../game/daily';
import { handle, type Ctx, type GameRequest, type MatchRecord, type Store } from './actions';

// database finto in memoria, con lo stesso controllo di versione di quello vero
function memoryStore(initial?: Progress, version = 1) {
  let profile: { progress: Progress; version: number } | null = initial ? { progress: initial, version } : null;
  const matches = new Map<string, MatchRecord>();
  let conflictsToSimulate = 0;
  const store: Store = {
    async getProfile() {
      return profile ? structuredClone(profile) : null;
    },
    async putProfile(progress, prev) {
      if (conflictsToSimulate > 0) {
        conflictsToSimulate--;
        profile = { progress: { ...profile!.progress }, version: profile!.version + 1 }; // "un'altra richiesta" ha scritto
        return false;
      }
      if (prev === null) {
        if (profile) return false;
        profile = { progress, version: 1 };
        return true;
      }
      if (!profile || profile.version !== prev) return false;
      profile = { progress, version: prev + 1 };
      return true;
    },
    async getMatch(id) {
      const m = matches.get(id);
      return m ? structuredClone(m) : null;
    },
    async createMatch(rec) {
      const id = `m${matches.size + 1}`;
      matches.set(id, structuredClone(rec));
      return id;
    },
    async updateMatch(id, rec, expectedRound) {
      const m = matches.get(id);
      if (!m || m.state.round !== expectedRound) return false;
      matches.set(id, structuredClone(rec));
      return true;
    },
  };
  return {
    store,
    get profile() {
      return profile;
    },
    simulateConflicts(n: number) {
      conflictsToSimulate = n;
    },
  };
}

const ctx: Ctx = { today: '2026-10-16', rng: seededRng('test') };
const call = (s: Store, r: GameRequest) => handle(r, s, ctx);
const deckIds = (p: Progress) => autoFillDeck(p, [], seededRng('deck')).map((c) => c.id);

describe('server: profilo', () => {
  it('primo accesso senza dati: mazzo iniziale', async () => {
    const db = memoryStore();
    const { progress } = await call(db.store, { action: 'sync' });
    expect(Object.keys(progress!.owned)).toHaveLength(15);
    expect(db.profile).not.toBeNull();
  });

  it('primo accesso: i progressi del dispositivo vengono importati solo se plausibili', async () => {
    const guest = { ...starterProgress(seededRng('g')), credits: 120, wins: 7 };
    const ok = await call(memoryStore().store, { action: 'sync', guest });
    expect(ok.progress!.credits).toBe(120);
    const cheat = { ...guest, credits: 999999, owned: Object.fromEntries(ALL_CARDS.map((c) => [c.id, 1])) };
    const res = await call(memoryStore().store, { action: 'sync', guest: cheat });
    expect(res.progress!.credits).toBe(0);
    expect(Object.keys(res.progress!.owned)).toHaveLength(15);
  });

  it('passaggio dalla vecchia app (versione 0): un\'ultima unione con i dati del telefono, poi basta', async () => {
    const online = { ...starterProgress(seededRng('a')), credits: 5, wins: 2 };
    const db = memoryStore(online, 0);
    const phone = { ...online, credits: 60, wins: 4 };
    const res = await call(db.store, { action: 'sync', guest: phone });
    expect(res.progress!.credits).toBe(60);
    expect(res.progress!.wins).toBe(4);
    expect(db.profile!.version).toBe(1);
    const again = await call(db.store, { action: 'sync', guest: { ...phone, credits: 999 } });
    expect(again.progress!.credits).toBe(60); // dalla seconda volta il telefono non conta più
  });

  it('se il profilo esiste già, i dati del dispositivo vengono ignorati', async () => {
    const db = memoryStore({ ...starterProgress(seededRng('a')), credits: 5 });
    const res = await call(db.store, { action: 'sync', guest: { credits: 900 } });
    expect(res.progress!.credits).toBe(5);
  });
});

describe('server: collezione', () => {
  it('apre un pacchetto solo se ce ne sono', async () => {
    const db = memoryStore({ ...starterProgress(seededRng('a')), packs: 1 });
    const res = await call(db.store, { action: 'open_pack' });
    expect(res.pack!.added).toHaveLength(5);
    expect(res.progress!.packs).toBe(0);
    await expect(call(db.store, { action: 'open_pack' })).rejects.toThrow('no_packs');
  });

  it('acquisti: servono i crediti, e le card devono esistere', async () => {
    const db = memoryStore({ ...starterProgress(seededRng('a')), credits: 10 });
    await expect(call(db.store, { action: 'buy_pack' })).rejects.toThrow('not_enough_credits');
    const target = ALL_CARDS.find((c) => c.rarity === 'bronzo' && !db.profile!.progress.owned[c.id])!;
    await expect(call(db.store, { action: 'buy_card', card: target.id })).rejects.toThrow('cannot_buy');
    await expect(call(db.store, { action: 'buy_card', card: 'card-inventata' })).rejects.toThrow('unknown_card');
  });

  it('missione: il premio si ritira solo se completata, una volta', async () => {
    const db = memoryStore({ ...starterProgress(seededRng('a')), packs: 1 });
    await call(db.store, { action: 'open_pack' }); // genera le missioni e fa avanzare "apri un pacchetto"
    const missions = db.profile!.progress.missions!;
    const ready = missions.list.findIndex((m) => m.progress >= m.mission.target);
    const notReady = missions.list.findIndex((m) => m.progress < m.mission.target);
    await expect(call(db.store, { action: 'claim_mission', index: notReady, date: '2026-10-16' })).rejects.toThrow('mission_not_ready');
    if (ready >= 0) {
      const before = db.profile!.progress.credits;
      const res = await call(db.store, { action: 'claim_mission', index: ready, date: '2026-10-16' });
      expect(res.progress!.credits).toBe(before + res.credits!);
      await expect(call(db.store, { action: 'claim_mission', index: ready, date: '2026-10-16' })).rejects.toThrow('mission_not_ready');
    }
  });

  it('richieste contemporanee: riprova e non perde modifiche', async () => {
    const db = memoryStore({ ...starterProgress(seededRng('a')), credits: 100 });
    db.simulateConflicts(2);
    const res = await call(db.store, { action: 'buy_pack' });
    expect(res.progress!.credits).toBe(60);
    expect(db.profile!.progress.packs).toBe(2);
  });
});

describe('server: partita', () => {
  it('mazzo non valido o con card non possedute: rifiutato', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const notMine = ALL_CARDS.filter((c) => !p.owned[c.id] && c.rarity === 'bronzo').slice(0, 7).map((c) => c.id);
    await expect(call(db.store, { action: 'match_start', deck: notMine, daily: false, date: '2026-10-16' })).rejects.toThrow('bad_deck');
    const ids = deckIds(p);
    await expect(call(db.store, { action: 'match_start', deck: [ids[0], ...ids.slice(0, 6)], daily: false, date: '2026-10-16' })).rejects.toThrow('bad_deck');
    await expect(call(db.store, { action: 'match_start', deck: ids, daily: false, date: '2020-01-01' })).rejects.toThrow('bad_date');
  });

  it('partita completa giocata sul server: il telefono non vede le carte CPU future, premi alla fine', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const start = await call(db.store, { action: 'match_start', deck: deckIds(p), daily: false, date: '2026-10-16' });
    expect(start.view!.current).toBeTruthy();
    expect(JSON.stringify(start.view)).not.toContain('cpu":["'); // nessun mazzo CPU nella risposta
    let view = start.view!;
    while (!view.outcome) {
      const stat = view.chooser === 'player' ? STATS.find((s) => !view.usedStats.includes(s.key))!.key : undefined;
      const res = await call(db.store, { action: 'match_play', match: start.match!, stat });
      view = res.view!;
      if (view.outcome) {
        expect(res.rewards).toBeDefined();
        const prog = db.profile!.progress;
        expect(prog.wins + prog.losses + prog.draws).toBe(1);
      }
    }
    expect(view.history).toHaveLength(STATS.length);
    await expect(call(db.store, { action: 'match_play', match: start.match!, stat: 'gare' })).rejects.toThrow('match_finished');
  });

  it('metrica già usata o mancante: rifiutata', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const start = await call(db.store, { action: 'match_start', deck: deckIds(p), daily: false, date: '2026-10-16' });
    await expect(call(db.store, { action: 'match_play', match: start.match! })).rejects.toThrow('bad_stat');
    const r1 = await call(db.store, { action: 'match_play', match: start.match!, stat: 'gare' });
    if (r1.view!.chooser === 'player')
      await expect(call(db.store, { action: 'match_play', match: start.match!, stat: 'gare' })).rejects.toThrow('bad_stat');
  });

  it('sfida del giorno: una sola al giorno, anche abbandonandola', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const start = await call(db.store, { action: 'match_start', deck: deckIds(p), daily: true, date: '2026-10-16' });
    await call(db.store, { action: 'match_quit', match: start.match! });
    await expect(call(db.store, { action: 'match_start', deck: deckIds(p), daily: true, date: '2026-10-16' })).rejects.toThrow('daily_played');
  });
});
