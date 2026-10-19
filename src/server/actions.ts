import { PLAYABLE_CARDS, STATS } from '../game/cards';
import {
  buyPack,
  mergeProgress,
  normalizeProgress,
  openPack,
  spendJolly,
  starterProgress,
  withDecks,
  deckSlots,
  type Progress,
} from '../game/collection';
import { claimMission, dailyChallenge, dailyLoanDeck, dailyPlayed, missionsAfterPack, missionsFor, startDaily, themeMode } from '../game/daily';
import { CLASSIC, fitsMode, parseMode } from '../game/deckRules';
import { buildCpuDeck, cpuChooseStat, isAvailable, matchOutcome, newMatch, playRound, type Rng } from '../game/engine';
import { applyMatchEnd, loadMatch, storeMatch, toView, type MatchRewards, type MatchView, type StoredMatch } from '../game/match';
import type { StatKey } from '../types';
import { cardOrThrow, checkDate, GameError, validDeck, withProfile, type Ctx } from './common';
import { handlePvp } from './pvp';
import { buyAndOpen, buyFromStore, storeFor, storePrice } from '../game/shop';
import type { AccountRow, GameRequest, GameResponse, Store } from './types';
import { cleanNickname, hashRecoveryCode, newRecoveryCode, parseAvatar, validFavorite, type PlayerProfile } from '../game/profile';

export * from './types';
export { GameError, type Ctx } from './common';
export { PVP_TURN_MS, PVP_REVEAL_MS, NEXT_GAME_MS, PVP_CODE_TTL_MS, ONLINE_MS, normalizeCode, seriesState } from './pvp';

/*
 * Logica del server ("arbitro"). È separata dal database (vedi `Store`) così si può provare con i test.
 * Il telefono chiede un'azione, il server la controlla, la esegue con le regole del gioco e salva.
 * Il telefono non può più modificare da solo collezione, crediti o risultati.
 * La sfida tra amici e gli amici sono in pvp.ts.
 */

// Progressi portati dal telefono: accettati solo se plausibili (null altrimenti).
export function plausibleDevice(guest: Partial<Progress> | undefined): Progress | null {
  if (!guest || typeof guest !== 'object') return null;
  try {
    const p = normalizeProgress(guest);
    const ok =
      Object.keys(p.owned).length <= 150 &&
      Object.values(p.owned).every((n) => Number.isInteger(n) && n >= 1 && n <= 50) &&
      p.credits >= 0 && p.credits <= 1000 &&
      p.packs >= 0 && p.packs <= 20 &&
      p.jolly >= 0 && p.jolly <= 5 &&
      p.wins >= 0 && p.wins <= 500;
    return ok ? { ...p, missions: undefined } : null;
  } catch {
    return null;
  }
}

// primo accesso in assoluto: progressi del telefono (se plausibili) o mazzo iniziale
export const acceptGuest = (guest: Partial<Progress> | undefined, rng: Rng): Progress =>
  plausibleDevice(guest) ?? starterProgress(rng);

// Versione 0 = profilo salvato dalla vecchia app (prima che decidesse il server).
export const LEGACY_VERSION = 0;

// profilo da mandare al telefono (null se l'account non l'ha ancora creato)
const profileOf = (a: AccountRow | null): PlayerProfile | undefined =>
  a?.nickname && a.avatar ? { nickname: a.nickname, avatar: a.avatar, favorite: a.favorite } : undefined;

export async function handle(req: GameRequest, store: Store, ctx: Ctx): Promise<GameResponse> {
  const pvp = await handlePvp(req, store, ctx);
  if (pvp) return pvp;
  switch (req.action) {
    case 'sync': {
      const row = await store.getProfile();
      const account = row ? await store.getAccount() : null;
      if (account?.movedTo) throw new GameError('account_moved', 409); // le carte sono passate a un altro account
      if (row && row.version === LEGACY_VERSION) {
        // passaggio dalla vecchia app: un'ultima volta si uniscono i dati del telefono a quelli online
        // (come faceva la vecchia app), poi decide solo il server
        const server = normalizeProgress(row.progress);
        const device = plausibleDevice(req.guest);
        const merged = device ? mergeProgress(server, device) : server;
        const progress = { ...merged, updatedAt: Date.now() };
        const saved = (await store.putProfile(progress, row.version)) ? progress : normalizeProgress((await store.getProfile())!.progress);
        return { progress: saved, profile: profileOf(account), needsProfile: !profileOf(account) };
      }
      // profilo ripreso con il codice ma ancora senza nickname e avatar: il telefono li fa completare
      if (row) return { progress: normalizeProgress(row.progress), profile: profileOf(account), needsProfile: !profileOf(account) };
      // nessun profilo: il telefono chiede nickname, avatar e pilota preferito (profile_create)
      return { needsProfile: true };
    }

    case 'profile_create': {
      if (await store.getProfile()) throw new GameError('has_profile', 409);
      const nickname = req.nickname === undefined ? null : cleanNickname(req.nickname);
      if (req.nickname !== undefined && !nickname) throw new GameError('bad_nickname');
      const avatar = req.avatar === undefined ? null : parseAvatar(req.avatar);
      if (req.avatar !== undefined && !avatar) throw new GameError('bad_avatar');
      const favorite = validFavorite(req.favorite);
      if (!req.recover && (!nickname || !avatar)) throw new GameError('bad_nickname');
      if (nickname && (await store.nicknameTaken(nickname))) throw new GameError('nickname_taken', 409);
      const recoveryCode = newRecoveryCode();
      const recoveryHash = await hashRecoveryCode(recoveryCode);
      // con il codice di recupero si riprende un account (nuovo telefono, o le carte del vecchio accesso con Google);
      // altrimenti profilo nuovo, dai progressi del dispositivo (se plausibili) o dal mazzo iniziale
      const from = req.recover ? await store.findByRecovery(await hashRecoveryCode(req.recover)) : null;
      if (req.recover && !from) throw new GameError('bad_recovery', 404);
      if (from) {
        if (!(await store.transferProfile(from, { nickname, avatar, favorite, recoveryHash }))) throw new GameError('busy', 409);
      } else {
        if (!nickname || !avatar) throw new GameError('bad_nickname');
        const progress = { ...acceptGuest(req.guest, ctx.rng), updatedAt: Date.now() };
        if (!(await store.createProfile({ progress, nickname, avatar, favorite, recoveryHash }))) {
          throw new GameError((await store.nicknameTaken(nickname)) ? 'nickname_taken' : 'has_profile', 409);
        }
      }
      const row = await store.getProfile();
      if (!row) throw new GameError('busy', 409);
      const profile = profileOf(await store.getAccount());
      // account ripreso senza nickname (vecchio accesso con Google): il telefono lo fa completare
      return { progress: normalizeProgress(row.progress), profile, needsProfile: !profile, recoveryCode };
    }

    case 'profile_update': {
      const account = await store.getAccount();
      if (!account) throw new GameError('no_profile', 409);
      const fields: { nickname?: string; avatar?: NonNullable<AccountRow['avatar']>; favorite?: string | null } = {};
      if (req.nickname !== undefined) {
        const nickname = cleanNickname(req.nickname);
        if (!nickname) throw new GameError('bad_nickname');
        if (nickname.toLowerCase() !== account.nickname?.toLowerCase() && (await store.nicknameTaken(nickname)))
          throw new GameError('nickname_taken', 409);
        fields.nickname = nickname;
      }
      if (req.avatar !== undefined) {
        const avatar = parseAvatar(req.avatar);
        if (!avatar) throw new GameError('bad_avatar');
        fields.avatar = avatar;
      }
      if (req.favorite !== undefined) fields.favorite = validFavorite(req.favorite);
      await store.updateAccount(fields);
      return { profile: profileOf(await store.getAccount()) };
    }

    case 'recovery_new': {
      // nuovo codice di recupero (quello vecchio non vale più)
      if (!(await store.getProfile())) throw new GameError('no_profile', 409);
      const recoveryCode = newRecoveryCode();
      await store.updateAccount({ recoveryHash: await hashRecoveryCode(recoveryCode) });
      return { recoveryCode };
    }

    case 'set_decks':
      return withProfile(store, ctx, (p) => ({ progress: withDecks(p, Array.isArray(req.decks) ? req.decks : [], req.active) }));

    case 'set_deck':
      return withProfile(store, ctx, (p) => {
        const deck = (Array.isArray(req.deck) ? req.deck : []).filter((id) => typeof id === 'string' && p.owned[id]).slice(0, STATS.length);
        return { progress: { ...p, deck } };
      });

    case 'open_pack': {
      // giorno del telefono (per le missioni), se plausibile
      const day = req.date ?? ctx.today;
      checkDate(day, ctx.today);
      return withProfile(store, ctx, (p) => {
        const res = openPack(p, ctx.rng);
        if (!res) throw new GameError('no_packs');
        return {
          progress: { ...res.progress, missions: missionsAfterPack(missionsFor(res.progress.missions, res.progress.owned, day)) },
          pack: {
            added: res.added.map((a) => ({ card: a.card.id, duplicate: a.duplicate, credits: a.credits })),
            unlockedCareers: res.unlockedCareers.map((c) => c.id),
            jolly: !!res.jolly,
          },
        };
      });
    }

    case 'buy_pack': {
      // Classico: va tra i pacchetti da aprire. Premium e Scuderia: si aprono subito.
      if (!req.kind || req.kind === 'classic')
        return withProfile(store, ctx, (p) => {
          const next = buyPack(p);
          if (!next) throw new GameError('not_enough_credits');
          return { progress: next };
        });
      const kind = req.kind;
      if (kind !== 'premium' && kind !== 'team') throw new GameError('unknown_pack');
      const day = req.date ?? ctx.today;
      checkDate(day, ctx.today);
      return withProfile(store, ctx, (p) => {
        const res = buyAndOpen(p, kind, day, ctx.rng);
        if (!res) throw new GameError('not_enough_credits');
        return {
          progress: { ...res.progress, missions: missionsAfterPack(missionsFor(res.progress.missions, res.progress.owned, day)) },
          pack: {
            added: res.added.map((a) => ({ card: a.card.id, duplicate: a.duplicate, credits: a.credits })),
            unlockedCareers: res.unlockedCareers.map((c) => c.id),
            jolly: !!res.jolly,
          },
        };
      });
    }

    case 'store': {
      // le card del giorno: si scelgono la prima volta che si apre il negozio e restano fisse
      checkDate(req.date, ctx.today);
      const row = await store.getProfile();
      if (!row) throw new GameError('no_profile', 409);
      const current = normalizeProgress(row.progress);
      if (current.store?.date === req.date) return { progress: current };
      return withProfile(store, ctx, (p) => ({ progress: { ...p, store: storeFor(p.store, p.owned, req.date) } }));
    }

    case 'buy_store': {
      checkDate(req.date, ctx.today);
      const card = cardOrThrow(req.card);
      return withProfile(store, ctx, (p) => {
        const res = buyFromStore(p, card.id, req.date);
        if (!res) throw new GameError(p.credits < storePrice(card) ? 'not_enough_credits' : 'cannot_buy');
        return { progress: res.progress, unlockedCareers: res.unlockedCareers.map((c) => c.id) };
      });
    }

    case 'use_jolly': {
      const card = cardOrThrow(req.card);
      return withProfile(store, ctx, (p) => {
        const res = spendJolly(p, card);
        if (!res) throw new GameError('cannot_use_jolly');
        return { progress: res.progress, unlockedCareers: res.unlockedCareers.map((c) => c.id) };
      });
    }

    case 'claim_mission':
      checkDate(req.date, ctx.today);
      return withProfile(store, ctx, (p) => {
        const missions = missionsFor(p.missions, p.owned, req.date);
        const { missions: next, credits } = claimMission(missions, req.index);
        if (!credits) throw new GameError('mission_not_ready');
        return { progress: { ...p, missions: next, credits: p.credits + credits }, credits };
      });

    case 'match_start': {
      checkDate(req.date, ctx.today);
      let view: MatchView | null = null;
      let stored: StoredMatch | null = null;
      // Modalità: la manda solo l'app aggiornata. Per la sfida del giorno la decide il server dal tema;
      // le versioni vecchie dell'app (senza modalità) giocano con le regole classiche.
      const sent = req.mode !== undefined;
      const daily = req.daily ? dailyChallenge(req.date) : null;
      const mode = daily ? (sent ? themeMode(daily.theme) : CLASSIC) : sent ? parseMode(req.mode) : CLASSIC;
      if (!mode) throw new GameError('bad_mode');
      const res = await withProfile(store, ctx, (p) => {
        const ids = Array.isArray(req.deck) ? req.deck : [];
        // sfida del giorno senza abbastanza card del tema: mazzo in prestito, deciso dal server
        const deck = daily && req.loan ? dailyLoanDeck(daily) : validDeck(ids, p, mode);
        if (daily && dailyPlayed(p.daily, req.date)) throw new GameError('daily_played');
        const pool = PLAYABLE_CARDS.filter((c) => fitsMode(mode, c));
        const cpu = daily ? daily.cpuDeck : buildCpuDeck(deck, ctx.rng, pool);
        const state = newMatch(deck, cpu, ctx.rng);
        view = toView(state);
        stored = storeMatch(state); // la partita si crea dopo aver salvato il profilo
        // il mazzo si ricorda solo nella partita classica (gli altri sono mazzi a tema, da una volta)
        const slot = req.slot ?? p.activeDeck ?? 0;
        const decks = mode.kind === 'classic' ? withDecks(p, deckSlots(p).map((d, i) => (i === slot ? ids : d)), slot) : p;
        return {
          progress: { ...decks, daily: daily ? startDaily(p.daily, req.date) : p.daily },
        };
      });
      const matchId = await store.createMatch({ state: stored!, daily: !!req.daily, date: req.date, finished: false });
      return { ...res, match: matchId, view: view! };
    }

    case 'match_play': {
      const rec = await store.getMatch(req.match);
      if (!rec) throw new GameError('no_match', 404);
      if (rec.finished) throw new GameError('match_finished');
      const state = loadMatch(rec.state);
      if (matchOutcome(state)) throw new GameError('match_finished');
      let stat: StatKey;
      if (state.chooser === 'player') {
        if (!req.stat || !STATS.some((s) => s.key === req.stat) || !isAvailable(state, req.stat)) throw new GameError('bad_stat');
        stat = req.stat;
      } else stat = cpuChooseStat(state); // la CPU sceglie sul server: il telefono non vede le sue carte
      const next = playRound(state, stat);
      const finished = !!matchOutcome(next);
      const ok = await store.updateMatch(req.match, { ...rec, state: storeMatch(next), finished }, state.round);
      if (!ok) throw new GameError('busy', 409);
      if (!finished) return { view: toView(next) };
      let rewards: MatchRewards | undefined;
      const res = await withProfile(store, ctx, (p) => {
        const end = applyMatchEnd(p, next, rec.date, { daily: rec.daily });
        rewards = end.rewards;
        return { progress: end.progress };
      });
      return { ...res, view: toView(next), rewards };
    }

    case 'match_quit': {
      const rec = await store.getMatch(req.match);
      if (rec && !rec.finished) await store.updateMatch(req.match, { ...rec, finished: true }, rec.state.round);
      return {};
    }

    default:
      throw new GameError('unknown_action');
  }
}
