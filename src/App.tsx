import { useEffect, useState } from 'react';
import type { Card } from './types';
import { CARDS_DATA } from './game/cards';
import {
  TOTAL_CARDS,
  WINS_PER_PACK,
  buyCard,
  buyPack,
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
import { MatchScreen } from './screens/MatchScreen';
import { DeckBuilderScreen } from './screens/DeckBuilderScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { PacksScreen } from './screens/PacksScreen';

type Screen = 'home' | 'builder' | 'match' | 'collection' | 'packs';

export default function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress() ?? starterProgress());
  const [screen, setScreen] = useState<Screen>('home');
  const [matchCards, setMatchCards] = useState<Card[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
                Ogni card è un pilota con una scuderia. Crea un mazzo da {DECK_SIZE} card e gioca {ROUNDS} round: a
                ogni round esce una tua card a caso e scegli su quale metrica sfidare la CPU.
              </p>
              <button className="btn primary big" onClick={() => setScreen('builder')} disabled={!canPlay}>
                Inizia la sfida
              </button>
              {!canPlay && <p className="muted">Ti servono almeno {DECK_SIZE} card: apri un pacchetto.</p>}
            </section>

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
                  La partita dura {ROUNDS} round. A ogni round esce una tua card a caso: scegli la metrica, ma non
                  quella usata nel round precedente.
                </li>
                <li>Vince la metrica il valore più alto (↓ = vince il più basso). Chi fa più punti vince la partita.</li>
                <li>La CPU gioca con un mazzo della stessa rarità del tuo.</li>
                <li>Ogni {WINS_PER_PACK} vittorie ricevi un pacchetto da 5 card.</li>
                <li>I doppioni diventano crediti, con cui compri card a scelta o altri pacchetti.</li>
                <li>Completa tutte le card scuderia di un pilota per sbloccare la sua card Carriera ★.</li>
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

