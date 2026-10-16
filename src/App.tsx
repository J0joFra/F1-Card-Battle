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
import { Gift, Layers, Play, Settings, UserPlus } from "lucide-react";
import type { Card } from "./types";
import {
  WINS_PER_PACK,
  buyPack,
  DECK_SLOTS,
  loadProgress,
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
import { useAccount } from "./hooks/useAccount";
import { haptic, setMusicMode, sfx } from "./lib/feedback";
import { HomeScreen } from "./screens/HomeScreen";
import {
  DAILY_REWARD_CREDITS,
  claimMission,
  dailyChallenge,
  missionsAfterPack,
  missionsFor,
  startDaily,
  todayKey,
} from "./game/daily";
import { buildCpuDeck, newMatch } from "./game/engine";
import {
  applyMatchEnd,
  localDriver,
  type MatchDriver,
  type MatchRewards,
  type MatchView,
} from "./game/match";
import { CARD_BY_ID } from "./game/cards";
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
const SettingsSheet = lazy(() =>
  import("./components/SettingsSheet").then((m) => ({
    default: m.SettingsSheet,
  }))
);
import { Onboarding, onboardingDone } from "./components/Onboarding";
import { ConfirmHost, askConfirm } from "./components/ConfirmDialog";
import { buyAndOpen, buyFromStore, storeFor, storePrice } from "./game/shop";

type Screen = "home" | "builder" | "match" | "collection" | "packs" | "friend";
type Tab = "home" | "collection" | "packs";

export default function App() {
  const { t } = useI18n();
  const theme = useTheme();
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
  // sfida tra amici
  const [deckEdit, setDeckEdit] = useState(false); // costruttore del mazzo aperto solo per preparare i 3 mazzi
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
  // il gioco è pronto: la busta dell'animazione di apertura (in index.html) si può togliere
  useEffect(() => {
    (window as Window & { __introReady?: () => void }).__introReady?.();
  }, []);
  const account = useAccount(progress, setProgressRaw, setToast);

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
  const [starting, setStarting] = useState(false);

  async function startMatch(deck: Card[], slot: number) {
    const ids = deck.map((c) => c.id);
    const daily = dailyMode;
    rewardsRef.current = null;
    if (account.online) {
      if (starting) return;
      setStarting(true);
      const res = await server({
        action: "match_start",
        deck: ids,
        daily,
        date: today,
        slot,
      });
      setStarting(false);
      if (!res?.match || !res.view) return;
      const id = res.match;
      setDriver({
        start: res.view,
        async play(stat) {
          const r = await account.track(
            callGame({ action: "match_play", match: id, stat })
          );
          if (r.progress) setProgressRaw(r.progress);
          if (r.rewards) rewardsRef.current = r.rewards;
          return r.view!;
        },
        quit() {
          void callGame({ action: "match_quit", match: id }).catch(() => {});
        },
      });
    } else {
      setProgress((p) => ({
        ...p,
        deck: ids, // ricorda il mazzo per la prossima volta
        // la sfida del giorno si considera giocata appena parte: abbandonarla non dà un secondo tentativo
        daily: daily ? startDaily(p.daily, today) : p.daily,
      }));
      const state = newMatch(
        deck,
        daily ? challenge.cpuDeck : buildCpuDeck(deck)
      );
      setDriver(
        localDriver(state, (final) => {
          const end = applyMatchEnd(progressRef.current, final, today, {
            daily,
          });
          setProgress(end.progress);
          rewardsRef.current = end.rewards;
        })
      );
    }
    setScreen("match");
  }

  // Sfida tra amici (al meglio di 3): la partita la arbitra il server, l'avversario gioca dal suo telefono.
  function pvpDriver(
    id: string,
    first: GameResponse,
    game: number
  ): MatchDriver {
    let last = first.view!;
    let stopped = false;
    const adopt = (r: GameResponse): MatchView => {
      if (r.progress) setProgressRaw(r.progress);
      if (r.rewards) rewardsRef.current = r.rewards;
      if (r.pvp) setSeries(r.pvp);
      last = { ...r.view!, opponentLeft: r.pvp?.opponentLeft };
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
          await new Promise((r) => setTimeout(r, 2000));
          if (stopped) return last;
          try {
            const r = await state();
            failures = 0;
            if (r.view && (r.view.round !== last.round || r.view.outcome))
              return adopt(r);
          } catch (e) {
            if (++failures >= 3) throw e;
          }
        }
      },
      quit() {
        stopped = true;
        void callGame({ action: "pvp_quit", match: id }).catch(() => {});
      },
    };
  }

  function startPvp(res: GameResponse | null, name?: string | null) {
    if (!res?.pvp || !res.view) return;
    rewardsRef.current = null;
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
    const res = await server({
      action: "pvp_create",
      date: today,
      invite: friend?.id,
    });
    setStarting(false);
    if (res?.pvp) setLobby({ ...res.pvp, opponent: friend?.name ?? null });
  }

  async function joinPvp(code: string) {
    if (starting) return;
    setStarting(true);
    startPvp(await server({ action: "pvp_join", code, date: today }));
    setStarting(false);
  }

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
    const id = setInterval(ping, 20_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [account.online]);

  async function acceptInvite() {
    if (!invite) return;
    dismissed.current.add(invite.id);
    const res = await server({
      action: "pvp_accept",
      match: invite.id,
      date: today,
    });
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
    setDriver(null);
    setDailyMode(false);
    setOpponent(null);
    setSeries(null);
    if (r?.credits) setToast(t("toast_friendCredits", { n: r.credits }));
    else if (r?.dailyWon)
      setToast(t("toast_dailyWon", { c: DAILY_REWARD_CREDITS }));
    else if (r?.missionsCompleted) setToast(t("mis_completed"));
    else if (r?.packEarned)
      setToast(t("toast_packEarned", { n: WINS_PER_PACK }));
    setScreen(r?.packEarned || r?.dailyWon ? "packs" : "home");
  }

  function quitMatch() {
    driver?.quit();
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
        { confirmLabel: `🪙 ${price}` }
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
    screen === "home" || screen === "collection" || screen === "packs"
      ? screen
      : null;

  return (
    <div className={`app ${inMatch ? "in-match" : ""}`}>
      {!inMatch && (
        <header className="hud">
          <button className="brand" onClick={() => setScreen("home")}>
            <img className="brand-logo" src="./logo-card.png" alt="F1 Cards" />
            <span className="brand-name">Card Battle</span>
          </button>
          <div className="hud-chips">
            <span className="chip-stat" title={t("hud_credits")}>
              🪙 <b>{progress.credits}</b>
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
              {account.session ? (
                <span className="avatar small">
                  {(account.name ?? "?").trim().charAt(0).toUpperCase()}
                </span>
              ) : (
                <Settings size={22} />
              )}
            </button>
          </div>
        </header>
      )}

      <main className="content">
        <Suspense fallback={<div className="screen-loading" />}>
          {screen === "home" && (
            <HomeScreen
              progress={progress}
              account={account}
              challenge={challenge}
              missions={missions}
              onPlay={() => {
                setDailyMode(false);
                setDeckEdit(false);
                go("builder");
              }}
              onDaily={() => {
                setDailyMode(true);
                setDeckEdit(false);
                go("builder");
              }}
              onFriend={() => go("friend")}
              onClaim={claim}
              onPacks={() => go("packs")}
            />
          )}
          {screen === "builder" && (
            <DeckBuilderScreen
              progress={progress}
              onStart={startMatch}
              onSave={saveDecks}
              editOnly={deckEdit}
              onBack={() => {
                setScreen(deckEdit ? "friend" : "home");
                setDeckEdit(false);
              }}
              banner={
                deckEdit
                  ? t("fr_builderDecks")
                  : dailyMode
                  ? `${t("daily_vs", {
                      theme: themeLabel(challenge.theme, t),
                    })} — ${t("daily_cpuDeck")}`
                  : undefined
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
                  : undefined
              }
              opponent={opponent ?? undefined}
              autoNextMs={opponent ? 8000 : undefined}
              endExtra={seriesExtra}
              endButton={
                series && series.status === "playing"
                  ? t("sr_next", { n: series.game + 1 })
                  : undefined
              }
              onFinish={finishMatch}
              onQuit={quitMatch}
            />
          )}
          {screen === "collection" && (
            <CollectionScreen
              progress={progress}
              today={today}
              onShop={() => go("packs")}
            />
          )}
          {screen === "friend" && (
            <FriendScreen
              account={account}
              progress={progress}
              lobby={lobby}
              onCreate={createPvp}
              onJoin={joinPvp}
              onEditDecks={() => {
                setDailyMode(false);
                setDeckEdit(true);
                go("builder");
              }}
              onStart={(res) => startPvp(res, lobby?.opponent)}
              onCancel={cancelLobby}
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
            className={`tab-play ${screen === "builder" ? "on" : ""}`}
            onClick={() => {
              // il pulsante centrale avvia una partita contro la CPU
              setDailyMode(false);
              setDeckEdit(false);
              go("builder");
            }}
          >
            <span className="tab-play-icon">
              <Play size={26} fill="currentColor" />
            </span>
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
            account={account}
            onIntro={() => {
              setSettings(false);
              setIntro(true);
            }}
            onReset={reset}
            onClose={() => setSettings(false)}
          />
        </Suspense>
      )}
      {intro && <Onboarding onClose={() => setIntro(false)} />}
      {invite && screen !== "match" && (
        <div className="invite-backdrop" role="dialog" aria-modal="true">
          <section className="panel invite-card pop">
            <h3>
              🏁 {t("fr_invited", { name: invite.from ?? t("fr_opponent") })}
            </h3>
            <p className="muted">{t("fr_invitedDesc")}</p>
            {!seriesDecks(progress) && (
              <p className="problems">
                {t("fr_decksNeeded", { n: DECK_SLOTS })}
              </p>
            )}
            <div className="actions">
              <button className="btn ghost" onClick={declineInvite}>
                {t("fr_decline")}
              </button>
              <button
                className="btn primary"
                onClick={acceptInvite}
                disabled={!seriesDecks(progress) || starting}
              >
                {t("fr_accept")}
              </button>
            </div>
          </section>
        </div>
      )}
      <ConfirmHost />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
