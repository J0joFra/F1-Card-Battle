import { useEffect, useMemo, useState } from 'react';
import type { Card, StatKey } from '../types';
import { STATS } from '../game/cards';
import {
  buildCpuDeck,
  cpuChooseStat,
  matchOutcome,
  newMatch,
  playRound,
  type MatchOutcome,
  type MatchState,
  type RoundResult,
} from '../game/engine';
import { CardBack, CardView } from '../components/CardView';

interface Props {
  deck: Card[];
  onFinish: (outcome: Exclude<MatchOutcome, null>) => void;
  onQuit: () => void;
}

const statLabel = (k: StatKey) => STATS.find((s) => s.key === k)!.label;

export function MatchScreen({ deck, onFinish, onQuit }: Props) {
  const initial = useMemo(() => newMatch(deck, buildCpuDeck(deck)), [deck]);
  const [state, setState] = useState<MatchState>(initial);
  const [last, setLast] = useState<RoundResult | null>(null);
  const [cpuPick, setCpuPick] = useState<StatKey | null>(null);
  const outcome = last ? null : matchOutcome(state);

  // Turno CPU: "pensa" un attimo, poi annuncia la statistica.
  useEffect(() => {
    if (last || outcome || state.turn !== 'cpu' || cpuPick) return;
    const t = setTimeout(() => setCpuPick(cpuChooseStat(state.cpu[0])), 900);
    return () => clearTimeout(t);
  }, [state, last, outcome, cpuPick]);

  useEffect(() => {
    if (!cpuPick) return;
    const t = setTimeout(() => resolve(cpuPick), 1100);
    return () => clearTimeout(t);
  }, [cpuPick]);

  function resolve(stat: StatKey) {
    const { state: next, result } = playRound(state, stat);
    setState(next);
    setLast(result);
    setCpuPick(null);
  }

  function nextRound() {
    setLast(null);
  }

  const finished = !last && outcome;

  return (
    <div className="match">
      <div className="scoreboard">
        <div>
          <small>Tu</small>
          <b>{state.player.length}</b>
        </div>
        <div className="round">
          Giro {Math.min(state.round, 40)}/40
          {state.pot.length > 0 && <span className="pot">Piatto: {state.pot.length} card</span>}
        </div>
        <div>
          <small>CPU</small>
          <b>{state.cpu.length}</b>
        </div>
      </div>

      {finished ? (
        <div className="match-over">
          <h2>{outcome === 'player' ? '🏆 Hai vinto!' : outcome === 'cpu' ? 'Ha vinto la CPU' : 'Pareggio'}</h2>
          <p>
            {outcome === 'player'
              ? 'Ottima gara. Ogni 5 vittorie ricevi un pacchetto di card.'
              : 'Riprova: scegli le statistiche in cui la tua card è più forte.'}
          </p>
          <button className="btn primary" onClick={() => onFinish(outcome)}>
            Continua
          </button>
        </div>
      ) : last ? (
        <>
          <div className={`banner banner-${last.winner}`}>
            {statLabel(last.stat)}:{' '}
            {last.winner === 'player'
              ? `vinci tu! +${last.won} card`
              : last.winner === 'cpu'
                ? 'vince la CPU'
                : 'pareggio, le card vanno nel piatto'}
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
          <button className="btn primary" onClick={nextRound}>
            {matchOutcome(state) ? 'Risultato finale' : 'Prossima card'}
          </button>
        </>
      ) : (
        <>
          <div className="banner">
            {state.turn === 'player'
              ? 'Tocca a te: scegli una statistica'
              : cpuPick
                ? `La CPU sceglie: ${statLabel(cpuPick)}`
                : 'La CPU sta scegliendo…'}
          </div>
          <div className="duel">
            <CardView
              card={state.player[0]}
              onPickStat={state.turn === 'player' ? resolve : undefined}
              highlight={cpuPick ?? undefined}
            />
            <span className="vs">VS</span>
            <CardBack label={`${state.cpu.length} card`} />
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
