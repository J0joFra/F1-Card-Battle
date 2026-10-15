import { describe, expect, it } from 'vitest';
import { ALL_CARDS, STATS } from '../game/cards';
import { starterProgress, type Progress } from '../game/collection';
import { autoFillDeck } from '../game/collection';
import { seededRng } from '../game/daily';
import { PVP_TURN_MS, handle, type Ctx, type GameRequest, type MatchRecord, type PvpRecord, type Store } from './actions';

// database finto in memoria, con gli stessi controlli di versione di quello vero; più utenti
function memoryDb() {
  const profiles = new Map<string, { progress: Progress; version: number }>();
  const matches = new Map<string, MatchRecord>();
  const pvps = new Map<string, { rec: PvpRecord; rev: number }>();
  let conflictsToSimulate = 0;
  const as = (id: string, name: string | null = id): Store => ({
    me: { id, name },
    async getProfile(uid = id) {
      const p = profiles.get(uid);
      return p ? structuredClone(p) : null;
    },
    async putProfile(progress, prev, uid = id) {
      const cur = profiles.get(uid);
      if (conflictsToSimulate > 0 && cur) {
        conflictsToSimulate--;
        profiles.set(uid, { progress: { ...cur.progress }, version: cur.version + 1 }); // "un'altra richiesta" ha scritto
        return false;
      }
      if (prev === null) {
        if (cur) return false;
        profiles.set(uid, { progress, version: 1 });
        return true;
      }
      if (!cur || cur.version !== prev) return false;
      profiles.set(uid, { progress, version: prev + 1 });
      return true;
    },
    async getMatch(mid) {
      const m = matches.get(mid);
      return m ? structuredClone(m) : null;
    },
    async createMatch(rec) {
      const mid = `m${matches.size + 1}`;
      matches.set(mid, structuredClone(rec));
      return mid;
    },
    async updateMatch(mid, rec, expectedRound) {
      const m = matches.get(mid);
      if (!m || m.state.round !== expectedRound) return false;
      matches.set(mid, structuredClone(rec));
      return true;
    },
    async getPvp(pid) {
      const m = pvps.get(pid);
      return m ? structuredClone(m) : null;
    },
    async findPvpByCode(code) {
      for (const [pid, m] of pvps) if (m.rec.code === code && m.rec.status === 'waiting') return structuredClone({ id: pid, ...m });
      return null;
    },
    async createPvp(rec) {
      for (const m of pvps.values()) if (m.rec.code === rec.code && m.rec.status === 'waiting') return null;
      const pid = `p${pvps.size + 1}`;
      pvps.set(pid, { rec: structuredClone(rec), rev: 0 });
      return pid;
    },
    async updatePvp(pid, rec, rev) {
      const m = pvps.get(pid);
      if (!m || m.rev !== rev) return false;
      pvps.set(pid, { rec: structuredClone(rec), rev: rev + 1 });
      return true;
    },
  });
  return {
    as,
    profiles,
    pvps,
    simulateConflicts(n: number) {
      conflictsToSimulate = n;
    },
  };
}

function memoryStore(initial?: Progress, version = 1) {
  const db = memoryDb();
  if (initial) db.profiles.set('me', { progress: initial, version });
  return {
    store: db.as('me'),
    get profile() {
      return db.profiles.get('me') ?? null;
    },
    simulateConflicts: db.simulateConflicts,
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

describe('server: sfida tra amici', () => {
  function setup() {
    const db = memoryDb();
    const a = starterProgress(seededRng('host'));
    const b = starterProgress(seededRng('guest'));
    db.profiles.set('anna', { progress: a, version: 1 });
    db.profiles.set('bruno', { progress: b, version: 1 });
    let clock = 1_000_000;
    const c: Ctx = { today: '2026-10-16', rng: seededRng('pvp'), now: () => clock };
    return {
      db,
      anna: db.as('anna', 'Anna'),
      bruno: db.as('bruno', 'Bruno'),
      a,
      b,
      c,
      tick: (ms: number) => (clock += ms),
    };
  }

  async function startPvp() {
    const t = setup();
    const created = await handle({ action: 'pvp_create', deck: deckIds(t.a), date: '2026-10-16' }, t.anna, t.c);
    expect(created.pvp!.code).toMatch(/^[A-Z2-9]{6}$/);
    const joined = await handle({ action: 'pvp_join', code: created.pvp!.code.toLowerCase(), deck: deckIds(t.b), date: '2026-10-16' }, t.bruno, t.c);
    return { ...t, id: created.pvp!.id, joined };
  }

  it('codice: non puoi entrare nella tua sfida, e un codice sbagliato è rifiutato', async () => {
    const t = setup();
    const created = await handle({ action: 'pvp_create', deck: deckIds(t.a), date: '2026-10-16' }, t.anna, t.c);
    await expect(handle({ action: 'pvp_join', code: created.pvp!.code, deck: deckIds(t.a), date: '2026-10-16' }, t.anna, t.c)).rejects.toThrow('own_match');
    await expect(handle({ action: 'pvp_join', code: 'ZZZZZZ', deck: deckIds(t.b), date: '2026-10-16' }, t.bruno, t.c)).rejects.toThrow('bad_code');
    t.tick(16 * 60_000); // scaduta
    await expect(handle({ action: 'pvp_join', code: created.pvp!.code, deck: deckIds(t.b), date: '2026-10-16' }, t.bruno, t.c)).rejects.toThrow('bad_code');
  });

  it('partita completa: ognuno vede la sua parte, a turno; premi a entrambi', async () => {
    const t = await startPvp();
    const players = { anna: t.anna, bruno: t.bruno };
    let views = {
      anna: (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!,
      bruno: t.joined.view!,
    };
    // i due vedono la stessa partita, a parti invertite
    expect(views.anna.chooser).not.toBe(views.bruno.chooser);
    const annaCards = deckIds(t.a);
    expect(annaCards.some((id) => JSON.stringify(views.bruno).includes(id))).toBe(false); // nessuna card di Anna prima del round
    while (!views.anna.outcome) {
      const who = views.anna.chooser === 'player' ? 'anna' : 'bruno';
      const otherWho = who === 'anna' ? 'bruno' : 'anna';
      // chi non è di turno non può giocare
      const stat = STATS.find((s) => !views[who].usedStats.includes(s.key))!.key;
      await expect(handle({ action: 'pvp_play', match: t.id, stat }, players[otherWho], t.c)).rejects.toThrow('not_your_turn');
      await handle({ action: 'pvp_play', match: t.id, stat }, players[who], t.c);
      views = {
        anna: (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!,
        bruno: (await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c)).view!,
      };
      expect(views.anna.score.player).toBe(views.bruno.score.cpu);
    }
    const ra = await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c);
    const rb = await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c);
    const pa = t.db.profiles.get('anna')!.progress;
    const pb = t.db.profiles.get('bruno')!.progress;
    expect(pa.wins + pa.losses + pa.draws).toBe(1);
    expect(pb.wins + pb.losses + pb.draws).toBe(1);
    const expected = { player: 10, draw: 5, cpu: 0 } as const;
    expect(ra.rewards!.credits).toBe(expected[views.anna.outcome!]);
    expect(rb.rewards!.credits).toBe(expected[views.bruno.outcome!]);
    expect(pa.credits).toBe(expected[views.anna.outcome!]);
  });

  it('tempo scaduto: il server gioca la metrica migliore per chi doveva scegliere', async () => {
    const t = await startPvp();
    const before = (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!;
    t.tick(PVP_TURN_MS - 1000);
    expect((await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c)).view!.round).toBe(before.round);
    t.tick(2000);
    const after = await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c);
    expect(after.view!.round).toBe(before.round + 1);
    expect(after.pvp!.timeLeft).toBe(PVP_TURN_MS);
  });

  it('chi abbandona perde, l\'altro vince', async () => {
    const t = await startPvp();
    await handle({ action: 'pvp_quit', match: t.id }, t.bruno, t.c);
    const ra = await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c);
    expect(ra.pvp!.opponentLeft).toBe(true);
    expect(ra.view!.outcome).toBe('player');
    expect(t.db.profiles.get('anna')!.progress.wins).toBe(1);
    expect(t.db.profiles.get('bruno')!.progress.losses).toBe(1);
  });

  it('gli estranei non vedono la sfida', async () => {
    const t = await startPvp();
    t.db.profiles.set('carla', { progress: starterProgress(seededRng('c')), version: 1 });
    await expect(handle({ action: 'pvp_state', match: t.id }, t.db.as('carla'), t.c)).rejects.toThrow('no_match');
  });
});
