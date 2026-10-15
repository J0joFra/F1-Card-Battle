import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Gift, Layers, Play, Settings } from 'lucide-react';
import type { Card } from './types';
import {
  WINS_PER_PACK,
  buyCard,
  buyPack,
  collectionSize,
  loadProgress,
  openPack,
  resetProgress,
  saveProgress,
  spendJolly,
  starterProgress,
  type Progress,
} from './game/collection';
import { useI18n } from './lib/i18n';
import { useTheme } from './lib/theme';
import { useAccount } from './hooks/useAccount';
import { haptic, setMusicMode, sfx } from './lib/feedback';
import { HomeScreen } from './screens/HomeScreen';
import {
  DAILY_REWARD_CREDITS,
  claimMission,
  dailyChallenge,
  missionsAfterPack,
  missionsFor,
  startDaily,
  todayKey,
} from './game/daily';
import { DECK_SIZE, buildCpuDeck, newMatch } from './game/engine';
import { applyMatchEnd, localDriver, type MatchDriver, type MatchRewards, type MatchView } from './game/match';
import { CARD_BY_ID } from './game/cards';
import { ApiError, callGame, errorMessage } from './lib/api';
import type { GameRequest, GameResponse, PvpInfo } from './server/actions';
import { themeLabel } from './components/Daily';
import { MatchScreen } from './screens/MatchScreen';
import { DeckBuilderScreen } from './screens/DeckBuilderScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { PacksScreen, type OpenedPack } from './screens/PacksScreen';
import { FriendScreen } from './screens/FriendScreen';
import { SettingsSheet } from './components/SettingsSheet';
import { Onboarding, onboardingDone } from './components/Onboarding';

type Screen = 'home' | 'builder' | 'match' | 'collection' | 'packs' | 'friend';
type Tab = 'home' | 'collection' | 'packs';

export default function App() {
  const { t } = useI18n();
  const theme = useTheme();
  const [progress, setProgressRaw] = useState<Progress>(() => loadProgress() ?? starterProgress());
  // ogni modifica di gioco aggiorna updatedAt: serve per capire quale copia è più recente (dispositivo o cloud)
  const setProgress = useCallback(
    (next: SetStateAction<Progress>) =>
      setProgressRaw((p) => ({ ...(typeof next === 'function' ? next(p) : next), updatedAt: Date.now() })),
    [],
  );
  const [screen, setScreen] = useState<Screen>('home');
  const [driver, setDriver] = useState<MatchDriver | null>(null); // partita in corso
  const [dailyMode, setDailyMode] = useState(false); // la partita in corso è la sfida del giorno
  // sfida tra amici: mazzo per creare la sfida o per entrare con un codice
  const [pvpMode, setPvpMode] = useState<{ kind: 'host' } | { kind: 'join'; code: string } | null>(null);
  const [lobby, setLobby] = useState<PvpInfo | null>(null); // sfida creata, in attesa dell'amico
  const [opponent, setOpponent] = useState<string | null>(null); // nome dell'amico durante la partita
  // sfida e missioni di oggi (si rigenerano da sole quando cambia il giorno)
  const today = todayKey();
  const challenge = useMemo(() => dailyChallenge(today), [today]);
  const missions = missionsFor(progress.missions, progress.owned, today);
  // salva subito le missioni del giorno, così non cambiano se nel frattempo la collezione cambia
  useEffect(() => {
    if (progress.missions?.date !== today) setProgress((p) => ({ ...p, missions: missionsFor(p.missions, p.owned, today) }));
  }, [today, progress.missions?.date, setProgress]);
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [intro, setIntro] = useState(() => !onboardingDone());
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
    else if (screen === 'match') {
      if (confirm(t(opponent ? 'pv_quitConfirm' : 'm_quitConfirm', { name: opponent ?? '' }))) quitMatch();
    } else if (screen === 'friend' && lobby) cancelLobby();
    else if (screen !== 'home') setScreen('home');
    else NativeApp.minimizeApp();
  };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = NativeApp.addListener('backButton', () => backRef.current());
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
      if (e instanceof ApiError && e.code === 'no_profile') account.resync();
      return null;
    }
  }

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const rewardsRef = useRef<MatchRewards | null>(null);
  const [starting, setStarting] = useState(false);

  async function startMatch(deck: Card[]) {
    const ids = deck.map((c) => c.id);
    const daily = dailyMode;
    rewardsRef.current = null;
    if (account.online) {
      if (starting) return;
      setStarting(true);
      const res = await server({ action: 'match_start', deck: ids, daily, date: today });
      setStarting(false);
      if (!res?.match || !res.view) return;
      const id = res.match;
      setDriver({
        start: res.view,
        async play(stat) {
          const r = await account.track(callGame({ action: 'match_play', match: id, stat }));
          if (r.progress) setProgressRaw(r.progress);
          if (r.rewards) rewardsRef.current = r.rewards;
          return r.view!;
        },
        quit() {
          void callGame({ action: 'match_quit', match: id }).catch(() => {});
        },
      });
    } else {
      setProgress((p) => ({
        ...p,
        deck: ids, // ricorda il mazzo per la prossima volta
        // la sfida del giorno si considera giocata appena parte: abbandonarla non dà un secondo tentativo
        daily: daily ? startDaily(p.daily, today) : p.daily,
      }));
      const state = newMatch(deck, daily ? challenge.cpuDeck : buildCpuDeck(deck));
      setDriver(
        localDriver(state, (final) => {
          const end = applyMatchEnd(progressRef.current, final, today, { daily });
          setProgress(end.progress);
          rewardsRef.current = end.rewards;
        }),
      );
    }
    setScreen('match');
  }

  // Sfida tra amici: la partita la arbitra il server, l'avversario gioca dal suo telefono.
  function pvpDriver(id: string, first: GameResponse): MatchDriver {
    let last = first.view!;
    let stopped = false;
    const adopt = (r: GameResponse): MatchView => {
      if (r.progress) setProgressRaw(r.progress);
      if (r.rewards) rewardsRef.current = r.rewards;
      last = { ...r.view!, opponentLeft: r.pvp?.opponentLeft };
      return last;
    };
    const state = () => account.track(callGame({ action: 'pvp_state', match: id }));
    return {
      start: adopt(first),
      async play(stat) {
        if (stat) {
          try {
            return adopt(await account.track(callGame({ action: 'pvp_play', match: id, stat })));
          } catch (e) {
            // il tempo era scaduto e il server ha già scelto per te: si riparte dallo stato vero
            if (e instanceof ApiError && ['not_your_turn', 'bad_stat', 'match_finished', 'busy'].includes(e.code)) return adopt(await state());
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
            if (r.view && (r.view.round !== last.round || r.view.outcome)) return adopt(r);
          } catch (e) {
            if (++failures >= 3) throw e;
          }
        }
      },
      quit() {
        stopped = true;
        void callGame({ action: 'pvp_quit', match: id }).catch(() => {});
      },
    };
  }

  function startPvp(res: GameResponse) {
    if (!res.pvp || !res.view) return;
    rewardsRef.current = null;
    setLobby(null);
    setPvpMode(null);
    setOpponent(res.pvp.opponent ?? t('fr_opponent'));
    setDriver(pvpDriver(res.pvp.id, res));
    setScreen('match');
  }

  // "Gioca" nel costruttore del mazzo: partita contro la CPU, oppure sfida tra amici
  async function startFromBuilder(deck: Card[]) {
    if (!pvpMode) return startMatch(deck);
    if (starting) return;
    setStarting(true);
    const ids = deck.map((c) => c.id);
    const res =
      pvpMode.kind === 'host'
        ? await server({ action: 'pvp_create', deck: ids, date: today })
        : await server({ action: 'pvp_join', code: pvpMode.code, deck: ids, date: today });
    setStarting(false);
    if (!res?.pvp) return;
    if (pvpMode.kind === 'host') {
      setLobby(res.pvp);
      setPvpMode(null);
      setScreen('friend');
    } else startPvp(res);
  }

  function cancelLobby() {
    if (lobby) void callGame({ action: 'pvp_quit', match: lobby.id }).catch(() => {});
    setLobby(null);
  }

  // "Continua" a fine partita: i premi sono già stati assegnati all'ultimo round
  function finishMatch() {
    const r = rewardsRef.current;
    setDriver(null);
    setDailyMode(false);
    setOpponent(null);
    if (r?.credits) setToast(t('toast_friendCredits', { n: r.credits }));
    else if (r?.dailyWon) setToast(t('toast_dailyWon', { c: DAILY_REWARD_CREDITS }));
    else if (r?.missionsCompleted) setToast(t('mis_completed'));
    else if (r?.packEarned) setToast(t('toast_packEarned', { n: WINS_PER_PACK }));
    setScreen(r?.packEarned || r?.dailyWon ? 'packs' : 'home');
  }

  function quitMatch() {
    driver?.quit();
    setDriver(null);
    setDailyMode(false);
    setOpponent(null);
    setScreen('home');
  }

  async function claim(i: number) {
    let credits = 0;
    if (account.online) credits = (await server({ action: 'claim_mission', index: i, date: today }))?.credits ?? 0;
    else {
      const res = claimMission(missions, i);
      credits = res.credits;
      if (credits) setProgress((p) => ({ ...p, missions: res.missions, credits: p.credits + credits }));
    }
    if (!credits) return;
    sfx('roundWin');
    haptic('success');
    setToast(t('toast_claimed', { n: credits }));
  }

  async function buy(card: Card) {
    let career = false;
    if (account.online) {
      const res = await server({ action: 'buy_card', card: card.id });
      if (!res) return;
      career = !!res.unlockedCareers?.length;
    } else {
      const res = buyCard(progress, card);
      if (!res) return;
      setProgress(res.progress);
      career = res.unlockedCareers.length > 0;
    }
    const name = `${card.driver.name} · ${card.team.name}`;
    setToast(career ? t('toast_boughtCareer', { driver: card.driver.name }) : t('toast_bought', { card: name }));
  }

  async function applyJolly(card: Card) {
    let career = false;
    if (account.online) {
      const res = await server({ action: 'use_jolly', card: card.id });
      if (!res) return;
      career = !!res.unlockedCareers?.length;
    } else {
      const res = spendJolly(progress, card);
      if (!res) return;
      setProgress(res.progress);
      career = res.unlockedCareers.length > 0;
    }
    const name = `${card.driver.name} · ${card.team.name}`;
    setToast(career ? t('toast_jollyCareer', { card: name }) : t('toast_jolly', { card: name }));
  }

  async function open(): Promise<OpenedPack | null> {
    if (account.online) {
      const pack = (await server({ action: 'open_pack', date: today }))?.pack;
      if (!pack) return null;
      return {
        added: pack.added.map((a) => ({ card: CARD_BY_ID.get(a.card)!, duplicate: a.duplicate, credits: a.credits })),
        unlockedCareers: pack.unlockedCareers.map((id) => CARD_BY_ID.get(id)!),
        jolly: pack.jolly,
      };
    }
    const res = openPack(progress);
    if (res) setProgress({ ...res.progress, missions: missionsAfterPack(missionsFor(res.progress.missions, res.progress.owned, today)) });
    return res;
  }

  function buyOnePack() {
    if (account.online) void server({ action: 'buy_pack' });
    else {
      const next = buyPack(progress);
      if (next) setProgress(next);
    }
  }

  function reset() {
    if (!confirm(t('reset_confirm'))) return;
    resetProgress();
    setProgress(starterProgress());
    setSettings(false);
    setScreen('home');
  }

  // cambio schermata dai pulsanti di navigazione, con tocco sonoro e vibrazione leggera
  const go = (s: Screen) => {
    if (s !== screen) {
      sfx('tap');
      haptic('light');
    }
    setScreen(s);
  };

  const inMatch = screen === 'match';
  // musica: brano "partita" durante la partita, i due jazz alternati nel resto del gioco
  useEffect(() => setMusicMode(inMatch ? 'match' : 'menu'), [inMatch]);
  const tab: Tab | null = screen === 'home' || screen === 'collection' || screen === 'packs' ? screen : null;

  return (
    <div className={`app ${inMatch ? 'in-match' : ''}`}>
      {!inMatch && (
        <header className="hud">
          <button className="brand" onClick={() => setScreen('home')}>
            <span className="brand-mark">F1</span>
            <span className="brand-name">Card Battle</span>
          </button>
          <div className="hud-chips">
            <span className="chip-stat" title={t('hud_credits')}>
              🪙 <b>{progress.credits}</b>
            </span>
            {progress.jolly > 0 && (
              <span className="chip-stat" title={t('hud_jolly')}>
                🃏 <b>{progress.jolly}</b>
              </span>
            )}
            <button className="icon-btn" onClick={() => setSettings(true)} aria-label={t('nav_settings')}>
              {account.session ? (
                <span className="avatar small">{(account.name ?? '?').trim().charAt(0).toUpperCase()}</span>
              ) : (
                <Settings size={22} />
              )}
            </button>
          </div>
        </header>
      )}

      <main className="content">
        {screen === 'home' && (
          <HomeScreen
            progress={progress}
            account={account}
            challenge={challenge}
            missions={missions}
            onPlay={() => {
              setDailyMode(false);
              setPvpMode(null);
              go('builder');
            }}
            onDaily={() => {
              setDailyMode(true);
              setPvpMode(null);
              go('builder');
            }}
            onFriend={() => go('friend')}
            onClaim={claim}
            onPacks={() => go('packs')}
          />
        )}
        {screen === 'builder' && (
          <DeckBuilderScreen
            progress={progress}
            onStart={startFromBuilder}
            onBack={() => setScreen(pvpMode ? 'friend' : 'home')}
            banner={
              pvpMode
                ? pvpMode.kind === 'host'
                  ? t('fr_builderHost')
                  : t('fr_builderJoin', { code: pvpMode.code })
                : dailyMode
                  ? `${t('daily_vs', { theme: themeLabel(challenge.theme, t) })} — ${t('daily_cpuDeck')}`
                  : undefined
            }
          />
        )}
        {screen === 'match' && driver && (
          <MatchScreen
            driver={driver}
            title={
              opponent ? t('fr_vs', { name: opponent }) : dailyMode ? t('daily_vs', { theme: themeLabel(challenge.theme, t) }) : undefined
            }
            opponent={opponent ?? undefined}
            autoNextMs={opponent ? 8000 : undefined}
            onFinish={finishMatch}
            onQuit={quitMatch}
          />
        )}
        {screen === 'collection' && <CollectionScreen progress={progress} onBuy={buy} />}
        {screen === 'friend' && (
          <FriendScreen
            account={account}
            canPlay={collectionSize(progress) >= DECK_SIZE}
            lobby={lobby}
            onCreate={() => {
              setDailyMode(false);
              setPvpMode({ kind: 'host' });
              go('builder');
            }}
            onJoin={(code) => {
              setDailyMode(false);
              setPvpMode({ kind: 'join', code });
              go('builder');
            }}
            onStart={startPvp}
            onCancel={cancelLobby}
          />
        )}
        {screen === 'packs' && (
          <PacksScreen
            progress={progress}
            onOpen={open}
            onUseJolly={applyJolly}
            onBuyPack={buyOnePack}
          />
        )}
      </main>

      {!inMatch && (
        <nav className="tabbar">
          <button className={tab === 'collection' ? 'on' : ''} onClick={() => go('collection')}>
            <Layers size={22} />
            <span>{t('nav_collection')}</span>
          </button>
          <button className={`tab-play ${tab === 'home' || screen === 'builder' ? 'on' : ''}`} onClick={() => go('home')}>
            <span className="tab-play-icon">
              <Play size={26} fill="currentColor" />
            </span>
            <span>{t('nav_play')}</span>
          </button>
          <button className={tab === 'packs' ? 'on' : ''} onClick={() => go('packs')}>
            <span className="tab-icon">
              <Gift size={22} />
              {progress.packs > 0 && <span className="badge">{progress.packs}</span>}
            </span>
            <span>{t('nav_packs')}</span>
          </button>
        </nav>
      )}

      {settings && (
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
      )}
      {intro && <Onboarding onClose={() => setIntro(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
