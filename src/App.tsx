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
  matchDeck,
  openPack,
  recordMatch,
  resetProgress,
  saveProgress,
  starterProgress,
  type Progress,
} from './game/collection';
import { DECK_SIZE } from './game/engine';
import { MatchScreen } from './screens/MatchScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { PacksScreen } from './screens/PacksScreen';

type Screen = 'home' | 'match' | 'collection' | 'packs';

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

  function startMatch() {
    setMatchCards(matchDeck(progress));
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

  function toggleDeck(card: Card) {
    setProgress((p) => {
      const has = p.deck.includes(card.id);
      if (!has && p.deck.length >= DECK_SIZE) return p;
      return { ...p, deck: has ? p.deck.filter((id) => id !== card.id) : [...p.deck, card.id] };
    });
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
                Ogni card è un pilota con una scuderia. Scegli la statistica giusta: vince il valore più alto
                (nel miglior arrivo vince il più basso) e chi vince prende le card. Chi resta senza card perde.
              </p>
              <button className="btn primary big" onClick={startMatch} disabled={!canPlay}>
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
                <li>Ogni partita si gioca con {DECK_SIZE} card: scegli il tuo mazzo dalla Collezione.</li>
                <li>La CPU gioca con un mazzo della stessa rarità del tuo.</li>
                <li>Pareggio: le due card vanno nel piatto e le prende chi vince la mano dopo.</li>
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

        {screen === 'match' && matchCards && (
          <MatchScreen deck={matchCards} onFinish={finishMatch} onQuit={() => setScreen('home')} />
        )}

        {screen === 'collection' && <CollectionScreen progress={progress} onToggleDeck={toggleDeck} onBuy={buy} />}

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

