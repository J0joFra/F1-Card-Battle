import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Gift, Layers, Play, Settings } from 'lucide-react';
import type { Card } from './types';
import {
  WINS_PER_PACK,
  buyCard,
  buyPack,
  loadProgress,
  openPack,
  recordMatch,
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
import { MatchScreen } from './screens/MatchScreen';
import { DeckBuilderScreen } from './screens/DeckBuilderScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { PacksScreen } from './screens/PacksScreen';
import { SettingsSheet } from './components/SettingsSheet';
import { Onboarding, onboardingDone } from './components/Onboarding';

type Screen = 'home' | 'builder' | 'match' | 'collection' | 'packs';
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
  const [matchCards, setMatchCards] = useState<Card[] | null>(null);
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
      if (confirm(t('m_quitConfirm'))) setScreen('home');
    } else if (screen !== 'home') setScreen('home');
    else NativeApp.minimizeApp();
  };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = NativeApp.addListener('backButton', () => backRef.current());
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);

  function startMatch(deck: Card[]) {
    setProgress((p) => ({ ...p, deck: deck.map((c) => c.id) })); // ricorda il mazzo per la prossima volta
    setMatchCards(deck);
    setScreen('match');
  }

  function finishMatch(outcome: 'player' | 'cpu' | 'draw') {
    const { progress: next, packEarned } = recordMatch(progress, outcome);
    setProgress(next);
    setMatchCards(null);
    if (packEarned) {
      setToast(t('toast_packEarned', { n: WINS_PER_PACK }));
      setScreen('packs');
    } else setScreen('home');
  }

  function buy(card: Card) {
    const res = buyCard(progress, card);
    if (!res) return;
    setProgress(res.progress);
    const name = `${card.driver.name} · ${card.team.name}`;
    setToast(res.unlockedCareers.length ? t('toast_boughtCareer', { driver: card.driver.name }) : t('toast_bought', { card: name }));
  }

  function applyJolly(card: Card) {
    const res = spendJolly(progress, card);
    if (!res) return;
    setProgress(res.progress);
    const name = `${card.driver.name} · ${card.team.name}`;
    setToast(res.unlockedCareers.length ? t('toast_jollyCareer', { card: name }) : t('toast_jolly', { card: name }));
  }

  function open() {
    const res = openPack(progress);
    if (res) setProgress(res.progress);
    return res;
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
          <HomeScreen progress={progress} account={account} onPlay={() => go('builder')} onPacks={() => go('packs')} />
        )}
        {screen === 'builder' && <DeckBuilderScreen progress={progress} onStart={startMatch} onBack={() => setScreen('home')} />}
        {screen === 'match' && matchCards && (
          <MatchScreen deck={matchCards} onFinish={finishMatch} onQuit={() => setScreen('home')} />
        )}
        {screen === 'collection' && <CollectionScreen progress={progress} onBuy={buy} />}
        {screen === 'packs' && (
          <PacksScreen
            progress={progress}
            onOpen={open}
            onUseJolly={applyJolly}
            onBuyPack={() => {
              const next = buyPack(progress);
              if (next) setProgress(next);
            }}
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
