import type { MatchMode } from '../game/deckRules';
import type { StatKey } from '../types';
import type { Progress } from '../game/collection';
import type { MatchOutcome, Side } from '../game/engine';
import type { MatchRewards, MatchView, StoredMatch } from '../game/match';
import type { PackKind } from '../game/shop';
import type { Avatar, PlayerProfile } from '../game/profile';

// Tipi condivisi tra la logica del server, il database (Store) e il telefono.

export type GameRequest =
  | { action: 'sync'; guest?: Partial<Progress> }
  // account senza Google: profilo con nickname, avatar e pilota preferito
  // (recover: app vecchie, accesso con il solo codice)
  | { action: 'profile_create'; nickname?: string; avatar?: Avatar; favorite?: string | null; guest?: Partial<Progress>; recover?: string }
  | { action: 'profile_update'; nickname?: string; avatar?: Avatar; favorite?: string | null }
  // accesso da un altro dispositivo: username (il nickname) e codice di recupero (la password)
  | { action: 'login'; username: string; code: string }
  | { action: 'logout' }
  | { action: 'recovery_new' }
  | { action: 'account_delete'; confirm: true }
  | { action: 'set_deck'; deck: string[] }
  | { action: 'set_decks'; decks: string[][]; active: number }
  | { action: 'open_pack'; date?: string }
  | { action: 'buy_pack'; kind?: PackKind; date?: string }
  | { action: 'store'; date: string }
  | { action: 'buy_store'; card: string; date: string }
  | { action: 'use_jolly'; card: string }
  | { action: 'claim_mission'; index: number; date: string }
  | { action: 'match_start'; deck: string[]; daily: boolean; date: string; slot?: number; mode?: MatchMode; loan?: boolean }
  | { action: 'match_play'; match: string; stat?: StatKey }
  | { action: 'match_pass'; match: string } // tempo scaduto: sceglie la CPU
  | { action: 'match_quit'; match: string }
  // sfida tra amici (al meglio di 3, con i 3 mazzi salvati)
  | { action: 'pvp_create'; date: string; invite?: string }
  | { action: 'pvp_join'; code: string; date: string }
  | { action: 'pvp_accept'; match: string; date: string }
  | { action: 'pvp_decline'; match: string }
  | { action: 'pvp_state'; match: string; game?: number }
  | { action: 'pvp_play'; match: string; game: number; stat: StatKey }
  | { action: 'pvp_pass'; match: string; game: number } // tempo scaduto: sceglie l'amico
  | { action: 'pvp_quit'; match: string }
  // amici e presenza online
  | { action: 'ping' }
  | { action: 'friends' }
  | { action: 'friend_add'; match: string }
  | { action: 'friend_remove'; friend: string };

export type PvpStatus = 'waiting' | 'playing' | 'finished' | 'cancelled';
export type Outcome = Exclude<MatchOutcome, null>;

// Sfida tra amici salvata sul server, "vista dall'host": player = host, cpu = ospite.
export interface PvpRecord {
  code: string;
  status: PvpStatus;
  host: string;
  hostName: string | null;
  hostDecks: string[][];
  hostDate: string;
  invitee: string | null; // amico invitato direttamente (oltre al codice)
  guest: string | null;
  guestName: string | null;
  guestDecks: string[][] | null;
  guestDate: string | null;
  games: StoredMatch[]; // le partite della serie; l'ultima è quella in corso
  results: Outcome[]; // esito delle partite finite, dal punto di vista dell'host
  deadline: number | null; // entro quando deve scegliere chi è di turno (ms)
  movedAt?: number; // quando è stata fatta l'ultima mossa (ms)
  forfeit: Side | null; // chi ha abbandonato
  rewards: { host?: MatchRewards; guest?: MatchRewards };
  createdAt: number;
}

// cosa sa il telefono della sfida
export interface PvpInfo {
  id: string;
  code: string;
  status: PvpStatus;
  opponent: string | null;
  invited: boolean; // sfida a un amico (in attesa che accetti)
  game: number; // partita in corso (0, 1, 2)
  results: Outcome[]; // esiti delle partite finite, dal tuo punto di vista
  seriesOutcome: Outcome | null; // esito della serie, quando è finita
  timeLeft: number | null; // ms prima della scelta automatica
  sinceMove: number | null; // ms dall'ultima mossa: i due telefoni passano alla carta successiva insieme
  opponentLeft: boolean;
  opponentIsFriend: boolean;
}

export interface Friend {
  id: string;
  name: string | null;
  avatar?: Avatar | null;
  online: boolean;
}

export interface Invite {
  id: string;
  from: string | null;
}

export interface PackResult {
  added: { card: string; duplicate: boolean; credits: number }[];
  unlockedCareers: string[];
  jolly: boolean;
}

export interface GameResponse {
  progress?: Progress;
  pack?: PackResult;
  unlockedCareers?: string[];
  credits?: number;
  match?: string;
  view?: MatchView;
  rewards?: MatchRewards;
  pvp?: PvpInfo;
  friends?: Friend[];
  invites?: Invite[];
  profile?: PlayerProfile; // il tuo profilo (nickname, avatar, pilota preferito)
  needsProfile?: boolean; // nessun profilo: va creato
  recoveryCode?: string; // codice di recupero appena creato (si mostra una volta sola)
  deleted?: boolean; // account eliminato
  account?: string; // id dell'account (per gli avvisi istantanei), anche quando il dispositivo vi ha fatto l'accesso
}

// dati del profilo salvati accanto alla progressione
export interface AccountRow {
  nickname: string | null;
  avatar: Avatar | null;
  favorite: string | null;
  movedTo: string | null; // profilo spostato su un altro account
}

export interface MatchRecord {
  state: StoredMatch;
  daily: boolean;
  date: string;
  finished: boolean;
}

export interface Store {
  // me: l'account di gioco; device: l'utente (anonimo) del dispositivo, collegato all'account con l'accesso
  me: { id: string; name: string | null };
  device: string;
  // profilo di chi fa la richiesta, oppure di un altro giocatore (uid) per i premi della sfida tra amici
  getProfile(uid?: string): Promise<{ progress: Partial<Progress>; version: number } | null>;
  // salva solo se nessun altro l'ha cambiato nel frattempo (version); prevVersion null = nuovo profilo
  putProfile(progress: Progress, prevVersion: number | null, uid?: string): Promise<boolean>;
  getMatch(id: string): Promise<MatchRecord | null>;
  createMatch(rec: MatchRecord): Promise<string>;
  // aggiorna solo se il round salvato è ancora `expectedRound` (evita doppi invii)
  updateMatch(id: string, rec: MatchRecord, expectedRound: number): Promise<boolean>;
  getPvp(id: string): Promise<{ rec: PvpRecord; rev: number } | null>;
  // solo sfide ancora in attesa dell'avversario
  findPvpByCode(code: string): Promise<{ id: string; rec: PvpRecord; rev: number } | null>;
  // sfide in attesa a cui sono stato invitato
  invitesForMe(): Promise<{ id: string; rec: PvpRecord }[]>;
  // null se il codice è già usato da un'altra sfida in attesa
  createPvp(rec: PvpRecord): Promise<string | null>;
  // salva solo se la sfida non è cambiata nel frattempo (rev)
  updatePvp(id: string, rec: PvpRecord, rev: number): Promise<boolean>;
  // profilo dell'account (nickname, avatar, pilota preferito)
  getAccount(uid?: string): Promise<AccountRow | null>;
  // username già usato da un altro account (il nickname, minuscolo e con _ al posto degli spazi)
  nicknameTaken(nickname: string): Promise<boolean>;
  // nuovo profilo per chi fa la richiesta; false se esiste già o il nickname è stato preso nel frattempo
  createProfile(row: { progress: Progress; nickname: string; avatar: Avatar; favorite: string | null; recoveryHash: string }): Promise<boolean>;
  updateAccount(fields: { nickname?: string; avatar?: Avatar; favorite?: string | null; recoveryHash?: string }): Promise<void>;
  // account (non spostato) con questo codice di recupero
  findByRecovery(hash: string): Promise<{ id: string; nickname: string | null } | null>;
  // collega il dispositivo all'account (accesso) o lo scollega (null: uscita)
  linkDevice(account: string | null): Promise<void>;
  // elimina l'account e tutto ciò che gli appartiene (anche le copie dei profili da cui era stato recuperato
  // e i dispositivi collegati): carte, progressi, amicizie, partite
  deleteAccount(): Promise<void>;
  // presenza: "visto adesso"
  touch(now: number): Promise<void>;
  // amici, con il nome e l'ultima volta che sono stati visti (ms)
  listFriends(): Promise<{ id: string; name: string | null; avatar?: Avatar | null; lastSeen: number | null }[]>;
  isFriend(other: string): Promise<boolean>;
  addFriend(other: string): Promise<void>; // amicizia reciproca
  removeFriend(other: string): Promise<void>;
}
