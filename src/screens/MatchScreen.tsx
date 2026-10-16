import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card, StatKey } from '../types';
import { X } from 'lucide-react';
import { CARD_BY_ID, STATS, STAT_BY_KEY, formatStat, statLabel, statShort } from '../game/cards';
import { useI18n, type TKey } from '../lib/i18n';
import { errorMessage } from '../lib/api';
import { WINS_PER_PACK } from '../game/collection';
import { ROUNDS, TURN_SECONDS, bestStat, type Side } from '../game/engine';
import type { MatchDriver, MatchView } from '../game/match';
import { CardBack, CardView } from '../components/CardView';
import { haptic, reducedMotion, sfx } from '../lib/feedback';

// tempo della carta CPU che si gira prima di mostrare il risultato del round
const REVEAL_MS = 650;
const CPU_THINK_MS = 900;
const CPU_ANNOUNCE_MS = 1300;

interface Props {
  driver: MatchDriver; // chi arbitra: il telefono (ospite) o il server
  title?: string;
  opponent?: string; // sfida tra amici: nome dell'avversario al posto di "CPU"
  autoNextMs?: number; // passa da solo al round successivo (sfida tra amici: il tempo corre per tutti)
  endExtra?: ReactNode; // a fine partita (es. punteggio della serie al meglio di 3)
  endButton?: string; // testo del pulsante a fine partita (es. "Partita 2")
  onFinish: () => void;
  onQuit: () => void;
}

interface Round {
  stat: StatKey;
  chooser: Side;
  playerCard: Card;
  cpuCard: Card;
  winner: Side | 'tie';
}

const cardOf = (id: string) => CARD_BY_ID.get(id)!;

export function MatchScreen({ driver, title, opponent, autoNextMs, endExtra, endButton, onFinish, onQuit }: Props) {
  const { t: tr } = useI18n();
  // contro un amico i testi "CPU" diventano il suo nome
  const VS_FRIEND: Partial<Record<TKey, TKey>> = {
    m_lose: 'pv_lose',
    m_choseCpu: 'pv_chose',
    m_pointCpu: 'pv_point',
    m_cpuPicks: 'pv_picks',
    m_cpuThinking: 'pv_thinking',
    m_cpuCard: 'pv_card',
    m_quitConfirm: 'pv_quitConfirm',
  };
  const t = (key: TKey, params: Record<string, string | number> = {}) => {
    if (!opponent) return tr(key, params);
    if (key === 'm_cpu' || key === 'm_byCpu') return opponent;
    return tr(VS_FRIEND[key] ?? key, { ...params, name: opponent });
  };
  const [view, setView] = useState<MatchView>(driver.start);
  const [showResult, setShowResult] = useState(false); // round appena giocato, in attesa di "avanti"
  const [cpuPick, setCpuPick] = useState<StatKey | null>(null);
  const [settled, setSettled] = useState(true); // false mentre la carta CPU si sta girando
  const [busy, setBusy] = useState(false); // round in corso (in attesa dell'arbitro)
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<MatchView | null>(null); // round della CPU già giocato, mostrato dopo l'annuncio
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const history: Round[] = useMemo(
    () => view.history.map((h) => ({ ...h, playerCard: cardOf(h.player), cpuCard: cardOf(h.cpu) })),
    [view.history],
  );
  const last = history[history.length - 1];
  const outcome = view.outcome;
  const finished = outcome && !showResult;
  const choosing = !outcome && !showResult;
  const free = STATS.map((s) => s.key).filter((k) => !view.usedStats.includes(k));
  const current = view.current ? cardOf(view.current) : null;

  function show(next: MatchView) {
    // nessun round nuovo (es. l'avversario ha abbandonato): si aggiorna e basta
    if (next.history.length <= view.history.length) {
      setView(next);
      return;
    }
    setView(next);
    setCpuPick(null);
    setShowResult(true);
    setSettled(false);
    sfx('flip');
  }

  function fail(e: unknown) {
    if (!alive.current) return;
    setBusy(false);
    setCpuPick(null);
    setError(errorMessage(e));
    haptic('error');
  }

  // Turno della CPU: "pensa" (intanto l'arbitro gioca il round), annuncia la metrica, poi la mostra.
  useEffect(() => {
    if (!choosing || view.chooser !== 'cpu' || busy || error) return;
    setBusy(true);
    const started = Date.now();
    driver.play().then((next) => {
      if (!alive.current) return;
      if (next.history.length <= view.history.length) {
        setBusy(false);
        show(next);
        return;
      }
      setTimeout(() => {
        if (!alive.current) return;
        pending.current = next;
        setCpuPick(next.history[next.history.length - 1].stat);
        sfx('tap');
        haptic('light');
      }, Math.max(0, CPU_THINK_MS - (Date.now() - started)));
    }, fail);
  }, [choosing, view, busy, error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cpuPick || !pending.current) return;
    const tm = setTimeout(() => {
      const next = pending.current!;
      pending.current = null;
      setBusy(false);
      show(next);
    }, CPU_ANNOUNCE_MS);
    return () => clearTimeout(tm);
  }, [cpuPick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 30 secondi per scegliere: allo scadere si gioca la metrica migliore della tua card
  const myTurn = choosing && view.chooser === 'player' && !busy && !!current;
  const [left, setLeft] = useState(TURN_SECONDS);
  const pickRef = useRef<(s: StatKey) => void>(() => {});
  useEffect(() => {
    if (!myTurn) return;
    const start = Date.now();
    setLeft(TURN_SECONDS);
    const id = setInterval(() => {
      const l = TURN_SECONDS - Math.floor((Date.now() - start) / 1000);
      setLeft(Math.max(0, l));
      if (l <= 0) {
        clearInterval(id);
        pickRef.current(bestStat(current!, free));
      }
    }, 250);
    return () => clearInterval(id);
  }, [myTurn, view.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // contro un amico il risultato del round resta a schermo per un po', poi si va avanti da soli
  useEffect(() => {
    if (!autoNextMs || !showResult || !settled) return;
    const tm = setTimeout(() => setShowResult(false), autoNextMs);
    return () => clearTimeout(tm);
  }, [autoNextMs, showResult, settled]);

  pickRef.current = pick;
  function pick(stat: StatKey) {
    if (busy || view.chooser !== 'player') return;
    sfx('select');
    haptic('light');
    setError(null);
    setBusy(true);
    driver.play(stat).then((next) => {
      if (!alive.current) return;
      setBusy(false);
      show(next);
    }, fail);
  }

  // Dopo che la carta CPU si è girata: esito del round con suono e vibrazione.
  useEffect(() => {
    if (settled || !last) return;
    const tm = setTimeout(() => {
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
    return () => clearTimeout(tm);
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
    player: view.score.player - (!settled && last?.winner === 'player' ? 1 : 0),
    cpu: view.score.cpu - (!settled && last?.winner === 'cpu' ? 1 : 0),
  };
  const chooserLabel = (side: 'player' | 'cpu') => (side === 'player' ? t('m_choseYou') : t('m_choseCpu'));
  const quit = () => {
    if (!confirm(t('m_quitConfirm'))) return;
    driver.quit();
    onQuit();
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
          {finished ? t('m_end') : t('m_round', { a: Math.min(view.round + (showResult ? 0 : 1), ROUNDS), b: ROUNDS })}
          <div className="round-dots">
            {Array.from({ length: ROUNDS }, (_, i) => {
              const h = history[i];
              const shown = h && (settled || i < history.length - 1);
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
            const h = history.find((x) => x.stat === s.key);
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
          {view.opponentLeft && <p className="muted">{t('pv_left')}</p>}
          <p>
            {t('m_score', { a: view.score.player, b: view.score.cpu })}{' '}
            {outcome === 'player' ? t('m_winHint', { n: WINS_PER_PACK }) : t('m_loseHint')}
          </p>
          <ol className="recap">
            {history.map((h, i) => {
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
          {endExtra}
          <button className="btn primary big block" onClick={onFinish}>
            {endButton ?? t('continue')}
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
            <div className="flip-reveal" key={`cpu-${view.round}`}>
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
          {myTurn && (
            <div className={`turn-timer ${left <= 10 ? 'hurry' : ''}`} aria-label={tr('m_timeLeft', { n: left })}>
              <span style={{ width: `${(left / TURN_SECONDS) * 100}%` }} />
              <b>⏱ {left}s</b>
            </div>
          )}
          <div className={`banner ${view.chooser === 'cpu' ? 'banner-cpu-turn' : ''}`}>
            {view.chooser === 'player'
              ? free.length === 1
                ? t('m_last', { stat: statLabel(free[0]) })
                : view.round === 0
                  ? t('m_first')
                  : t('m_yourTurn')
              : cpuPick
                ? t('m_cpuPicks', { stat: statLabel(cpuPick) })
                : t('m_cpuThinking')}
          </div>
          {error && (
            <div className="match-error">
              <span>{error}</span>
              {view.chooser === 'cpu' && (
                <button className="btn ghost" onClick={() => setError(null)}>
                  {t('retry')}
                </button>
              )}
            </div>
          )}
          <div className={`duel ${busy && view.chooser === 'player' ? 'waiting' : ''}`}>
            <div className="deal-in" key={`me-${view.round}`}>
              <CardView
                card={current!}
                onPickStat={view.chooser === 'player' && !busy ? pick : undefined}
                lockedStats={view.usedStats}
                highlight={cpuPick ?? undefined}
              />
            </div>
            <span className="vs">VS</span>
            <div className="deal-in cpu" key={`back-${view.round}`}>
              <CardBack label={t('m_cpuCard', { a: view.round + 1, b: ROUNDS })} />
            </div>
          </div>
        </>
      )}

    </div>
  );
}
