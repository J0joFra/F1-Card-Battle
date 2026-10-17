import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CARD_BY_ID, STATS } from '../game/cards';
import { PACK_TYPES, storePrice, teamOfDay } from '../game/shop';
import { starterProgress, withDecks, type Progress } from '../game/collection';
import { autoFillDeck } from '../game/collection';
import { dailyChallenge, seededRng, themeMode, themePool } from '../game/daily';
import { CLASSIC, fillDeck } from '../game/deckRules';
import { PVP_REVEAL_MS, PVP_TURN_MS, handle, type Ctx, type GameRequest, type MatchRecord, type PvpRecord, type Store } from './actions';

// database finto in memoria, con gli stessi controlli di versione di quello vero; più utenti
function memoryDb() {
  const profiles = new Map<string, { progress: Progress; version: number }>();
  const matches = new Map<string, MatchRecord>();
  const pvps = new Map<string, { rec: PvpRecord; rev: number }>();
  const seen = new Map<string, number>();
  const names = new Map<string, string | null>();
  const friendships = new Set<string>(); // "a|b"
  let conflictsToSimulate = 0;
  const as = (id: string, name: string | null = id): Store => (names.set(id, name), {
    me: { id, name },
    async invitesForMe() {
      return [...pvps].filter(([, m]) => m.rec.invitee === id && m.rec.status === 'waiting').map(([pid, m]) => structuredClone({ id: pid, rec: m.rec }));
    },
    async touch(now) {
      seen.set(id, now);
    },
    async listFriends() {
      return [...friendships].filter((f) => f.startsWith(`${id}|`)).map((f) => {
        const fid = f.split('|')[1];
        return { id: fid, name: names.get(fid) ?? null, lastSeen: seen.get(fid) ?? null };
      });
    },
    async isFriend(other) {
      return friendships.has(`${id}|${other}`);
    },
    async addFriend(other) {
      friendships.add(`${id}|${other}`);
      friendships.add(`${other}|${id}`);
    },
    async removeFriend(other) {
      friendships.delete(`${id}|${other}`);
      friendships.delete(`${other}|${id}`);
    },
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
    friendships,
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
    await expect(call(db.store, { action: 'buy_pack', kind: 'premium', date: '2026-10-16' })).rejects.toThrow('not_enough_credits');
    await expect(call(db.store, { action: 'buy_store', card: 'card-inventata', date: '2026-10-16' })).rejects.toThrow('unknown_card');
  });

  it('pacchetti Premium (niente Bronzo) e Scuderia (solo la scuderia del giorno): si aprono subito', async () => {
    const db = memoryStore({ ...starterProgress(seededRng('a')), credits: 1000 });
    const prem = await call(db.store, { action: 'buy_pack', kind: 'premium', date: '2026-10-16' });
    expect(prem.pack!.added).toHaveLength(PACK_TYPES.premium.size);
    expect(prem.pack!.added.every((a) => CARD_BY_ID.get(a.card)!.rarity !== 'bronzo')).toBe(true);
    expect(prem.progress!.credits).toBe(1000 - PACK_TYPES.premium.price + prem.pack!.added.reduce((n, a) => n + a.credits, 0));
    const team = await call(db.store, { action: 'buy_pack', kind: 'team', date: '2026-10-16' });
    const teamId = teamOfDay('2026-10-16').id;
    expect(team.pack!.added).toHaveLength(PACK_TYPES.team.size);
    expect(team.pack!.added.every((a) => CARD_BY_ID.get(a.card)!.team.id === teamId)).toBe(true);
  });

  it('negozio: 6 card del giorno, fisse per tutto il giorno, comprabili una volta', async () => {
    const db = memoryStore({ ...starterProgress(seededRng('a')), credits: 500 });
    const first = await call(db.store, { action: 'store', date: '2026-10-16' });
    const cards = first.progress!.store!.cards;
    expect(cards).toHaveLength(6);
    expect(cards.every((id) => !first.progress!.owned[id] && CARD_BY_ID.get(id)!.kind === 'team')).toBe(true);
    // la stessa giornata: stesse card
    expect((await call(db.store, { action: 'store', date: '2026-10-16' })).progress!.store!.cards).toEqual(cards);
    const card = CARD_BY_ID.get(cards[0])!;
    const res = await call(db.store, { action: 'buy_store', card: card.id, date: '2026-10-16' });
    expect(res.progress!.owned[card.id]).toBe(1);
    expect(res.progress!.credits).toBe(500 - storePrice(card));
    await expect(call(db.store, { action: 'buy_store', card: card.id, date: '2026-10-16' })).rejects.toThrow('cannot_buy');
    // una card che non è nel negozio di oggi non si compra
    const notInStore = ALL_CARDS.find((c) => c.kind === 'team' && !cards.includes(c.id) && !res.progress!.owned[c.id])!;
    await expect(call(db.store, { action: 'buy_store', card: notInStore.id, date: '2026-10-16' })).rejects.toThrow('cannot_buy');
    // il giorno dopo il negozio cambia
    const next = await call(db.store, { action: 'store', date: '2026-10-17' });
    expect(next.progress!.store!.date).toBe('2026-10-17');
    expect(next.progress!.store!.bought).toEqual([]);
    await expect(call(db.store, { action: 'store', date: '2026-10-20' })).rejects.toThrow('bad_date');
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

describe('server: sfida tra amici (al meglio di 3)', () => {
  // profilo con i 3 mazzi salvati e validi
  const ready = (seed: string) => {
    const p = starterProgress(seededRng(seed));
    const decks = [1, 2, 3].map((i) => autoFillDeck(p, [], seededRng(`${seed}${i}`)).map((c) => c.id));
    return withDecks(p, decks, 0);
  };

  function setup() {
    const db = memoryDb();
    db.profiles.set('anna', { progress: ready('host'), version: 1 });
    db.profiles.set('bruno', { progress: ready('guest'), version: 1 });
    let clock = 1_000_000;
    const c: Ctx = { today: '2026-10-16', rng: seededRng('pvp'), now: () => clock };
    return { db, anna: db.as('anna', 'Anna'), bruno: db.as('bruno', 'Bruno'), c, tick: (ms: number) => (clock += ms) };
  }

  async function startPvp() {
    const t = setup();
    const created = await handle({ action: 'pvp_create', date: '2026-10-16' }, t.anna, t.c);
    expect(created.pvp!.code).toMatch(/^[A-Z2-9]{6}$/);
    const joined = await handle({ action: 'pvp_join', code: created.pvp!.code.toLowerCase(), date: '2026-10-16' }, t.bruno, t.c);
    return { ...t, id: created.pvp!.id, joined };
  }

  // gioca fino alla fine della partita `game` (sceglie sempre la prima metrica libera)
  async function playGame(t: Awaited<ReturnType<typeof startPvp>>, game: number) {
    const players = { anna: t.anna, bruno: t.bruno };
    for (;;) {
      const va = (await handle({ action: 'pvp_state', match: t.id, game }, t.anna, t.c)).view!;
      if (va.outcome) return va;
      const who = va.chooser === 'player' ? 'anna' : 'bruno';
      const vw = who === 'anna' ? va : (await handle({ action: 'pvp_state', match: t.id, game }, t.bruno, t.c)).view!;
      const stat = STATS.find((s) => !vw.usedStats.includes(s.key))!.key;
      await expect(handle({ action: 'pvp_play', match: t.id, game, stat }, players[who === 'anna' ? 'bruno' : 'anna'], t.c)).rejects.toThrow('not_your_turn');
      await handle({ action: 'pvp_play', match: t.id, game, stat }, players[who], t.c);
    }
  }

  it('servono 3 mazzi pronti', async () => {
    const t = setup();
    t.db.profiles.set('carla', { progress: starterProgress(seededRng('c')), version: 1 });
    await expect(handle({ action: 'pvp_create', date: '2026-10-16' }, t.db.as('carla'), t.c)).rejects.toThrow('decks_not_ready');
  });

  it('codice: non puoi entrare nella tua sfida, e un codice sbagliato o scaduto è rifiutato', async () => {
    const t = setup();
    const created = await handle({ action: 'pvp_create', date: '2026-10-16' }, t.anna, t.c);
    await expect(handle({ action: 'pvp_join', code: created.pvp!.code, date: '2026-10-16' }, t.anna, t.c)).rejects.toThrow('own_match');
    await expect(handle({ action: 'pvp_join', code: 'ZZZZZZ', date: '2026-10-16' }, t.bruno, t.c)).rejects.toThrow('bad_code');
    t.tick(16 * 60_000);
    await expect(handle({ action: 'pvp_join', code: created.pvp!.code, date: '2026-10-16' }, t.bruno, t.c)).rejects.toThrow('bad_code');
  });

  it('serie completa: vince chi arriva a 2 partite, ogni partita con il suo mazzo; premi solo alla fine', async () => {
    const t = await startPvp();
    const annaDecks = t.db.profiles.get('anna')!.progress.decks!;
    let game = 0;
    for (;;) {
      const view = await playGame(t, game);
      const ra = await handle({ action: 'pvp_state', match: t.id, game }, t.anna, t.c);
      const rb = await handle({ action: 'pvp_state', match: t.id, game }, t.bruno, t.c);
      expect(ra.pvp!.results[game]).toBe(view.outcome);
      // Bruno vede lo stesso esito, a parti invertite
      expect(rb.pvp!.results[game]).toBe(view.outcome === 'draw' ? 'draw' : view.outcome === 'player' ? 'cpu' : 'player');
      // le card di Anna in questa partita vengono dal suo mazzo N
      expect(view.history.every((h) => annaDecks[game].includes(h.player))).toBe(true);
      if (ra.pvp!.status === 'finished') break;
      expect(ra.rewards).toBeUndefined();
      game++;
      expect(ra.pvp!.game).toBe(game);
    }
    const ra = await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c);
    const rb = await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c);
    const wins = ra.pvp!.results.filter((r) => r === 'player').length;
    const losses = ra.pvp!.results.filter((r) => r === 'cpu').length;
    expect(ra.pvp!.results.length).toBeLessThanOrEqual(3);
    expect(wins >= 2 || losses >= 2 || ra.pvp!.results.length === 3).toBe(true);
    const expected = { player: 10, draw: 5, cpu: 0 } as const;
    expect(ra.rewards!.credits).toBe(expected[ra.pvp!.seriesOutcome!]);
    expect(rb.rewards!.credits).toBe(expected[rb.pvp!.seriesOutcome!]);
    const pa = t.db.profiles.get('anna')!.progress;
    expect(pa.wins + pa.losses + pa.draws).toBe(1); // la serie conta come una partita
  });

  it('tempo scaduto: il server gioca la metrica migliore per chi doveva scegliere', async () => {
    const t = await startPvp();
    const before = (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!;
    t.tick(PVP_TURN_MS - 1000);
    expect((await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c)).view!.round).toBe(before.round);
    t.tick(2000);
    const after = await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c);
    expect(after.view!.round).toBe(before.round + 1);
  });

  it('dopo una mossa i due telefoni sanno da quanto è stata fatta, e il turno dopo parte a fine rivelazione', async () => {
    const t = await startPvp();
    const first = (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!;
    const mover = first.chooser === 'player' ? t.anna : t.bruno;
    const stat = STATS.find((x) => !first.usedStats.includes(x.key))!.key;
    const moved = await handle({ action: 'pvp_play', match: t.id, game: 0, stat }, mover, t.c);
    expect(moved.pvp!.sinceMove).toBe(0);
    t.tick(1200);
    const other = await handle({ action: 'pvp_state', match: t.id }, mover === t.anna ? t.bruno : t.anna, t.c);
    expect(other.pvp!.sinceMove).toBe(1200);
    // il tempo del turno successivo comprende la rivelazione: non scade prima
    t.tick(PVP_REVEAL_MS + PVP_TURN_MS - 2000);
    expect((await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!.round).toBe(1);
  });

  it('chi abbandona perde la serie', async () => {
    const t = await startPvp();
    await handle({ action: 'pvp_quit', match: t.id }, t.bruno, t.c);
    const ra = await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c);
    expect(ra.pvp!.opponentLeft).toBe(true);
    expect(ra.pvp!.seriesOutcome).toBe('player');
    expect(ra.view!.outcome).toBe('player');
    expect(t.db.profiles.get('anna')!.progress.wins).toBe(1);
    expect(t.db.profiles.get('bruno')!.progress.losses).toBe(1);
  });

  it('gli estranei non vedono la sfida', async () => {
    const t = await startPvp();
    await expect(handle({ action: 'pvp_state', match: t.id }, t.db.as('carla'), t.c)).rejects.toThrow('no_match');
  });

  it('amici: si aggiunge chi hai sfidato, si vede chi è online e lo si invita direttamente', async () => {
    const t = await startPvp();
    await handle({ action: 'pvp_quit', match: t.id }, t.bruno, t.c);
    expect((await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).pvp!.opponentIsFriend).toBe(false);
    await handle({ action: 'friend_add', match: t.id }, t.anna, t.c);
    expect((await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).pvp!.opponentIsFriend).toBe(true);
    // amicizia reciproca; online se visto da poco
    await handle({ action: 'ping' }, t.bruno, t.c);
    let list = (await handle({ action: 'friends' }, t.anna, t.c)).friends!;
    expect(list).toEqual([{ id: 'bruno', name: 'Bruno', online: true }]);
    expect((await handle({ action: 'friends' }, t.bruno, t.c)).friends![0].id).toBe('anna');
    t.tick(2 * 60_000);
    list = (await handle({ action: 'friends' }, t.anna, t.c)).friends!;
    expect(list[0].online).toBe(false);
    // invito diretto: Bruno lo vede con il ping e accetta
    const inv = await handle({ action: 'pvp_create', date: '2026-10-16', invite: 'bruno' }, t.anna, t.c);
    const ping = await handle({ action: 'ping' }, t.bruno, t.c);
    expect(ping.invites).toEqual([{ id: inv.pvp!.id, from: 'Anna' }]);
    const acc = await handle({ action: 'pvp_accept', match: inv.pvp!.id, date: '2026-10-16' }, t.bruno, t.c);
    expect(acc.pvp!.status).toBe('playing');
    // non si invita chi non è amico; rifiutare annulla
    await expect(handle({ action: 'pvp_create', date: '2026-10-16', invite: 'carla' }, t.anna, t.c)).rejects.toThrow('not_friend');
    const inv2 = await handle({ action: 'pvp_create', date: '2026-10-16', invite: 'bruno' }, t.anna, t.c);
    await handle({ action: 'pvp_decline', match: inv2.pvp!.id }, t.bruno, t.c);
    expect((await handle({ action: 'pvp_state', match: inv2.pvp!.id }, t.anna, t.c)).pvp!.status).toBe('cancelled');
    await handle({ action: 'friend_remove', friend: 'bruno' }, t.anna, t.c);
    expect((await handle({ action: 'friends' }, t.bruno, t.c)).friends).toEqual([]);
  });
});

describe('server: mazzi salvati', () => {
  it('salva i 3 mazzi (solo card possedute) e lo slot in uso', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const ids = deckIds(p);
    const res = await call(db.store, { action: 'set_decks', decks: [ids, ['card-inventata', ids[0]], []], active: 1 });
    expect(res.progress!.decks).toEqual([ids, [ids[0]], []]);
    expect(res.progress!.activeDeck).toBe(1);
    expect(res.progress!.deck).toEqual([ids[0]]);
  });
});

describe('server: modalità di partita', () => {
  // collezione con tutte le card adatte alla modalità (e qualcuna in più)
  const owning = (cards: typeof ALL_CARDS): Progress => ({
    ...starterProgress(seededRng('m')),
    owned: Object.fromEntries(cards.map((c) => [c.id, 1])),
  });
  const ofRarity = (r: string) => ALL_CARDS.filter((c) => c.rarity === r);

  it('solo una rarità: 7 Oro vanno bene, la CPU gioca con card della stessa rarità', async () => {
    const oro = ofRarity('oro');
    const db = memoryStore(owning([...oro, ...ofRarity('bronzo').slice(0, 7)]));
    const deck = oro.slice(0, 7).map((c) => c.id);
    await expect(call(db.store, { action: 'match_start', deck, daily: false, date: '2026-10-16' })).rejects.toThrow('bad_deck');
    const start = await call(db.store, { action: 'match_start', deck, daily: false, date: '2026-10-16', mode: { kind: 'rarity', rarity: 'oro' } });
    const rec = (await db.store.getMatch(start.match!))!;
    expect(rec.state.cpu.every((id) => CARD_BY_ID.get(id)!.rarity === 'oro')).toBe(true);
    // il mazzo a tema non sostituisce i mazzi salvati
    expect(db.profile!.progress.decks?.flat() ?? []).not.toContain(deck[0]);
    const mixed = [...deck.slice(0, 6), ofRarity('bronzo')[0].id];
    await expect(
      call(db.store, { action: 'match_start', deck: mixed, daily: false, date: '2026-10-16', mode: { kind: 'rarity', rarity: 'oro' } }),
    ).rejects.toThrow('bad_deck');
  });

  it('nazionalità e annata: solo card adatte, modalità sconosciute rifiutate', async () => {
    const it = ALL_CARDS.filter((c) => c.driver.country === 'IT' && c.rarity === 'bronzo');
    const db = memoryStore(owning([...it, ...ofRarity('bronzo').slice(0, 20)]));
    const deck = it.slice(0, 7).map((c) => c.id);
    const start = await call(db.store, { action: 'match_start', deck, daily: false, date: '2026-10-16', mode: { kind: 'nation', country: 'IT' } });
    const rec = (await db.store.getMatch(start.match!))!;
    expect(rec.state.cpu.every((id) => CARD_BY_ID.get(id)!.driver.country === 'IT')).toBe(true);
    await expect(
      call(db.store, { action: 'match_start', deck, daily: false, date: '2026-10-16', mode: { kind: 'nation', country: 'XX' } }),
    ).rejects.toThrow('bad_mode');
    await expect(
      call(db.store, { action: 'match_start', deck, daily: false, date: '2026-10-16', mode: { kind: 'team', team: 'ferrari' } }),
    ).rejects.toThrow('bad_mode');
  });

  it('sfida del giorno: con l\'app nuova il mazzo deve rispettare il tema', async () => {
    const date = '2026-10-16';
    const theme = dailyChallenge(date).theme;
    const pool = themePool(theme);
    const db = memoryStore(owning([...pool, ...ofRarity('bronzo').slice(0, 30)]));
    const off = ofRarity('bronzo').filter((c) => !pool.includes(c)).slice(0, 7).map((c) => c.id);
    await expect(call(db.store, { action: 'match_start', deck: off, daily: true, date, mode: CLASSIC })).rejects.toThrow('bad_deck');
    const p = db.profile!.progress;
    const deck = fillDeck(pool.filter((c) => p.owned[c.id]), [], themeMode(theme)).map((c) => c.id);
    expect(deck).toHaveLength(7);
    await call(db.store, { action: 'match_start', deck, daily: true, date, mode: CLASSIC });
  });
});
