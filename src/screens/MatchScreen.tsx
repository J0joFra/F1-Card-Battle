import { useEffect, useMemo, useState } from 'react';
import type { Card, StatKey } from '../types';
import { X } from 'lucide-react';
import { STATS, STAT_BY_KEY, formatStat, statLabel, statShort } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { WINS_PER_PACK } from '../game/collection';
import {
  ROUNDS,
  availableStats,
  buildCpuDeck,
  cpuChooseStat,
  currentCards,
  matchOutcome,
  newMatch,
  playRound,
  type MatchOutcome,
  type MatchState,
} from '../game/engine';
import { CardBack, CardView } from '../components/CardView';
import { haptic, reducedMotion, sfx } from '../lib/feedback';

// tempo della carta CPU che si gira prima di mostrare il risultato del round
const REVEAL_MS = 650;

interface Props {
  deck: Card[];
  cpuDeck?: Card[]; // mazzo CPU già deciso (sfida del giorno); altrimenti viene costruito
  title?: string;
  onFinish: (outcome: Exclude<MatchOutcome, null>, state: MatchState) => void;
  onQuit: () => void;
}

export function MatchScreen({ deck, cpuDeck, title, onFinish, onQuit }: Props) {
  const { t } = useI18n();
  const initial = useMemo(() => newMatch(deck, cpuDeck ?? buildCpuDeck(deck)), [deck, cpuDeck]);
  const [state, setState] = useState<MatchState>(initial);
  const [showResult, setShowResult] = useState(false); // round appena giocato, in attesa di "avanti"
  const [cpuPick, setCpuPick] = useState<StatKey | null>(null);
  const [settled, setSettled] = useState(true); // false mentre la carta CPU si sta girando
  const last = state.history[state.history.length - 1];
  const outcome = matchOutcome(state);
  const finished = outcome && !showResult;
  const choosing = !outcome && !showResult;
  const free = availableStats(state);

  // Turno della CPU: "pensa", annuncia la metrica, poi la gioca.
  useEffect(() => {
    if (!choosing || state.chooser !== 'cpu' || cpuPick) return;
    const t = setTimeout(() => {
      setCpuPick(cpuChooseStat(state));
      sfx('tap');
      haptic('light');
    }, 900);
    return () => clearTimeout(t);
  }, [choosing, state, cpuPick]);

  useEffect(() => {
    if (!cpuPick) return;
    const t = setTimeout(() => pick(cpuPick), 1300);
    return () => clearTimeout(t);
  }, [cpuPick]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(stat: StatKey) {
    if (state.chooser === 'player') {
      sfx('select');
      haptic('light');
    }
    setState(playRound(state, stat));
    setCpuPick(null);
    setShowResult(true);
    setSettled(false);
    sfx('flip');
  }

  // Dopo che la carta CPU si è girata: esito del round con suono e vibrazione.
  useEffect(() => {
    if (settled || !last) return;
    const t = setTimeout(() => {
      setSettled(true);
      if (last.winner === 'player') {
        sfx('roundWin');
        haptic('success');
      } else if (last.winner === 'cpu') {
        sfx('roundLose');
        haptic('error');
      } else {
        sfx('roundTie');
        haptic('warning');
      }
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [settled, last]);

  // Fine partita: fanfara (e coriandoli se hai vinto) o musichetta della sconfitta.
  useEffect(() => {
    if (!finished) return;
    if (outcome === 'player') {
      sfx('victory');
      haptic('heavy');
      if (!reducedMotion())
        void import('canvas-confetti').then(({ default: confetti }) => {
          const colors = ['#e10600', '#ffffff', '#e8b931', '#2fbf71'];
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, colors, disableForReducedMotion: true });
          setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors }), 250);
          setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors }), 400);
        });
    } else if (outcome === 'cpu') {
      sfx('defeat');
      haptic('error');
    } else sfx('roundTie');
  }, [finished, outcome]);

  // mentre la carta CPU si gira il punteggio non è ancora aggiornato, per non rovinare la sorpresa
  const shown = {
    player: state.score.player - (!settled && last?.winner === 'player' ? 1 : 0),
    cpu: state.score.cpu - (!settled && last?.winner === 'cpu' ? 1 : 0),
  };
  const chooserLabel = (side: 'player' | 'cpu') => (side === 'player' ? t('m_choseYou') : t('m_choseCpu'));
  const quit = () => {
    if (confirm(t('m_quitConfirm'))) onQuit();
  };

  return (
    <div className="screen match">
      {!finished && (
        <button className="icon-btn match-quit" onClick={quit} aria-label={t('m_quit')}>
          <X size={22} />
        </button>
      )}
      {title && <div className="match-title">{title}</div>}
      <div className="scoreboard">
        <div className="side you">
          <small>{t('m_you')}</small>
          <b key={`p${shown.player}`} className={shown.player ? 'bump' : ''}>
            {shown.player}
          </b>
        </div>
        <div className="round">
          {finished ? t('m_end') : t('m_round', { a: Math.min(state.round + (showResult ? 0 : 1), ROUNDS), b: ROUNDS })}
          <div className="round-dots">
            {Array.from({ length: ROUNDS }, (_, i) => {
              const h = state.history[i];
              const shown = h && (settled || i < state.history.length - 1);
              return <span key={i} className={`rd ${shown ? `rd-${h.winner}` : ''}`} title={h ? statLabel(h.stat) : ''} />;
            })}
          </div>
        </div>
        <div className="side cpu">
          <small>{t('m_cpu')}</small>
          <b key={`c${shown.cpu}`} className={shown.cpu ? 'bump' : ''}>
            {shown.cpu}
          </b>
        </div>
      </div>

      {!finished && (
        <div className="stat-chips">
          {STATS.map((s) => {
            const h = state.history.find((x) => x.stat === s.key);
            return (
              <span key={s.key} className={`stat-chip ${h ? `used rd-${h.winner}` : ''}`} title={statLabel(s.key)}>
                {statShort(s.key)}
              </span>
            );
          })}
        </div>
      )}

      {finished ? (
        <div className="match-over">
          <h2 className={`over-${outcome}`}>{outcome === 'player' ? t('m_win') : outcome === 'cpu' ? t('m_lose') : t('m_draw')}</h2>
          <p>
            {t('m_score', { a: state.score.player, b: state.score.cpu })}{' '}
            {outcome === 'player' ? t('m_winHint', { n: WINS_PER_PACK }) : t('m_loseHint')}
          </p>
          <ol className="recap">
            {state.history.map((h, i) => {
              const def = STAT_BY_KEY[h.stat];
              return (
                <li key={i} className={`rd-${h.winner}`}>
                  <span>
                    {statLabel(h.stat)}
                    <small className="muted"> · {h.chooser === 'player' ? t('m_byYou') : t('m_byCpu')}</small>
                  </span>
                  <span>
                    {h.playerCard.driver.abbreviation} {formatStat(def, h.playerCard.stats[h.stat])} –{' '}
                    {formatStat(def, h.cpuCard.stats[h.stat])} {h.cpuCard.driver.abbreviation}
                  </span>
                </li>
              );
            })}
          </ol>
          <button className="btn primary big block" onClick={() => onFinish(outcome, state)}>
            {t('continue')}
          </button>
        </div>
      ) : showResult && last ? (
        <>
          {settled ? (
            <div className={`banner banner-${last.winner} pop`}>
              {statLabel(last.stat)} ({chooserLabel(last.chooser)}):{' '}
              {last.winner === 'player' ? t('m_pointYou') : last.winner === 'cpu' ? t('m_pointCpu') : t('m_tie')}
            </div>
          ) : (
            <div className="banner">{statLabel(last.stat)}…</div>
          )}
          <div className={`duel ${settled ? `clash clash-${last.winner}` : ''}`}>
            <CardView
              card={last.playerCard}
              highlight={last.stat}
              result={settled ? (last.winner === 'player' ? 'win' : last.winner === 'cpu' ? 'lose' : 'tie') : undefined}
            />
            <span className="vs">VS</span>
            <div className="flip-reveal" key={`cpu-${state.round}`}>
              <CardView
                card={last.cpuCard}
                highlight={last.stat}
                result={settled ? (last.winner === 'cpu' ? 'win' : last.winner === 'player' ? 'lose' : 'tie') : undefined}
              />
            </div>
          </div>
          <button
            className="btn primary big next-btn"
            disabled={!settled}
            onClick={() => {
              sfx('tap');
              setShowResult(false);
            }}
          >
            {outcome ? t('m_final') : t('m_next')}
          </button>
        </>
      ) : (
        <>
          <div className={`banner ${state.chooser === 'cpu' ? 'banner-cpu-turn' : ''}`}>
            {state.chooser === 'player'
              ? free.length === 1
                ? t('m_last', { stat: statLabel(free[0]) })
                : state.round === 0
                  ? t('m_first')
                  : t('m_yourTurn')
              : cpuPick
                ? t('m_cpuPicks', { stat: statLabel(cpuPick) })
                : t('m_cpuThinking')}
          </div>
          <div className="duel">
            <div className="deal-in" key={`me-${state.round}`}>
              <CardView
                card={currentCards(state).player}
                onPickStat={state.chooser === 'player' ? pick : undefined}
                lockedStats={state.usedStats}
                highlight={cpuPick ?? undefined}
              />
            </div>
            <span className="vs">VS</span>
            <div className="deal-in cpu" key={`back-${state.round}`}>
              <CardBack label={t('m_cpuCard', { a: state.round + 1, b: ROUNDS })} />
            </div>
          </div>
        </>
      )}

    </div>
  );
}
