import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { Gift, Layers, Settings, SquareStack, Swords, UserPlus } from "lucide-react";
import type { Card } from "./types";
import {
  WINS_PER_PACK,
  buyPack,
  DECK_SLOTS,
  autoFillDeck,
  autoFillDecks,
  otherDecks,
  savedDecks,
  deckSlots,
  loadProgress,
  savedDeck,
  activeSlot,
  ownedCards,
  seriesDecks,
  withDecks,
  openPack,
  resetProgress,
  saveProgress,
  spendJolly,
  starterProgress,
  type Progress,
} from "./game/collection";
import { useI18n } from "./lib/i18n";
import { useTheme } from "./lib/theme";
import { coin, useSeason } from "./lib/season";
import { SeasonFx } from "./components/SeasonFx";
import { PlayerAvatar } from "./components/PlayerAvatar";
import { ProfileEditor } from "./components/ProfileEditor";
import { useAccount } from "./hooks/useAccount";
import { haptic, setMusicMode, sfx } from "./lib/feedback";
import { HomeScreen } from "./screens/HomeScreen";
import {
  DAILY_REWARD_CREDITS,
  claimMission,
  dailyChallenge,
  dailyLoanDeck,
  missionsAfterPack,
  missionsFor,
  startDaily,
  themeMode,
  todayKey,
} from "./game/daily";
import { DECK_SIZE, buildCpuDeck, newMatch } from "./game/engine";
import {
  applyMatchEnd,
  localDriver,
  type MatchDriver,
  type MatchRewards,
  type MatchView,
} from "./game/match";
import { CARD_BY_ID, PLAYABLE_CARDS } from "./game/cards";
import {
  CLASSIC,
  MIN_DIFFERENT,
  deckProblems,
  decksProblems,
  fitsMode,
  parseMode,
  type MatchMode,
} from "./game/deckRules";
import { modeLabel, modeReady } from "./components/ModePicker";
import { ApiError, callGame, errorMessage } from "./lib/api";
import type {
  Friend,
  GameRequest,
  GameResponse,
  Invite,
  PvpInfo,
} from "./server/actions";
import { themeLabel } from "./components/Daily";
import type { OpenedPack } from "./screens/PacksScreen";

// schermate caricate solo quando servono: l'avvio dell'app è più leggero
const MatchScreen = lazy(() =>
  import("./screens/MatchScreen").then((m) => ({ default: m.MatchScreen }))
);
const DeckBuilderScreen = lazy(() =>
  import("./screens/DeckBuilderScreen").then((m) => ({
    default: m.DeckBuilderScreen,
  }))
);
const CollectionScreen = lazy(() =>
  import("./screens/CollectionScreen").then((m) => ({
    default: m.CollectionScreen,
  }))
);
const FriendScreen = lazy(() =>
  import("./screens/FriendScreen").then((m) => ({ default: m.FriendScreen }))
);
const PacksScreen = lazy(() =>
  import("./screens/PacksScreen").then((m) => ({ default: m.PacksScreen }))
);
// segno di ogni festa (accanto al logo e nel riquadro della home)
const SEASON_MARK = { halloween: "🎃", winter: "❄️", christmas: "🎄", easter: "🐣" } as const;

const SettingsSheet = lazy(() =>
  import("./components/SettingsSheet").then((m) => ({
    default: m.SettingsSheet,
  }))
);
import { Onboarding, onboardingDone } from "./components/Onboarding";
import { ConfirmHost, askConfirm } from "./components/ConfirmDialog";
import { clearChallengeCode, takeChallengeCode } from "./lib/links";
import { listen, pvpTopic, userTopic, type Live } from "./lib/live";
import { buyAndOpen, buyFromStore, storeFor, storePrice } from "./game/shop";

type Screen =
  | "home"
  | "builder"
  | "pick"
  | "match"
  | "collection"
  | "packs"
  | "friend";

const MODE_KEY = "f1-card-battle:mode";
function savedMode(): MatchMode {
  try {
    return parseMode(JSON.parse(localStorage.getItem(MODE_KEY) ?? "null")) ?? CLASSIC;
  } catch {
    return CLASSIC;
  }
}
type Tab = "home" | "collection" | "packs" | "builder";

export default function App() {
  const { t } = useI18n();
  const theme = useTheme();
  const season = useSeason(); // tema delle feste (Halloween, Inverno, Natale, Pasqua)
  const [progress, setProgressRaw] = useState<Progress>(
    () => loadProgress() ?? starterProgress()
  );
  // ogni modifica di gioco aggiorna updatedAt: serve per capire quale copia è più recente (dispositivo o cloud)
  const setProgress = useCallback(
    (next: SetStateAction<Progress>) =>
      setProgressRaw((p) => ({
        ...(typeof next === "function" ? next(p) : next),
        updatedAt: Date.now(),
      })),
    []
  );
  const [screen, setScreen] = useState<Screen>("home");
  const [driver, setDriver] = useState<MatchDriver | null>(null); // partita in corso
  const [dailyMode, setDailyMode] = useState(false); // la partita in corso è la sfida del giorno
  // modalità della partita veloce (classica, rarità, annata, nazionalità), ricordata sul dispositivo
  const [mode, setModeRaw] = useState<MatchMode>(savedMode);
  const setMode = (m: MatchMode) => {
    setModeRaw(m);
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify(m));
    } catch {
      /* niente memoria: va bene lo stesso */
    }
  };
  const [matchMode, setMatchMode] = useState<MatchMode>(CLASSIC); // modalità della partita in corso
  const [pick, setPick] = useState<{ mode: MatchMode; daily: boolean } | null>(null); // scelta delle card a tema
  // sfida tra amici
  const [lobby, setLobby] = useState<PvpInfo | null>(null); // sfida creata, in attesa dell'amico
  const [opponent, setOpponent] = useState<string | null>(null); // nome dell'amico durante la partita
  const [series, setSeries] = useState<PvpInfo | null>(null); // serie al meglio di 3 in corso
  const [matchGame, setMatchGame] = useState(0); // partita della serie mostrata
  const [matchKey, setMatchKey] = useState(0); // cambia a ogni nuova partita (ricrea la schermata)
  const [friendAdded, setFriendAdded] = useState(false);
  // sfida e missioni di oggi (si rigenerano da sole quando cambia il giorno)
  const today = todayKey();
  const challenge = useMemo(() => dailyChallenge(today), [today]);
  const missions = missionsFor(progress.missions, progress.owned, today);
  // salva subito le missioni del giorno, così non cambiano se nel frattempo la collezione cambia
  useEffect(() => {
    if (progress.missions?.date !== today)
      setProgress((p) => ({
        ...p,
        missions: missionsFor(p.missions, p.owned, today),
      }));
  }, [today, progress.missions?.date, setProgress]);
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [intro, setIntro] = useState(() => !onboardingDone());
  // profilo: creazione (anche da "Crea il tuo profilo") o modifica, e codice di recupero da mostrare
  const [profileEditor, setProfileEditor] = useState<{ mode: "create" | "edit" | "complete"; auto?: boolean } | null>(null);
  // il gioco è pronto: la busta dell'animazione di apertura (in index.html) si può togliere
  useEffect(() => {
    (window as Window & { __introReady?: () => void }).__introReady?.();
  }, []);
  const account = useAccount(progress, setProgressRaw, setToast);
  // nessun profilo: alla prima apertura (dopo il tutorial) si apre la creazione del profilo;
  // account ripreso con il codice: si completa con nickname e avatar
  useEffect(() => {
    if (intro || profileEditor) return;
    if (account.incomplete) setProfileEditor({ mode: "complete", auto: true });
    else if (account.needsProfile) setProfileEditor({ mode: "create", auto: true });
  }, [account.needsProfile, account.incomplete, intro, profileEditor]);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Tasto indietro di Android: chiude pannelli e torna alla home prima di uscire dall'app.
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (intro) return;
    if (settings) setSettings(false);
    else if (screen === "match") {
      void askConfirm(
        t(opponent ? "pv_quitConfirm" : "m_quitConfirm", {
          name: opponent ?? "",
        }),
        { danger: true, confirmLabel: t("m_quit") }
      ).then((ok) => ok && quitMatch());
    } else if (screen === "friend" && lobby) cancelLobby();
    else if (screen !== "home") setScreen("home");
    else NativeApp.minimizeApp();
  };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = NativeApp.addListener("backButton", () => backRef.current());
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);

  // con l'accesso fatto ogni azione passa dal server, che risponde con la collezione aggiornata
  async function server(req: GameRequest): Promise<GameResponse | null> {
    try {
      const res = await account.track(callGame(req));
      if (res.progress) setProgressRaw(res.progress);
      return res;
    } catch (e) {
      setToast(errorMessage(e));
      if (e instanceof ApiError && e.code === "no_profile") account.resync();
      return null;
    }
  }

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const rewardsRef = useRef<MatchRewards | null>(null);
  // premi dell'ultima partita, mostrati a fine partita
  const [rewards, setRewardsState] = useState<MatchRewards | null>(null);
  const setRewards = (r: MatchRewards | null) => {
    rewardsRef.current = r;
    setRewardsState(r);
  };
  // ultima partita contro la CPU, per la rivincita
  const lastStart = useRef<{ deck: Card[]; slot: number; mode: MatchMode } | null>(null);
  const [starting, setStarting] = useState(false);

  // partita contro la CPU con il mazzo in uso: se è incompleto lo completiamo noi, se non è valido si va ai mazzi
  // Partita veloce: nella classica si gioca subito con il mazzo in uso (se è incompleto lo completiamo noi,
  // se non è valido si va ai mazzi); nelle partite a tema e nella sfida del giorno prima si scelgono le card adatte.
  function play(daily = false) {
    // sfida del giorno senza abbastanza card del tema: si gioca subito con il mazzo in prestito
    if (daily && !modeReady(themeMode(challenge.theme), ownedCards(progress)).ok) {
      void startMatch(dailyLoanDeck(challenge), activeSlot(progress), true, themeMode(challenge.theme), true);
      return;
    }
    if (daily || mode.kind !== "classic") {
      setPick({ mode: daily ? themeMode(challenge.theme) : mode, daily });
      go("pick");
      return;
    }
    const slot = activeSlot(progress);
    let deck = savedDeck(progress, slot);
    if (deck.length < DECK_SIZE) deck = autoFillDeck(progress, deck, Math.random, otherDecks(progress, slot));
    if (deck.length < DECK_SIZE) return;
    const all = savedDecks(progress).map((d, i) => (i === slot ? deck : d));
    if (decksProblems(all, slot).length) {
      setToast(t("toast_decksSimilar", { n: slot + 1, m: MIN_DIFFERENT }));
      go("builder");
      return;
    }
    if (deckProblems(deck).length) {
      setToast(t("toast_deckInvalid", { n: slot + 1 }));
      go("builder");
      return;
    }
    void startMatch(deck, slot, false, CLASSIC);
  }

  async function startMatch(
    deck: Card[],
    slot: number,
    daily: boolean,
    matchMode: MatchMode,
    loan = false
  ) {
    const ids = deck.map((c) => c.id);
    const classic = matchMode.kind === "classic";
    setRewards(null);
    lastStart.current = daily ? null : { deck, slot, mode: matchMode };
    setDailyMode(daily);
    setMatchMode(matchMode);
    if (account.online) {
      if (starting) return;
      setStarting(true);
      const res = await server({
        action: "match_start",
        deck: ids,
        daily,
        date: today,
        slot,
        mode: matchMode,
        ...(loan ? { loan: true } : {}),
      });
      setStarting(false);
      if (!res?.match || !res.view) {
        setDailyMode(false);
        return;
      }
      const id = res.match;
      setDriver({
        start: res.view,
        async play(stat) {
          const r = await account.track(
            callGame({ action: "match_play", match: id, stat })
          );
          if (r.progress) setProgressRaw(r.progress);
          if (r.rewards) setRewards(r.rewards);
          return r.view!;
        },
        async pass() {
          return (await account.track(callGame({ action: "match_pass", match: id }))).view!;
        },
        quit() {
          void callGame({ action: "match_quit", match: id }).catch(() => {});
        },
      });
    } else {
      setProgress((p) => ({
        // ricorda il mazzo per la prossima volta (solo nella classica: gli altri sono mazzi a tema)
        ...(classic
          ? withDecks(p, deckSlots(p).map((d, i) => (i === slot ? ids : d)), slot)
          : p),
        // la sfida del giorno si considera giocata appena parte: abbandonarla non dà un secondo tentativo
        daily: daily ? startDaily(p.daily, today) : p.daily,
      }));
      const state = newMatch(
        deck,
        daily
          ? challenge.cpuDeck
          : buildCpuDeck(
              deck,
              Math.random,
              PLAYABLE_CARDS.filter((c) => fitsMode(matchMode, c))
            )
      );
      setDriver(
        localDriver(state, (final) => {
          const end = applyMatchEnd(progressRef.current, final, today, {
            daily,
          });
          setProgress(end.progress);
          setRewards(end.rewards);
        })
      );
    }
    setMatchKey((k) => k + 1);
    setScreen("match");
  }

  // Sfida tra amici (al meglio di 3): la partita la arbitra il server, l'avversario gioca dal suo telefono.
  const liveRef = useRef<{ id: string; live: Live } | null>(null);
  const closeLive = () => {
    liveRef.current?.live.close();
    liveRef.current = null;
  };
  function pvpDriver(
    id: string,
    first: GameResponse,
    game: number
  ): MatchDriver {
    let last = first.view!;
    let stopped = false;
    // avvisi istantanei della sfida: la mossa dell'amico arriva subito, senza aspettare il controllo successivo
    // (le 3 partite della serie usano lo stesso canale)
    if (liveRef.current?.id !== id) {
      closeLive();
      liveRef.current = { id, live: listen(pvpTopic(id)) };
    }
    const live = liveRef.current!.live;
    const adopt = (r: GameResponse): MatchView => {
      if (r.progress) setProgressRaw(r.progress);
      if (r.rewards) setRewards(r.rewards);
      if (r.pvp) setSeries(r.pvp);
      last = {
        ...r.view!,
        opponentLeft: r.pvp?.opponentLeft,
        sinceMove: r.pvp?.sinceMove ?? undefined,
      };
      return last;
    };
    const state = () =>
      account.track(callGame({ action: "pvp_state", match: id, game }));
    return {
      start: adopt(first),
      async play(stat) {
        if (stat) {
          try {
            return adopt(
              await account.track(
                callGame({ action: "pvp_play", match: id, game, stat })
              )
            );
          } catch (e) {
            // il tempo era scaduto e il server ha già scelto per te: si riparte dallo stato vero
            if (
              e instanceof ApiError &&
              ["not_your_turn", "bad_stat", "match_finished", "busy"].includes(
                e.code
              )
            )
              return adopt(await state());
            throw e;
          }
        }
        // turno dell'amico: si aspetta la sua mossa (o la scelta automatica allo scadere del tempo)
        let failures = 0;
        for (;;) {
          await live.wait(3000); // segnale dal server, o comunque un controllo ogni 3 secondi
          if (stopped) return last;
          try {
            const r = await state();
            failures = 0;
            // nuova mossa, oppure l'amico ha lasciato scadere il tempo e la scelta è passata a te
            if (r.view && (r.view.round !== last.round || r.view.chooser !== last.chooser || r.view.outcome))
              return adopt(r);
          } catch (e) {
            if (++failures >= 3) throw e;
          }
        }
      },
      async pass() {
        try {
          return adopt(await account.track(callGame({ action: "pvp_pass", match: id, game })));
        } catch (e) {
          // il server ha già deciso (tempo scaduto anche lì, o mossa arrivata): si riparte dallo stato vero
          if (e instanceof ApiError && ["not_your_turn", "match_finished", "busy"].includes(e.code))
            return adopt(await state());
          throw e;
        }
      },
      quit() {
        stopped = true;
        closeLive();
        void callGame({ action: "pvp_quit", match: id }).catch(() => {});
      },
    };
  }

  function startPvp(res: GameResponse | null, name?: string | null) {
    if (!res?.pvp || !res.view) return;
    setRewards(null);
    lastStart.current = null;
    setLobby(null);
    setInvite(null);
    setFriendAdded(false);
    setOpponent(res.pvp.opponent ?? name ?? t("fr_opponent"));
    setMatchGame(res.pvp.game);
    setDriver(pvpDriver(res.pvp.id, res, res.pvp.game));
    setMatchKey((k) => k + 1);
    setScreen("match");
  }

  // crea la sfida con i 3 mazzi salvati: invito diretto a un amico, oppure codice da condividere
  async function createPvp(friend?: Friend) {
    if (starting) return;
    setStarting(true);
    if (!(await ensureDecks())) {
      setStarting(false);
      return;
    }
    const res = await server({
      action: "pvp_create",
      date: today,
      invite: friend?.id,
    });
    setStarting(false);
    if (res?.pvp) setLobby({ ...res.pvp, opponent: friend?.name ?? null });
  }

  // Per la sfida tra amici servono 3 mazzi validi: se mancano li completiamo noi, così si entra subito in partita.
  async function ensureDecks(): Promise<boolean> {
    if (seriesDecks(progress)) return true;
    const decks = autoFillDecks(progress);
    if (decks.some((d) => d.length < DECK_SIZE || deckProblems(d).length) || decksProblems(decks).length) {
      setToast(t("fr_decksNeeded", { n: DECK_SLOTS }));
      go("builder");
      return false;
    }
    const ids = decks.map((d) => d.map((c) => c.id));
    setProgress((p) => withDecks(p, ids, activeSlot(p)));
    return !!(await server({
      action: "set_decks",
      decks: ids,
      active: activeSlot(progress),
    }));
  }

  async function joinPvp(code: string) {
    if (starting) return;
    setStarting(true);
    if (await ensureDecks())
      startPvp(await server({ action: "pvp_join", code, date: today }));
    setStarting(false);
  }

  // link di una sfida (…/?sfida=CODICE): appena hai fatto l'accesso entri nella partita
  const [linkCode, setLinkCode] = useState(() => takeChallengeCode());
  useEffect(() => {
    if (!linkCode) return;
    if (!account.online) {
      setScreen("friend"); // da lì si crea il profilo, poi si entra
      return;
    }
    if (account.status !== "saved") return; // prima la collezione dal server
    setLinkCode(null);
    clearChallengeCode();
    void joinPvp(linkCode);
  }, [linkCode, account.online, account.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function cancelLobby(declined = false) {
    if (declined)
      setToast(t("fr_declined", { name: lobby?.opponent ?? t("fr_opponent") }));
    else if (lobby)
      void callGame({ action: "pvp_quit", match: lobby.id }).catch(() => {});
    setLobby(null);
  }

  // inviti degli amici: il server li segnala a ogni "ping" (che serve anche per il pallino verde)
  const [invite, setInvite] = useState<Invite | null>(null);
  const dismissed = useRef(new Set<string>());
  const busyRef = useRef(false);
  busyRef.current = screen === "match" || !!lobby;
  useEffect(() => {
    if (!account.online) return;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      callGame({ action: "ping" })
        .then((r) => {
          const next = (r.invites ?? []).find(
            (i) => !dismissed.current.has(i.id)
          );
          if (next && !busyRef.current) {
            setInvite((cur) => {
              if (!cur) {
                sfx("select");
                haptic("medium");
              }
              return next;
            });
          }
        })
        .catch(() => {});
    };
    ping();
    // l'invito di un amico arriva subito (segnale dal server); il ping ogni 20 secondi tiene acceso il pallino verde
    const uid = account.accountId;
    const live = uid ? listen(userTopic(uid), ping) : null;
    const id = setInterval(ping, 20_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      live?.close();
      clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [account.online, account.accountId]);

  async function acceptInvite() {
    if (!invite || starting) return;
    dismissed.current.add(invite.id);
    setStarting(true);
    const res = (await ensureDecks())
      ? await server({ action: "pvp_accept", match: invite.id, date: today })
      : null;
    setStarting(false);
    if (res) startPvp(res, invite.from);
    else setInvite(null);
  }

  function declineInvite() {
    if (!invite) return;
    dismissed.current.add(invite.id);
    void callGame({ action: "pvp_decline", match: invite.id }).catch(() => {});
    setInvite(null);
  }

  async function addFriend() {
    if (!series) return;
    if (await server({ action: "friend_add", match: series.id })) {
      setFriendAdded(true);
      setToast(t("fr_added", { name: opponent ?? t("fr_opponent") }));
    }
  }

  // i 3 mazzi salvati (stile Clash Royale)
  function saveDecks(decks: string[][], active: number) {
    setProgress((p) => withDecks(p, decks, active));
    if (account.online) void server({ action: "set_decks", decks, active });
  }

  // "Continua" a fine partita: i premi sono già stati assegnati all'ultimo round.
  // Nella sfida tra amici, se la serie non è finita si passa alla partita successiva.
  async function finishMatch() {
    if (series && series.status === "playing" && driver) {
      const res = await server({
        action: "pvp_state",
        match: series.id,
        game: series.game,
      });
      if (res) startPvp(res, opponent);
      return;
    }
    const r = rewardsRef.current;
    closeLive();
    setDriver(null);
    setDailyMode(false);
    setOpponent(null);
    setSeries(null);
    if (r?.dailyWon)
      setToast(t("toast_dailyWon", { c: DAILY_REWARD_CREDITS }));
    else if (r?.missionsCompleted) setToast(t("mis_completed"));
    else if (r?.packEarned)
      setToast(t("toast_packEarned", { n: WINS_PER_PACK }));
    setScreen(r?.packEarned || r?.dailyWon ? "packs" : "home");
  }

  // Rivincita: stessa modalità e stesso mazzo, contro un nuovo mazzo della CPU.
  function rematch() {
    const last = lastStart.current;
    if (!last) return;
    const r = rewardsRef.current;
    if (r?.missionsCompleted) setToast(t("mis_completed"));
    else if (r?.packEarned)
      setToast(t("toast_packEarned", { n: WINS_PER_PACK }));
    void startMatch(last.deck, last.slot, false, last.mode);
  }

  function quitMatch() {
    driver?.quit();
    closeLive();
    setDriver(null);
    setDailyMode(false);
    setOpponent(null);
    setSeries(null);
    setScreen("home");
  }

  async function claim(i: number) {
    let credits = 0;
    if (account.online)
      credits =
        (await server({ action: "claim_mission", index: i, date: today }))
          ?.credits ?? 0;
    else {
      const res = claimMission(missions, i);
      credits = res.credits;
      if (credits)
        setProgress((p) => ({
          ...p,
          missions: res.missions,
          credits: p.credits + credits,
        }));
    }
    if (!credits) return;
    sfx("roundWin");
    haptic("success");
    setToast(t("toast_claimed", { n: credits }));
  }

  // card del giorno del negozio
  async function buyStoreCard(card: Card) {
    const price = storePrice(card);
    if (
      !(await askConfirm(
        t("shop_confirm", { name: `${card.driver.name} · ${card.team.name}` }),
        { confirmLabel: `${coin()} ${price}` }
      ))
    )
      return;
    let career = false;
    if (account.online) {
      const res = await server({
        action: "buy_store",
        card: card.id,
        date: today,
      });
      if (!res) return;
      career = !!res.unlockedCareers?.length;
    } else {
      const res = buyFromStore(progress, card.id, today);
      if (!res) return;
      setProgress(res.progress);
      career = res.unlockedCareers.length > 0;
    }
    sfx("rare");
    haptic("success");
    const name = `${card.driver.name} · ${card.team.name}`;
    setToast(
      career
        ? t("toast_boughtCareer", { driver: card.driver.name })
        : t("toast_bought", { card: name })
    );
  }

  // le card del giorno si scelgono quando apri il negozio (sul server, se hai fatto l'accesso)
  useEffect(() => {
    if (screen !== "packs" || progress.store?.date === today) return;
    if (account.online) void server({ action: "store", date: today });
    else
      setProgress((p) => ({ ...p, store: storeFor(p.store, p.owned, today) }));
  }, [screen, today, account.online, progress.store?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function applyJolly(card: Card) {
    let career = false;
    if (account.online) {
      const res = await server({ action: "use_jolly", card: card.id });
      if (!res) return;
      career = !!res.unlockedCareers?.length;
    } else {
      const res = spendJolly(progress, card);
      if (!res) return;
      setProgress(res.progress);
      career = res.unlockedCareers.length > 0;
    }
    const name = `${card.driver.name} · ${card.team.name}`;
    setToast(
      career
        ? t("toast_jollyCareer", { card: name })
        : t("toast_jolly", { card: name })
    );
  }

  async function open(kind?: "premium" | "team"): Promise<OpenedPack | null> {
    if (kind) {
      // Premium o Scuderia: si compra e si apre subito
      if (account.online) {
        const pack = (await server({ action: "buy_pack", kind, date: today }))
          ?.pack;
        if (!pack) return null;
        return {
          added: pack.added.map((a) => ({
            card: CARD_BY_ID.get(a.card)!,
            duplicate: a.duplicate,
            credits: a.credits,
          })),
          unlockedCareers: pack.unlockedCareers.map(
            (id) => CARD_BY_ID.get(id)!
          ),
          jolly: pack.jolly,
        };
      }
      const res = buyAndOpen(progress, kind, today);
      if (res)
        setProgress({
          ...res.progress,
          missions: missionsAfterPack(
            missionsFor(res.progress.missions, res.progress.owned, today)
          ),
        });
      return res;
    }
    if (account.online) {
      const pack = (await server({ action: "open_pack", date: today }))?.pack;
      if (!pack) return null;
      return {
        added: pack.added.map((a) => ({
          card: CARD_BY_ID.get(a.card)!,
          duplicate: a.duplicate,
          credits: a.credits,
        })),
        unlockedCareers: pack.unlockedCareers.map((id) => CARD_BY_ID.get(id)!),
        jolly: pack.jolly,
      };
    }
    const res = openPack(progress);
    if (res)
      setProgress({
        ...res.progress,
        missions: missionsAfterPack(
          missionsFor(res.progress.missions, res.progress.owned, today)
        ),
      });
    return res;
  }

  function buyOnePack() {
    if (account.online) void server({ action: "buy_pack" });
    else {
      const next = buyPack(progress);
      if (next) setProgress(next);
    }
  }

  async function reset() {
    if (
      !(await askConfirm(t("reset_confirm"), {
        danger: true,
        confirmLabel: t("reset"),
      }))
    )
      return;
    resetProgress();
    setProgress(starterProgress());
    setSettings(false);
    setScreen("home");
  }

  // Eliminazione dell'account (richiesta da Google Play): due conferme, poi si cancella tutto anche sul server
  // e si riparte da zero sul telefono.
  async function deleteAccount() {
    const name = account.profile?.nickname ?? "";
    if (!(await askConfirm(t("del_confirm1", { name }), { danger: true, confirmLabel: t("del_continue") }))) return;
    if (!(await askConfirm(t("del_confirm2"), { danger: true, confirmLabel: t("del_button") }))) return;
    try {
      await account.deleteAccount();
    } catch (e) {
      setToast(errorMessage(e));
      return;
    }
    resetProgress();
    setProgress(starterProgress());
    setSettings(false);
    setScreen("home");
    setToast(t("del_done"));
  }

  // Uscita dall'account su questo telefono: l'account resta e si rientra con username e codice.
  async function logout() {
    if (!(await askConfirm(t("acc_logoutConfirm", { user: account.username ?? "" }), { confirmLabel: t("acc_logout") }))) return;
    await account.logout();
    resetProgress();
    setProgress(starterProgress());
    setSettings(false);
    setScreen("home");
  }

  // cambio schermata dai pulsanti di navigazione, con tocco sonoro e vibrazione leggera
  const go = (s: Screen) => {
    if (s !== screen) {
      sfx("tap");
      haptic("light");
    }
    setScreen(s);
  };

  // serie al meglio di 3: punteggio, pallini delle partite e "aggiungi agli amici" a fine serie
  const seriesWins = {
    me: series?.results.filter((r) => r === "player").length ?? 0,
    opp: series?.results.filter((r) => r === "cpu").length ?? 0,
  };
  const seriesExtra = series ? (
    <div className="series">
      <div className="series-dots">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={series.results[i] ? `rd-${series.results[i]}` : ""}
          />
        ))}
      </div>
      <b>
        {series.status === "finished"
          ? series.opponentLeft
            ? t("sr_wonLeft")
            : series.seriesOutcome === "player"
            ? t("sr_won", { a: seriesWins.me, b: seriesWins.opp })
            : series.seriesOutcome === "cpu"
            ? t("sr_lost", {
                name: opponent ?? "",
                a: seriesWins.me,
                b: seriesWins.opp,
              })
            : t("sr_draw", { a: seriesWins.me, b: seriesWins.opp })
          : t("sr_score", { a: seriesWins.me, b: seriesWins.opp })}
      </b>
      {series.status === "finished" &&
        !series.opponentIsFriend &&
        !friendAdded && (
          <button className="btn ghost friend-btn" onClick={addFriend}>
            <UserPlus size={16} />{" "}
            {t("fr_add", { name: opponent ?? t("fr_opponent") })}
          </button>
        )}
    </div>
  ) : undefined;

  const inMatch = screen === "match";
  // musica: brano "partita" durante la partita, i due jazz alternati nel resto del gioco
  useEffect(() => setMusicMode(inMatch ? "match" : "menu"), [inMatch]);
  const tab: Tab | null =
    screen === "home" ||
    screen === "collection" ||
    screen === "packs" ||
    screen === "builder"
      ? screen
      : screen === "pick"
      ? "home"
      : null;

  return (
    <div className={`app ${inMatch ? "in-match" : ""}`}>
      {season.season && !inMatch && <SeasonFx season={season.season} />}
      {!inMatch && (
        <header className="hud">
          <button className="brand" onClick={() => setScreen("home")}>
            <img className="brand-logo" src="./logo-card.png" alt="F1 Cards" />
            <span className="brand-name">Card Battle</span>
            {season.season && (
              <span className="season-badge" title={t(`season_${season.season}`)}>
                {SEASON_MARK[season.season]}
              </span>
            )}
          </button>
          <div className="hud-chips">
            <span className="chip-stat" title={t("hud_credits")}>
              {coin()} <b>{progress.credits}</b>
            </span>
            {progress.jolly > 0 && (
              <span className="chip-stat" title={t("hud_jolly")}>
                🃏 <b>{progress.jolly}</b>
              </span>
            )}
            <button
              className="icon-btn"
              onClick={() => setSettings(true)}
              aria-label={t("nav_settings")}
            >
              {account.profile ? (
                <PlayerAvatar avatar={account.profile.avatar} size={34} />
              ) : (
                <Settings size={22} />
              )}
            </button>
          </div>
        </header>
      )}

      <main className="content">
        <Suspense fallback={<div className="screen-loading" />}>
          {screen === "home" && season.season && (
            <div className="season-banner">
              <span className="mark">{SEASON_MARK[season.season]}</span>
              <span>
                {t(`season_${season.season}`)}
                <small>{t(`season_${season.season}_sub`)}</small>
              </span>
            </div>
          )}
          {screen === "home" && (
            <HomeScreen
              progress={progress}
              account={account}
              challenge={challenge}
              missions={missions}
              mode={mode}
              onMode={setMode}
              onPlay={() => play()}
              onDeck={(i) =>
                saveDecks(deckSlots(progress), i)
              }
              onDaily={() => play(true)}
              onFriend={() => go("friend")}
              onClaim={claim}
              onPacks={() => go("packs")}
              onProfile={() => setProfileEditor({ mode: "create" })}
            />
          )}
          {screen === "builder" && (
            <DeckBuilderScreen progress={progress} onSave={saveDecks} />
          )}
          {screen === "pick" && pick && (
            <DeckBuilderScreen
              key={JSON.stringify(pick)}
              progress={progress}
              mode={pick.mode}
              title={t("mode_pick", { n: DECK_SIZE })}
              banner={
                pick.daily
                  ? `${t("daily_vs", {
                      theme: themeLabel(challenge.theme, t),
                    })} — ${t("daily_cpuDeck")}`
                  : modeLabel(pick.mode, t)
              }
              onBack={() => go("home")}
              onPlay={(deck) =>
                void startMatch(
                  deck,
                  activeSlot(progress),
                  pick.daily,
                  pick.mode
                )
              }
            />
          )}
          {screen === "match" && driver && (
            <MatchScreen
              key={matchKey}
              driver={driver}
              title={
                opponent
                  ? t("sr_title", {
                      name: opponent,
                      n: matchGame + 1,
                      a: seriesWins.me,
                      b: seriesWins.opp,
                    })
                  : dailyMode
                  ? t("daily_vs", { theme: themeLabel(challenge.theme, t) })
                  : matchMode.kind !== "classic"
                  ? modeLabel(matchMode, t)
                  : undefined
              }
              opponent={opponent ?? undefined}
              synced={!!opponent}
              endExtra={seriesExtra}
              endButton={
                series && series.status === "playing"
                  ? t("sr_next", { n: series.game + 1 })
                  : undefined
              }
              rewards={rewards}
              packProgress={progress.winsTowardPack}
              hint={progress.wins + progress.losses + progress.draws < 5}
              onRematch={lastStart.current && !opponent ? rematch : undefined}
              onFinish={finishMatch}
              onQuit={quitMatch}
            />
          )}
          {screen === "collection" && (
            <CollectionScreen
              progress={progress}
              today={today}
              onShop={() => go("packs")}
              onUseJolly={applyJolly}
            />
          )}
          {screen === "friend" && (
            <FriendScreen
              account={account}
              progress={progress}
              lobby={lobby}
              onCreate={createPvp}
              onJoin={joinPvp}
              onEditDecks={() => go("builder")}
              onStart={(res) => startPvp(res, lobby?.opponent)}
              onCancel={cancelLobby}
              onProfile={() => setProfileEditor({ mode: "create" })}
            />
          )}
          {screen === "packs" && (
            <PacksScreen
              progress={progress}
              today={today}
              onOpen={open}
              onUseJolly={applyJolly}
              onBuyPack={buyOnePack}
              onBuyCard={buyStoreCard}
            />
          )}
        </Suspense>
      </main>

      {!inMatch && (
        <nav className="tabbar">
          <button
            className={tab === "collection" ? "on" : ""}
            onClick={() => go("collection")}
          >
            <Layers size={22} />
            <span>{t("nav_collection")}</span>
          </button>
          <button
            className={tab === "builder" ? "on" : ""}
            onClick={() => go("builder")}
          >
            <SquareStack size={22} />
            <span>{t("nav_decks")}</span>
          </button>
          <button
            className={tab === "home" ? "on" : ""}
            onClick={() => go("home")}
          >
            <Swords size={22} />
            <span>{t("nav_play")}</span>
          </button>
          <button
            className={tab === "packs" ? "on" : ""}
            onClick={() => go("packs")}
          >
            <span className="tab-icon">
              <Gift size={22} />
              {progress.packs > 0 && (
                <span className="badge">{progress.packs}</span>
              )}
            </span>
            <span>{t("nav_packs")}</span>
          </button>
        </nav>
      )}

      {settings && (
        <Suspense fallback={null}>
          <SettingsSheet
            theme={theme.pref}
            onTheme={theme.setPref}
            seasons={season.on}
            onSeasons={season.setOn}
            account={account}
            onProfile={() => {
              setSettings(false);
              setProfileEditor({ mode: account.profile ? "edit" : "create" });
            }}
            onLogout={logout}
            onIntro={() => {
              setSettings(false);
              setIntro(true);
            }}
            onReset={reset}
            onDeleteAccount={deleteAccount}
            onClose={() => setSettings(false)}
          />
        </Suspense>
      )}
      {intro && <Onboarding onClose={() => setIntro(false)} />}
      {/* profilo: alla prima apertura (dopo il tutorial) o dalle impostazioni */}
      {!intro && profileEditor && (
        <ProfileEditor
          mode={profileEditor.mode}
          initial={account.profile}
          onCreate={account.createProfile}
          onLogin={account.login}
          onSave={account.updateProfile}
          onLater={
            profileEditor.auto
              ? () => {
                  account.later();
                  setProfileEditor(null);
                }
              : undefined
          }
          onClose={() => setProfileEditor(null)}
        />
      )}
      {/* invito di un amico: tendina in alto che resta finché non rispondi */}
      {invite && screen !== "match" && (
        <div className="invite-drop" role="alertdialog" aria-live="assertive">
          <div className="invite-text">
            <b>
              🏁 {t("fr_invited", { name: invite.from ?? t("fr_opponent") })}
            </b>
            <small>{t("fr_invitedDesc")}</small>
          </div>
          <div className="invite-actions">
            <button className="btn ghost" onClick={declineInvite}>
              {t("fr_decline")}
            </button>
            <button
              className="btn primary"
              onClick={acceptInvite}
              disabled={starting}
            >
              {t("fr_accept")}
            </button>
          </div>
        </div>
      )}
      <ConfirmHost />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
