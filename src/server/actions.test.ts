import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CARD_BY_ID, STATS } from '../game/cards';
import { PACK_TYPES, storePrice, teamOfDay } from '../game/shop';
import { starterProgress, withDecks, type Progress } from '../game/collection';
import { autoFillDeck, autoFillDecks, savedDecks } from '../game/collection';
import { dailyChallenge, dailyLoanDeck, seededRng, themeMode, themePool } from '../game/daily';
import { deckProblems, decksProblems } from '../game/deckRules';
import { hashRecoveryCode, usernameOf } from '../game/profile';
import { FIRST_WIN_CREDITS, MATCH_CREDITS, PACK_PRICE } from '../game/collection';
import { CLASSIC, fillDeck } from '../game/deckRules';
import { PVP_REVEAL_MS, PVP_TURN_MS, handle, type AccountRow, type Ctx, type GameRequest, type MatchRecord, type PvpRecord, type Store, type SupportRequestRow } from './actions';

const AVATAR = { skin: 2, hair: 3, hairColor: 1, eyes: 0, eyeColor: 1, brows: 0, mouth: 0, beard: 4, glasses: 0, suit: 0 };
const NEW_PROFILE = { nickname: 'Joaquim', avatar: { ...AVATAR }, favorite: 'lewis-hamilton' };

// database finto in memoria, con gli stessi controlli di versione di quello vero; più utenti
function memoryDb() {
  const profiles = new Map<string, { progress: Progress; version: number }>();
  const matches = new Map<string, MatchRecord>();
  const pvps = new Map<string, { rec: PvpRecord; rev: number }>();
  const seen = new Map<string, number>();
  const names = new Map<string, string | null>();
  const friendships = new Set<string>(); // "a|b"
  // dati del profilo (nickname, avatar…), codici di recupero e profili del vecchio accesso con Google
  const accounts = new Map<string, AccountRow & { recoveryHash: string | null; legacy: number | null }>();
  const links = new Map<string, string>(); // dispositivo → account (accesso con username e codice)
  const playGames = new Map<string, string>(); // giocatore Play Giochi → account
  const support = new Map<string, SupportRequestRow & { device: string }>(); // richieste di aiuto per il codice
  let conflictsToSimulate = 0;
  // l'account di un dispositivo: quello a cui ha fatto l'accesso, oppure il suo (seguendo gli spostamenti)
  const accountOf = (device: string) => {
    let id = links.get(device) ?? device;
    for (let i = 0; i < 5 && accounts.get(id)?.movedTo; i++) id = accounts.get(id)!.movedTo!;
    return id;
  };
  const as = (device: string, name: string | null = device): Store => {
    const id = accountOf(device);
    names.set(id, names.get(id) ?? name);
    return storeOf(id, device, name);
  };
  const storeOf = (id: string, device: string, name: string | null): Store => ({
    me: { id, name },
    device,
    async invitesForMe() {
      return [...pvps].filter(([, m]) => m.rec.invitee === id && m.rec.status === 'waiting').map(([pid, m]) => structuredClone({ id: pid, rec: m.rec }));
    },
    async touch(now) {
      seen.set(id, now);
    },
    async getAccount(uid = id) {
      if (!profiles.has(uid)) return null;
      const a = accounts.get(uid);
      return { nickname: a?.nickname ?? null, avatar: a?.avatar ?? null, favorite: a?.favorite ?? null, movedTo: a?.movedTo ?? null };
    },
    async nicknameTaken(nickname) {
      return [...accounts].some(([k, a]) => k !== id && !a.movedTo && !!a.nickname && usernameOf(a.nickname) === usernameOf(nickname));
    },
    async createProfile(row) {
      if (profiles.has(id) || [...accounts.values()].some((a) => !a.movedTo && a.nickname?.toLowerCase() === row.nickname.toLowerCase())) return false;
      profiles.set(id, { progress: row.progress, version: 1 });
      accounts.set(id, { nickname: row.nickname, avatar: row.avatar, favorite: row.favorite, movedTo: null, recoveryHash: row.recoveryHash, legacy: null });
      names.set(id, row.nickname);
      return true;
    },
    async updateAccount(fields) {
      const a = accounts.get(id) ?? { nickname: null, avatar: null, favorite: null, movedTo: null, recoveryHash: null, legacy: null };
      accounts.set(id, { ...a, ...fields });
      if (fields.nickname) names.set(id, fields.nickname);
    },
    async deleteAccount() {
      // anche le copie da cui l'account è stato recuperato
      const chain = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const [k, a] of accounts) if (a.movedTo && chain.has(a.movedTo) && !chain.has(k)) chain.add(k), (grew = true);
      }
      for (const k of chain) {
        profiles.delete(k);
        accounts.delete(k);
        names.delete(k);
      }
      for (const f of [...friendships]) if (f.split('|').some((x) => chain.has(x))) friendships.delete(f);
      for (const [d, a] of [...links]) if (chain.has(a)) links.delete(d);
      for (const [pl, a] of [...playGames]) if (chain.has(a)) playGames.delete(pl);
    },
    async findByRecovery(hash) {
      const hit = [...accounts].find(([, a]) => !a.movedTo && a.recoveryHash === hash);
      return hit ? { id: hit[0], nickname: hit[1].nickname } : null;
    },
    async isAdmin() {
      return id === 'admin';
    },
    async findByUsername(username) {
      const hit = [...accounts].find(([, a]) => !a.movedTo && !!a.nickname && usernameOf(a.nickname) === username);
      return hit ? { id: hit[0], nickname: hit[1].nickname } : null;
    },
    async setRecoveryHash(account, hash) {
      const a = accounts.get(account);
      if (a) accounts.set(account, { ...a, recoveryHash: hash });
    },
    async createSupportRequest(row) {
      if ([...support.values()].some((r) => r.device === device)) return false;
      const id = `sr-${support.size + 1}`;
      support.set(id, { ...row, id, createdAt: support.size, device });
      return true;
    },
    async listSupportRequests() {
      return [...support.values()].map(({ device: _d, ...r }) => r);
    },
    async takeSupportRequest(rid) {
      const r = support.get(rid);
      if (!r) return null;
      support.delete(rid);
      const { device: _d, ...row } = r;
      return row;
    },
    async linkDevice(account) {
      if (account && account !== device) links.set(device, account);
      else links.delete(device);
    },
    // nei test il "codice" Play Giochi è pg:<id del giocatore>
    async playGamesPlayer(code) {
      return code.startsWith('pg:') ? code.slice(3) : null;
    },
    async findByPlayGames(player) {
      return playGames.get(player) ?? null;
    },
    async setPlayGames(player) {
      if (!playGames.has(player)) playGames.set(player, id);
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
    links,
    profiles,
    accounts,
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
  it('primo accesso: senza profilo il server chiede di crearlo; poi mazzo iniziale', async () => {
    const db = memoryStore();
    const first = await call(db.store, { action: 'sync' });
    expect(first.needsProfile).toBe(true);
    expect(db.profile).toBeNull();
    const { progress, profile, recoveryCode } = await call(db.store, { action: 'profile_create', ...NEW_PROFILE });
    expect(Object.keys(progress!.owned)).toHaveLength(15);
    expect(profile).toEqual({ nickname: 'Joaquim', avatar: AVATAR, favorite: 'lewis-hamilton' });
    expect(recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await call(db.store, { action: 'sync' })).profile!.nickname).toBe('Joaquim');
  });

  it('primo accesso: i progressi del dispositivo vengono importati solo se plausibili', async () => {
    const guest = { ...starterProgress(seededRng('g')), credits: 120, wins: 7 };
    const ok = await call(memoryStore().store, { action: 'profile_create', ...NEW_PROFILE, guest });
    expect(ok.progress!.credits).toBe(120);
    const cheat = { ...guest, credits: 999999, owned: Object.fromEntries(ALL_CARDS.map((c) => [c.id, 1])) };
    const res = await call(memoryStore().store, { action: 'profile_create', ...NEW_PROFILE, guest: cheat });
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
    const db = memoryStore({ ...starterProgress(seededRng('a')), credits: PACK_PRICE + 60 });
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

  it('partita contro la CPU giocata fino in fondo: crediti anche se perdi, bonus alla prima vittoria del giorno', async () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const p = starterProgress(seededRng(seed));
      const db = memoryStore(p);
      const start = await call(db.store, { action: 'match_start', deck: deckIds(p), daily: false, date: '2026-10-16' });
      let view = start.view!;
      let res;
      while (!view.outcome) {
        const stat = view.chooser === 'player' ? STATS.find((s) => !view.usedStats.includes(s.key))!.key : undefined;
        res = await call(db.store, { action: 'match_play', match: start.match!, stat });
        view = res.view!;
      }
      const won = view.outcome === 'player';
      expect(res!.rewards!.firstWin).toBe(won);
      expect(res!.rewards!.credits).toBe(MATCH_CREDITS[view.outcome!] + (won ? FIRST_WIN_CREDITS : 0));
      expect(db.profile!.progress.credits).toBe(p.credits + res!.rewards!.credits);
    }
  });

  it('abbandonare una partita contro la CPU non dà crediti', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const start = await call(db.store, { action: 'match_start', deck: deckIds(p), daily: false, date: '2026-10-16' });
    await call(db.store, { action: 'match_quit', match: start.match! });
    expect(db.profile!.progress.credits).toBe(p.credits);
  });

  it('sfida del giorno con il mazzo in prestito: il mazzo lo decide il server', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const loan = dailyLoanDeck(dailyChallenge('2026-10-16'));
    // le card mandate dal telefono non contano: il server usa il suo mazzo in prestito
    const start = await call(db.store, { action: 'match_start', deck: [], daily: true, date: '2026-10-16', loan: true, mode: CLASSIC });
    expect(loan.map((c) => c.id)).toContain(start.view!.current);
    expect(db.profile!.progress.daily.date).toBe('2026-10-16');
  });

  it('mazzo in prestito: sempre 7 card valide del tema', () => {
    for (let i = 0; i < 120; i++) {
      const date = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      const ch = dailyChallenge(date);
      const loan = dailyLoanDeck(ch);
      expect(loan).toHaveLength(7);
      expect(deckProblems(loan, themeMode(ch.theme))).toEqual([]);
    }
  });

  it('sfida del giorno: una sola al giorno, anche abbandonandola', async () => {
    const p = starterProgress(seededRng('a'));
    const db = memoryStore(p);
    const start = await call(db.store, { action: 'match_start', deck: deckIds(p), daily: true, date: '2026-10-16' });
    await call(db.store, { action: 'match_quit', match: start.match! });
    await expect(call(db.store, { action: 'match_start', deck: deckIds(p), daily: true, date: '2026-10-16' })).rejects.toThrow('daily_played');
  });
});

describe('server: account senza Google (nickname, avatar, pilota preferito)', () => {
  // due vecchi profili del login con Google (Joaquim e Claudia, amici), ciascuno con un codice creato apposta
  async function legacyDb() {
    const db = memoryDb();
    const joaquim = { ...starterProgress(seededRng('j')), credits: 19, wins: 65 };
    const claudia = { ...starterProgress(seededRng('c')), credits: 147, wins: 163 };
    db.profiles.set('google-j', { progress: joaquim, version: 279 });
    db.profiles.set('google-c', { progress: claudia, version: 454 });
    const blank = { nickname: null, avatar: null, favorite: null, movedTo: null, legacy: null };
    db.accounts.set('google-j', { ...blank, recoveryHash: await hashRecoveryCode('JOAQ-UIM1-2345') });
    db.accounts.set('google-c', { ...blank, recoveryHash: await hashRecoveryCode('CLAU-DIA6-7899') });
    db.friendships.add('google-j|google-c').add('google-c|google-j');
    return { db, joaquim, claudia };
  }

  it('le carte del vecchio accesso con Google si riprendono con il loro codice; poi si completa il profilo', async () => {
    const { db, joaquim, claudia } = await legacyDb();
    // un account nuovo senza codice non prende le carte di nessuno
    const stranger = await call(db.as('anon-x'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Marco' });
    expect(stranger.progress!.wins).toBe(0);
    // Joaquim accede con il suo codice (senza nickname basta il codice): il telefono si collega al suo account
    const jo = await call(db.as('anon-j'), { action: 'login', username: 'qualsiasi', code: 'joaq-uim1-2345' });
    expect(jo.account).toBe('google-j');
    expect(jo.progress!.wins).toBe(joaquim.wins);
    expect(Object.keys(jo.progress!.owned).sort()).toEqual(Object.keys(joaquim.owned).sort());
    expect(jo.needsProfile).toBe(true);
    const done = await call(db.as('anon-j'), { action: 'profile_update', nickname: 'Big Eis', avatar: { ...AVATAR }, favorite: 'charles-leclerc' });
    expect(done.profile!.nickname).toBe('Big Eis');
    expect((await call(db.as('anon-j'), { action: 'sync' })).needsProfile).toBe(false);
    // ora serve anche lo username giusto (il nickname minuscolo con _), e il codice resta lo stesso
    await expect(call(db.as('web-j'), { action: 'login', username: 'joaquim', code: 'JOAQ-UIM1-2345' })).rejects.toThrow('bad_login');
    const web = await call(db.as('web-j'), { action: 'login', username: ' Big_EIS ', code: 'JOAQ-UIM1-2345' });
    expect(web.progress!.wins).toBe(joaquim.wins);
    // Claudia con il suo (app vecchia: "recupera" con il solo codice, che non cambia)
    const cl = await call(db.as('anon-c'), { action: 'profile_create', recover: 'CLAU-DIA6-7899' });
    expect(cl.progress!.credits).toBe(claudia.credits);
    expect(cl.recoveryCode).toBe('CLAU-DIA6-7899');
    // gli amici restano quelli: le carte non si spostano, cambiano solo i dispositivi collegati
    expect(db.friendships).toEqual(new Set(['google-j|google-c', 'google-c|google-j']));
    expect((await call(db.as('anon-j'), { action: 'friends' })).friends!.map((f) => f.id)).toEqual(['google-c']);
    // uscita: il dispositivo torna senza account
    await call(db.as('web-j'), { action: 'logout' });
    expect((await call(db.as('web-j'), { action: 'sync' })).needsProfile).toBe(true);
    await expect(call(db.as('anon-j'), { action: 'recovery_new' })).rejects.toThrow('code_permanent');
  });

  it('nickname unico (senza distinguere maiuscole), valido; avatar e pilota controllati', async () => {
    const db = memoryDb();
    await call(db.as('a'), { action: 'profile_create', ...NEW_PROFILE });
    await expect(call(db.as('b'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'joaquim' })).rejects.toThrow('nickname_taken');
    await expect(call(db.as('b'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'x' })).rejects.toThrow('bad_nickname');
    await expect(call(db.as('b'), { action: 'profile_create', ...NEW_PROFILE, nickname: '<script>' })).rejects.toThrow('bad_nickname');
    await expect(
      call(db.as('b'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Bea', avatar: { ...AVATAR, hair: 99 } }),
    ).rejects.toThrow('bad_avatar');
    const ok = await call(db.as('b'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Bea', favorite: 'nessuno' });
    expect(ok.profile!.favorite).toBeNull();
    await expect(call(db.as('b'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Bea2' })).rejects.toThrow('has_profile');
  });

  it('modifica del profilo e accesso da un altro telefono con username e codice', async () => {
    const db = memoryDb();
    const created = await call(db.as('phone-1'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Big Eis' });
    await expect(call(db.as('x'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'big_eis' })).rejects.toThrow('nickname_taken');
    const upd = await call(db.as('phone-1'), { action: 'profile_update', nickname: 'Jojo F1', favorite: 'ayrton-senna' });
    expect(upd.profile).toEqual({ nickname: 'Jojo F1', avatar: AVATAR, favorite: 'ayrton-senna' });
    await expect(call(db.as('phone-2'), { action: 'login', username: 'jojo_f1', code: 'AAAA-BBBB-CCCC' })).rejects.toThrow('bad_login');
    // lo username segue il nickname: quello vecchio non vale più
    await expect(call(db.as('phone-2'), { action: 'login', username: 'big_eis', code: created.recoveryCode! })).rejects.toThrow('bad_login');
    // il codice si può scrivere anche minuscolo e senza trattini
    const code = created.recoveryCode!.toLowerCase().replace(/-/g, '');
    const back = await call(db.as('phone-2'), { action: 'login', username: 'Jojo F1', code });
    expect(back.profile!.nickname).toBe('Jojo F1');
    // stesso account su due telefoni: quello che fa uno si vede sull'altro
    await call(db.as('phone-2'), { action: 'set_decks', decks: [[], [], []], active: 2 });
    expect((await call(db.as('phone-1'), { action: 'sync' })).progress!.activeDeck).toBe(2);
    // il codice non cambia mai: vale ancora anche da un terzo telefono
    await call(db.as('phone-3'), { action: 'login', username: 'jojo_f1', code: created.recoveryCode! });
  });

  it('codice dimenticato: solo l\'amministratore ne crea uno nuovo, e il vecchio non vale più', async () => {
    const db = memoryDb();
    const old = await call(db.as('phone-c'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Claudia' });
    await call(db.as('admin'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Big Eis' });
    expect((await call(db.as('admin'), { action: 'sync' })).admin).toBe(true);
    expect((await call(db.as('phone-c'), { action: 'sync' })).admin).toBeUndefined();
    await expect(call(db.as('phone-c'), { action: 'admin_reset_code', username: 'big_eis' })).rejects.toThrow('forbidden');
    await expect(call(db.as('admin'), { action: 'admin_reset_code', username: 'nessuno' })).rejects.toThrow('no_account');
    const reset = await call(db.as('admin'), { action: 'admin_reset_code', username: ' Claudia ' });
    expect(reset.target).toBe('Claudia');
    expect(reset.recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await expect(call(db.as('phone-new'), { action: 'login', username: 'claudia', code: old.recoveryCode! })).rejects.toThrow('bad_login');
    const back = await call(db.as('phone-new'), { action: 'login', username: 'claudia', code: reset.recoveryCode! });
    expect(back.profile!.nickname).toBe('Claudia');
  });

  it('richiesta di aiuto: il giocatore risponde alle domande, l\'amministratore confronta e approva', async () => {
    const db = memoryDb();
    await call(db.as('phone-c'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Claudia', favorite: 'ayrton-senna' });
    const senna = 'ayrton-senna__career';
    db.profiles.get('phone-c')!.progress.owned[senna] = 1;
    await call(db.as('admin'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Big Eis' });
    const answers = { favorite: 'ayrton-senna', card: 'Senna carriera', wins: 3, avatar: 'capelli lunghi', note: '' };
    // risposte e email controllate; una sola richiesta in attesa per telefono
    await expect(call(db.as('new-phone'), { action: 'support_request', username: 'claudia', email: 'non-una-mail', answers })).rejects.toThrow('bad_email');
    await expect(call(db.as('new-phone'), { action: 'support_request', username: 'claudia', email: 'c@mail.it', answers: { favorite: null, card: '', wins: null, avatar: '', note: '' } })).rejects.toThrow('support_empty');
    await call(db.as('new-phone'), { action: 'support_request', username: ' Claudia ', email: 'c@mail.it', answers });
    await expect(call(db.as('new-phone'), { action: 'support_request', username: 'claudia', email: 'c@mail.it', answers })).rejects.toThrow('support_pending');
    // solo l'amministratore vede le richieste, con i dati veri dell'account accanto
    await expect(call(db.as('phone-c'), { action: 'support_list' })).rejects.toThrow('forbidden');
    const [req] = (await call(db.as('admin'), { action: 'support_list' })).supportRequests!;
    expect(req.username).toBe('claudia');
    expect(req.account!.favorite).toBe('ayrton-senna');
    expect(req.account!.rareCards[0]).toMatchObject({ id: senna, match: true });
    // approvata: nuovo codice e l'email a cui mandarlo; la richiesta sparisce
    const ok = await call(db.as('admin'), { action: 'support_resolve', id: req.id, approve: true });
    expect(ok.email).toBe('c@mail.it');
    expect(ok.username).toBe('claudia');
    expect((await call(db.as('admin'), { action: 'support_list' })).supportRequests).toEqual([]);
    expect((await call(db.as('new-phone'), { action: 'login', username: 'claudia', code: ok.recoveryCode! })).profile!.nickname).toBe('Claudia');
    // una richiesta rifiutata non cambia il codice
    await call(db.as('other'), { action: 'support_request', username: 'claudia', email: 'x@mail.it', answers });
    const [bad] = (await call(db.as('admin'), { action: 'support_list' })).supportRequests!;
    const no = await call(db.as('admin'), { action: 'support_resolve', id: bad.id, approve: false });
    expect(no.recoveryCode).toBeUndefined();
    await call(db.as('third'), { action: 'login', username: 'claudia', code: ok.recoveryCode! });
  });
});

describe('server: sfida tra amici (al meglio di 3)', () => {
  // profilo con i 3 mazzi salvati e validi
  const ready = (seed: string) => {
    const p = starterProgress(seededRng(seed));
    const decks = autoFillDecks(p, seededRng(seed)).map((d) => d.map((c) => c.id));
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
    // più il premio della prima vittoria del giorno, per chi vince
    const bonus = (r: typeof ra) => (r.rewards!.firstWin ? FIRST_WIN_CREDITS : 0);
    expect(ra.rewards!.credits).toBe(expected[ra.pvp!.seriesOutcome!] + bonus(ra));
    expect(rb.rewards!.credits).toBe(expected[rb.pvp!.seriesOutcome!] + bonus(rb));
    const pa = t.db.profiles.get('anna')!.progress;
    expect(pa.wins + pa.losses + pa.draws).toBe(1); // la serie conta come una partita
  });

  it('tempo scaduto: la scelta passa all\'avversario; se scade anche il suo, il server gioca la metrica migliore', async () => {
    const t = await startPvp();
    const before = (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!;
    t.tick(PVP_TURN_MS - 1000);
    expect((await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c)).view!.round).toBe(before.round);
    t.tick(2000);
    const passed = (await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c)).view!;
    expect(passed.round).toBe(before.round);
    expect(passed.passed).toBe(true);
    // Bruno vede la partita "dal suo lato": prima sceglieva Anna (cpu per lui), ora sceglie lui, o viceversa
    const annaView = (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!;
    expect(annaView.chooser).not.toBe(before.chooser);
    t.tick(PVP_TURN_MS + 1000);
    const after = await handle({ action: 'pvp_state', match: t.id }, t.bruno, t.c);
    expect(after.view!.round).toBe(before.round + 1);
    expect(after.view!.passed).toBeUndefined();
  });

  it('chi lascia scadere il tempo passa la scelta all\'amico (una volta per round)', async () => {
    const t = await startPvp();
    const first = (await handle({ action: 'pvp_state', match: t.id }, t.anna, t.c)).view!;
    const [chooser, waiter] = first.chooser === 'player' ? [t.anna, t.bruno] : [t.bruno, t.anna];
    await expect(handle({ action: 'pvp_pass', match: t.id, game: 0 }, waiter, t.c)).rejects.toThrow('not_your_turn');
    const res = await handle({ action: 'pvp_pass', match: t.id, game: 0 }, chooser, t.c);
    expect(res.view!.chooser).toBe('cpu');
    expect(res.view!.passed).toBe(true);
    const other = (await handle({ action: 'pvp_state', match: t.id }, waiter, t.c)).view!;
    expect(other.chooser).toBe('player');
    await expect(handle({ action: 'pvp_pass', match: t.id, game: 0 }, waiter, t.c)).rejects.toThrow('not_your_turn');
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
    expect(list).toEqual([{ id: 'bruno', name: 'Bruno', avatar: null, online: true }]);
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

describe('server: mazzi diversi ed eliminazione account', () => {
  it('i 3 mazzi devono restare diversi; si accettano i passi che sistemano mazzi già troppo simili', async () => {
    const db = memoryDb();
    const p = starterProgress(seededRng('decks'));
    db.profiles.set('me', { progress: p, version: 1 });
    const me = db.as('me');
    const good = autoFillDecks(p, seededRng('fill')).map((d) => d.map((c) => c.id));
    expect(decksProblems(savedDecks(withDecks(p, good, 0)))).toEqual([]);
    const same = [good[0], good[0], []];
    await expect(call(me, { action: 'set_decks', decks: same, active: 0 })).rejects.toThrow('decks_similar');
    await call(me, { action: 'set_decks', decks: good, active: 0 });
    // mazzi vecchi troppo simili (salvati prima della regola): togliere card è permesso anche se non basta ancora
    db.profiles.set('me', { progress: withDecks(p, [good[0], good[0], good[0]], 0), version: 2 });
    await call(me, { action: 'set_decks', decks: [good[0], good[0].slice(0, 3), good[0]], active: 0 });
    // i mazzi vecchi si possono ancora giocare (l'app aggiornata chiede prima di sistemarli)…
    await call(me, { action: 'match_start', deck: good[0], daily: false, slot: 0, date: ctx.today, mode: CLASSIC });
    // …ma una partita non può rendere i mazzi più simili
    db.profiles.set('me', { progress: withDecks(p, good, 0), version: 9 });
    await expect(
      call(me, { action: 'match_start', deck: good[1], daily: false, slot: 0, date: ctx.today, mode: CLASSIC }),
    ).rejects.toThrow('decks_similar');
  });

  it('eliminazione: sparisce l’account con i dispositivi collegati, gli altri restano', async () => {
    const db = memoryDb();
    const created = await call(db.as('phone-1'), { action: 'profile_create', ...NEW_PROFILE });
    await call(db.as('phone-2'), { action: 'login', username: 'joaquim', code: created.recoveryCode! });
    await call(db.as('claudia'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Claudia' });
    db.friendships.add('phone-1|claudia').add('claudia|phone-1');
    await expect(call(db.as('phone-2'), { action: 'account_delete' } as unknown as GameRequest)).rejects.toThrow('bad_request');
    expect((await call(db.as('phone-2'), { action: 'account_delete', confirm: true })).deleted).toBe(true);
    expect(db.profiles.has('phone-1')).toBe(false);
    expect(db.profiles.has('phone-2')).toBe(false);
    expect(db.profiles.has('claudia')).toBe(true);
    expect([...db.friendships]).toEqual([]);
    expect((await call(db.as('phone-2'), { action: 'sync' })).needsProfile).toBe(true);
    // il nickname torna libero
    await call(db.as('phone-3'), { action: 'profile_create', ...NEW_PROFILE });
  });
});

describe('server: tempo scaduto contro la CPU', () => {
  it('la scelta passa alla CPU, che gioca il round; una volta sola per round', async () => {
    const p = starterProgress(seededRng('pass'));
    const db = memoryStore(p);
    const start = await call(db.store, { action: 'match_start', deck: deckIds(p), daily: false, date: ctx.today });
    expect(start.view!.chooser).toBe('player');
    const passed = await call(db.store, { action: 'match_pass', match: start.match! });
    expect(passed.view!.chooser).toBe('cpu');
    expect(passed.view!.passed).toBe(true);
    await expect(call(db.store, { action: 'match_pass', match: start.match! })).rejects.toThrow('not_your_turn');
    const played = await call(db.store, { action: 'match_play', match: start.match! });
    expect(played.view!.round).toBe(1);
    expect(played.view!.history[0].chooser).toBe('cpu');
    expect(played.view!.passed).toBeUndefined();
  });
});

describe('server: rientro con Play Giochi', () => {
  it('il primo accesso collega Play Giochi all\'account; su un telefono nuovo si rientra da soli', async () => {
    const db = memoryDb();
    // telefono nuovo, nessun account: Play Giochi non è ancora collegato a niente
    expect((await call(db.as('phone-1'), { action: 'play_games', code: 'pg:p1' })).playGames).toBe('unlinked');
    await call(db.as('phone-1'), { action: 'profile_create', ...NEW_PROFILE });
    expect((await call(db.as('phone-1'), { action: 'play_games', code: 'pg:p1' })).playGames).toBe('linked');
    // altro telefono (o app reinstallata): stesso giocatore Play Giochi → stesso account, con le sue carte
    const back = await call(db.as('phone-2'), { action: 'play_games', code: 'pg:p1' });
    expect(back.playGames).toBe('signed_in');
    expect(back.profile!.nickname).toBe('Joaquim');
    expect((await call(db.as('phone-2'), { action: 'sync' })).account).toBe(back.account);
    // un dispositivo che ha già un suo account non viene spostato
    await call(db.as('phone-3'), { action: 'profile_create', ...NEW_PROFILE, nickname: 'Altro' });
    expect((await call(db.as('phone-3'), { action: 'play_games', code: 'pg:p1' })).playGames).toBe('other');
    // codice non valido
    await expect(call(db.as('phone-4'), { action: 'play_games', code: 'falso' })).rejects.toThrow('bad_play_games');
  });
});
