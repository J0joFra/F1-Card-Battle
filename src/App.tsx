import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import type { Card } from './types';
import { CARDS_DATA } from './game/cards';
import {
  TOTAL_CARDS,
  WINS_PER_PACK,
  buyCard,
  buyPack,
  spendJolly,
  collectionSize,
  loadProgress,
  openPack,
  recordMatch,
  resetProgress,
  saveProgress,
  starterProgress,
  type Progress,
} from './game/collection';
import { DECK_SIZE, ROUNDS } from './game/engine';
import { MAX_PER_RARITY } from './game/deckRules';
import { useAccount, type Account } from './hooks/useAccount';
import { MatchScreen } from './screens/MatchScreen';
import { DeckBuilderScreen } from './screens/DeckBuilderScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { PacksScreen } from './screens/PacksScreen';

type Screen = 'home' | 'builder' | 'match' | 'collection' | 'packs';

export default function App() {
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
  const account = useAccount(progress, setProgressRaw, setToast);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
      setToast('🎁 5 vittorie: hai guadagnato un pacchetto!');
      setScreen('packs');
    } else setScreen('home');
  }

  function buy(card: Card) {
    const res = buyCard(progress, card);
    if (!res) return;
    setProgress(res.progress);
    setToast(
      res.unlockedCareers.length
        ? `Comprata! ★ Sbloccata anche la Carriera di ${card.driver.name}`
        : `Comprata: ${card.driver.name} · ${card.team.name}`,
    );
  }

  function open() {
    const res = openPack(progress);
    if (res) setProgress(res.progress);
    return res;
  }

  function reset() {
    if (!confirm('Vuoi davvero ricominciare da zero? Perderai collezione e progressi.')) return;
    resetProgress();
    setProgress(starterProgress());
    setScreen('home');
  }

  const owned = collectionSize(progress);
  const canPlay = owned >= DECK_SIZE;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => screen !== 'match' && setScreen('home')}>
          <span className="brand-mark">F1</span> Card Battle
        </button>
        {screen !== 'match' && <AccountButton account={account} />}
        {screen !== 'match' && (
          <nav>
            <button className={screen === 'home' ? 'on' : ''} onClick={() => setScreen('home')}>
              Gara
            </button>
            <button className={screen === 'collection' ? 'on' : ''} onClick={() => setScreen('collection')}>
              Collezione
            </button>
            <button className={screen === 'packs' ? 'on' : ''} onClick={() => setScreen('packs')}>
              Pacchetti{progress.packs > 0 && <span className="badge">{progress.packs}</span>}
            </button>
          </nav>
        )}
      </header>

      <main>
        {screen === 'home' && (
          <div className="home">
            <section className="hero">
              <h1>Sfida la CPU</h1>
              <p>
                Ogni card è un pilota con una scuderia. Crea un mazzo da {DECK_SIZE} card e gioca {ROUNDS} round contro
                la CPU: chi vince il round sceglie la metrica del successivo, e ogni metrica si usa una volta sola.
              </p>
              <button className="btn primary big" onClick={() => setScreen('builder')} disabled={!canPlay}>
                Inizia la sfida
              </button>
              {!canPlay && <p className="muted">Ti servono almeno {DECK_SIZE} card: apri un pacchetto.</p>}
            </section>

            {!account.session && (
              <section className="cloud-cta">
                <div>
                  <b>☁️ Salva la tua collezione online</b>
                  <p className="muted">
                    Accedi con Google per non perdere le card e ritrovarle su qualsiasi dispositivo. Le card che hai
                    già su questo dispositivo vengono portate sul tuo account.
                  </p>
                </div>
                <button className="btn google" onClick={account.signIn}>
                  <GoogleIcon /> Accedi con Google
                </button>
              </section>
            )}

            <section className="stats-row">
              <div className="tile">
                <small>Vittorie</small>
                <b>{progress.wins}</b>
              </div>
              <div className="tile">
                <small>Sconfitte</small>
                <b>{progress.losses}</b>
              </div>
              <div className="tile">
                <small>Collezione</small>
                <b>
                  {owned}
                  <span className="muted">/{TOTAL_CARDS}</span>
                </b>
              </div>
              <div className="tile">
                <small>Crediti</small>
                <b>{progress.credits}</b>
              </div>
            </section>

            <section className="pack-progress">
              <div className="row">
                <span>Prossimo pacchetto</span>
                <span className="muted">
                  {progress.winsTowardPack}/{WINS_PER_PACK} vittorie
                </span>
              </div>
              <div className="bar">
                <div style={{ width: `${(progress.winsTowardPack / WINS_PER_PACK) * 100}%` }} />
              </div>
              {progress.packs > 0 && (
                <button className="btn ghost" onClick={() => setScreen('packs')}>
                  Hai {progress.packs} {progress.packs === 1 ? 'pacchetto' : 'pacchetti'} da aprire
                </button>
              )}
            </section>

            <section className="rules">
              <h3>Come funziona</h3>
              <ul>
                <li>
                  Prima di ogni partita crei un mazzo di {DECK_SIZE} card, una per metrica (massimo{' '}
                  {MAX_PER_RARITY.leggendaria} Leggendaria e {MAX_PER_RARITY.oro} Oro).
                </li>
                <li>
                  La partita dura {ROUNDS} round. A ogni round esce una card a caso dal mazzo di ognuno. Il primo
                  round lo scegli tu, poi la metrica la sceglie chi ha vinto il round precedente.
                </li>
                <li>Ogni metrica si può usare una sola volta per partita: all'ultimo round resta quella rimasta.</li>
                <li>Vince la metrica il valore più alto (↓ = vince il più basso). Chi fa più punti vince la partita.</li>
                <li>La CPU gioca con un mazzo della stessa rarità del tuo.</li>
                <li>Ogni {WINS_PER_PACK} vittorie ricevi un pacchetto da 5 card.</li>
                <li>I doppioni diventano crediti, con cui compri card a scelta o altri pacchetti.</li>
                <li>Completa tutte le card scuderia di un pilota per sbloccare la sua card Carriera ★.</li>
                <li>🃏 Alcuni pacchetti contengono un Jolly: una card scuderia a scelta di un pilota che stai completando.</li>
              </ul>
            </section>

            <footer className="credits">
              Dati: {CARDS_DATA.source}, aggiornati al {CARDS_DATA.generatedAt}
              {!CARDS_DATA.seasonComplete && ` (stagione ${CARDS_DATA.latestSeason} in corso)`}. Progetto non ufficiale,
              non affiliato a Formula 1 né alle scuderie.
              <button className="link" onClick={reset}>
                Ricomincia da zero
              </button>
            </footer>
          </div>
        )}

        {screen === 'builder' && (
          <DeckBuilderScreen progress={progress} onStart={startMatch} onBack={() => setScreen('home')} />
        )}

        {screen === 'match' && matchCards && (
          <MatchScreen deck={matchCards} onFinish={finishMatch} onQuit={() => setScreen('home')} />
        )}

        {screen === 'collection' && <CollectionScreen progress={progress} onBuy={buy} />}

        {screen === 'packs' && (
          <PacksScreen
            progress={progress}
            onOpen={open}
            onUseJolly={(card) => {
              const res = spendJolly(progress, card);
              if (!res) return;
              setProgress(res.progress);
              setToast(
                res.unlockedCareers.length
                  ? `🃏 ${card.driver.name} · ${card.team.name}. ★ Carriera sbloccata!`
                  : `🃏 Jolly usato: ${card.driver.name} · ${card.team.name}`,
              );
            }}
            onBuyPack={() => {
              const next = buyPack(progress);
              if (next) setProgress(next);
            }}
          />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const STATUS_LABEL: Record<Account['status'], string> = {
  offline: '',
  loading: 'Sincronizzo…',
  saving: 'Salvataggio…',
  saved: '☁️ Salvato',
  error: '⚠️ Non salvato online',
};

function AccountButton({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  if (!account.session) {
    return (
      <button className="btn google small account" onClick={account.signIn}>
        <GoogleIcon /> Accedi
      </button>
    );
  }
  const initial = (account.name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div className="account">
      <button className="avatar" onClick={() => setOpen((o) => !o)} title={account.name ?? ''}>
        {initial}
      </button>
      <span className={`sync sync-${account.status}`}>{STATUS_LABEL[account.status]}</span>
      {open && (
        <div className="account-menu" onMouseLeave={() => setOpen(false)}>
          <div className="muted">{account.name}</div>
          <button
            className="btn ghost"
            onClick={() => {
              setOpen(false);
              account.signOut();
            }}
          >
            Esci
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
