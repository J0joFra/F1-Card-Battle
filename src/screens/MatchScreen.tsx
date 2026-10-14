import { useMemo, useState } from 'react';
import type { Card, StatKey } from '../types';
import { STAT_BY_KEY, formatStat } from '../game/cards';
import {
  ROUNDS,
  buildCpuDeck,
  currentCards,
  matchOutcome,
  newMatch,
  playRound,
  type MatchOutcome,
  type MatchState,
} from '../game/engine';
import { CardBack, CardView } from '../components/CardView';

interface Props {
  deck: Card[];
  onFinish: (outcome: Exclude<MatchOutcome, null>) => void;
  onQuit: () => void;
}

export function MatchScreen({ deck, onFinish, onQuit }: Props) {
  const initial = useMemo(() => newMatch(deck, buildCpuDeck(deck)), [deck]);
  const [state, setState] = useState<MatchState>(initial);
  const [showResult, setShowResult] = useState(false); // round appena giocato, in attesa di "avanti"
  const last = state.history[state.history.length - 1];
  const outcome = matchOutcome(state);
  const finished = outcome && !showResult;

  function pick(stat: StatKey) {
    setState(playRound(state, stat));
    setShowResult(true);
  }

  return (
    <div className="match">
      <div className="scoreboard">
        <div>
          <small>Tu</small>
          <b>{state.score.player}</b>
        </div>
        <div className="round">
          {finished ? 'Fine gara' : `Round ${Math.min(state.round + (showResult ? 0 : 1), ROUNDS)}/${ROUNDS}`}
          <div className="round-dots">
            {Array.from({ length: ROUNDS }, (_, i) => {
              const h = state.history[i];
              return <span key={i} className={`rd ${h ? `rd-${h.winner}` : ''}`} title={h ? STAT_BY_KEY[h.stat].label : ''} />;
            })}
          </div>
        </div>
        <div>
          <small>CPU</small>
          <b>{state.score.cpu}</b>
        </div>
      </div>

      {finished ? (
        <div className="match-over">
          <h2>{outcome === 'player' ? '🏆 Hai vinto!' : outcome === 'cpu' ? 'Ha vinto la CPU' : 'Pareggio'}</h2>
          <p>
            {state.score.player} a {state.score.cpu}.{' '}
            {outcome === 'player'
              ? 'Ogni 5 vittorie ricevi un pacchetto di card.'
              : 'Prova un mazzo più equilibrato tra le metriche.'}
          </p>
          <ol className="recap">
            {state.history.map((h, i) => {
              const def = STAT_BY_KEY[h.stat];
              return (
                <li key={i} className={`rd-${h.winner}`}>
                  <span>{def.label}</span>
                  <span>
                    {h.playerCard.driver.abbreviation} {formatStat(def, h.playerCard.stats[h.stat])} –{' '}
                    {formatStat(def, h.cpuCard.stats[h.stat])}{' '}
                    {h.cpuCard.driver.abbreviation}
                  </span>
                </li>
              );
            })}
          </ol>
          <button className="btn primary" onClick={() => onFinish(outcome)}>
            Continua
          </button>
        </div>
      ) : showResult && last ? (
        <>
          <div className={`banner banner-${last.winner}`}>
            {STAT_BY_KEY[last.stat].label}:{' '}
            {last.winner === 'player' ? 'punto tuo!' : last.winner === 'cpu' ? 'punto alla CPU' : 'pareggio, nessun punto'}
          </div>
          <div className="duel">
            <CardView
              card={last.playerCard}
              highlight={last.stat}
              result={last.winner === 'player' ? 'win' : last.winner === 'cpu' ? 'lose' : 'tie'}
            />
            <span className="vs">VS</span>
            <CardView
              card={last.cpuCard}
              highlight={last.stat}
              result={last.winner === 'cpu' ? 'win' : last.winner === 'player' ? 'lose' : 'tie'}
            />
          </div>
          <button className="btn primary" onClick={() => setShowResult(false)}>
            {outcome ? 'Risultato finale' : 'Prossimo round'}
          </button>
        </>
      ) : (
        <>
          <div className="banner">
            Scegli la metrica
            {state.lastStat && <span className="muted"> · bloccata: {STAT_BY_KEY[state.lastStat].label}</span>}
          </div>
          <div className="duel">
            <CardView card={currentCards(state).player} onPickStat={pick} lockedStat={state.lastStat} />
            <span className="vs">VS</span>
            <CardBack label={`Carta CPU ${state.round + 1}/${ROUNDS}`} />
          </div>
        </>
      )}

      {!finished && (
        <button className="btn ghost quit" onClick={onQuit}>
          Abbandona
        </button>
      )}
    </div>
  );
}
