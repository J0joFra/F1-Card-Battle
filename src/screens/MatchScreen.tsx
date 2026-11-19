import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { coin, seasonNow } from '../lib/season';
import type { Card, StatKey } from '../types';
import { Flag, RotateCcw } from 'lucide-react';
import { CARD_BY_ID, STATS, STAT_BY_KEY, formatStat, statLabel, statShort } from '../game/cards';
import { useI18n, type TKey } from '../lib/i18n';
import { errorMessage } from '../lib/api';
import { JOLLY_KINDS, ROUNDS, TURN_SECONDS, type JollyKind, type Side } from '../game/engine';
import type { MatchDriver, MatchRewards, MatchView } from '../game/match';
import { FIRST_WIN_CREDITS, WINS_PER_PACK } from '../game/collection';
import { DAILY_REWARD_CREDITS } from '../game/daily';
import { CardBack, CardView } from '../components/CardView';
import { askConfirm } from '../components/ConfirmDialog';
import { haptic, reducedMotion, sfx } from '../lib/feedback';

// tempo della carta CPU che si gira prima di mostrare il risultato del round
const REVEAL_MS = 650;
// sfida tra amici: il risultato del round resta a schermo questo tempo (contato dalla mossa, uguale per i due telefoni)
const PVP_REVEAL_MS = 3000; // come in server/pvp.ts
const CPU_THINK_MS = 900;
const CPU_ANNOUNCE_MS = 1300;
// coriandoli della vittoria, con i colori della festa
const SEASON_CONFETTI = {
  none: ['#e10600', '#ffffff', '#e8b931', '#2fbf71'],
  halloween: ['#ff7a00', '#b45cff', '#1a1a1a', '#ffd23f'],
  winter: ['#ffffff', '#7fd0ff', '#2f8fe0', '#d6ecff'],
  christmas: ['#d42426', '#1f9d55', '#f2c14e', '#ffffff'],
  easter: ['#ff9ecf', '#ffe066', '#9be7a0', '#a7c7ff'],
};

interface Props {
  driver: MatchDriver; // chi arbitra: il telefono (ospite) o il server
  title?: string;
  opponent?: string; // sfida tra amici: nome dell'avversario al posto di "CPU"
  synced?: boolean; // sfida tra amici: dopo ogni mossa si passa da soli alla carta successiva, insieme all'avversario
  endExtra?: ReactNode; // a fine partita (es. punteggio della serie al meglio di 3)
  endButton?: string; // testo del pulsante a fine partita (es. "Partita 2")
  rewards?: MatchRewards | null; // premi della partita appena finita
  boosts?: Partial<Record<JollyKind, number>>; // jolly di gara che hai (modalità Strategica)
  packProgress?: number; // vittorie verso il prossimo pacchetto (dopo questa partita)
  hint?: boolean; // prime partite: spiega barre e frecce delle metriche
  onRematch?: () => void; // rivincita (solo contro la CPU)
  onFinish: () => void;
  onQuit: () => void;
}

interface Round {
  stat: StatKey;
  chooser: Side;
  playerCard: Card;
  cpuCard: Card;
  winner: Side | 'tie';
  jolly?: JollyKind;
  neutralized?: boolean;
}

const cardOf = (id: string) => CARD_BY_ID.get(id)!;

export function MatchScreen({
  driver,
  title,
  opponent,
  synced,
  endExtra,
  endButton,
  rewards,
  boosts,
  packProgress,
  hint,
  onRematch,
  onFinish,
  onQuit,
}: Props) {
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
    m_timeUp: 'pv_timeUp',
    m_oppTimeUp: 'pv_oppTimeUp',
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
  const advanceAt = useRef(0); // sfida tra amici: quando passare alla carta successiva
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
  // modalità Strategica: scegli una carta della mano (e, se vuoi, un jolly di gara per questo round)
  const hand = view.hand?.length ? view.hand : null;
  const [sel, setSel] = useState(0);
  const [armed, setArmed] = useState<JollyKind | null>(null);
  useEffect(() => {
    setSel(0);
    setArmed(null);
  }, [view.round]);
  const selected = hand ? Math.min(sel, hand.length - 1) : 0;
  const current = hand ? cardOf(hand[selected]) : view.current ? cardOf(view.current) : null;
  const move = () => (hand ? { card: selected, ...(armed ? { jolly: armed } : {}) } : undefined);
  const jollyChoices = hand && !view.jollyUsed ? JOLLY_KINDS.filter((k) => (boosts?.[k] ?? 0) > 0) : [];

  function show(next: MatchView) {
    // nessun round nuovo (es. l'avversario ha abbandonato): si aggiorna e basta
    if (next.history.length <= view.history.length) {
      setView(next);
      return;
    }
    setView(next);
    setCpuPick(null);
    // il server dice da quanto è stata fatta la mossa: così i due telefoni cambiano carta insieme
    advanceAt.current = Date.now() + Math.max(REVEAL_MS + 600, PVP_REVEAL_MS - (next.sinceMove ?? 0));
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
  // Nella modalità Strategica prima scegli la tua carta (vedi `follow`), poi la CPU annuncia.
  useEffect(() => {
    if (!choosing || view.chooser !== 'cpu' || busy || error || hand) return;
    cpuTurn();
  }, [choosing, view, busy, error]); // eslint-disable-line react-hooks/exhaustive-deps

  function follow() {
    if (busy || view.chooser !== 'cpu' || !hand) return;
    sfx('select');
    haptic('light');
    setError(null);
    cpuTurn(move());
  }

  function cpuTurn(m?: ReturnType<typeof move>) {
    setBusy(true);
    const started = Date.now();
    driver.play(undefined, m).then((next) => {
      if (!alive.current) return;
      // contro un amico la mossa è già avvenuta: si mostra subito, senza far "pensare" l'avversario
      if (next.history.length <= view.history.length || synced) {
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
  }

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

  // 30 secondi per scegliere: allo scadere la scelta passa all'avversario
  const myTurn = choosing && view.chooser === 'player' && !busy && !!current;
  const [left, setLeft] = useState(TURN_SECONDS);
  const passRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!myTurn) return;
    const start = Date.now();
    setLeft(TURN_SECONDS);
    const id = setInterval(() => {
      const l = TURN_SECONDS - Math.floor((Date.now() - start) / 1000);
      setLeft(Math.max(0, l));
      if (l <= 0) {
        clearInterval(id);
        passRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [myTurn, view.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // contro un amico non si preme «Prossimo round»: si passa da soli alla carta successiva, insieme all'avversario
  useEffect(() => {
    if (!synced || !showResult || !settled) return;
    const tm = setTimeout(() => setShowResult(false), Math.max(0, advanceAt.current - Date.now()));
    return () => clearTimeout(tm);
  }, [synced, showResult, settled]);

  passRef.current = passTurn;
  function passTurn() {
    if (busy || view.chooser !== 'player') return;
    haptic('error');
    setError(null);
    setBusy(true);
    driver.pass().then((next) => {
      if (!alive.current) return;
      setBusy(false);
      show(next);
    }, fail);
  }

  function pick(stat: StatKey) {
    if (busy || view.chooser !== 'player') return;
    sfx('select');
    haptic('light');
    setError(null);
    setBusy(true);
    driver.play(stat, move()).then((next) => {
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
          const colors = SEASON_CONFETTI[seasonNow() ?? 'none'];
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
  const quit = async () => {
    if (!(await askConfirm(t('m_quitConfirm'), { danger: true, confirmLabel: t('m_quit') }))) return;
    driver.quit();
    onQuit();
  };

  return (
    <div className={`screen match ${hand && choosing ? 'has-hand' : ''}`}>
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
          {rewards && (
            <div className="over-rewards">
              <div className="over-chips">
                {rewards.credits - (rewards.firstWin ? FIRST_WIN_CREDITS : 0) > 0 && (
                  <span className="reward-pill">{coin()} +{rewards.credits - (rewards.firstWin ? FIRST_WIN_CREDITS : 0)}</span>
                )}
                {rewards.firstWin && (
                  <span className="reward-pill gold">
                    {tr('m_firstWin')} {coin()} +{FIRST_WIN_CREDITS}
                  </span>
                )}
                {rewards.dailyWon && (
                  <span className="reward-pill gold">
                    {tr('daily_title')} 🎁 +1 · {coin()} +{DAILY_REWARD_CREDITS}
                  </span>
                )}
              </div>
              {!opponent &&
                (rewards.packEarned ? (
                  <b className="over-pack">{tr('m_packEarned')}</b>
                ) : (
                  packProgress !== undefined && (
                    <div className="over-pack">
                      <small>{tr('m_packProgress', { a: packProgress, b: WINS_PER_PACK })}</small>
                      <div className="bar small">
                        <div style={{ width: `${(packProgress / WINS_PER_PACK) * 100}%` }} />
                      </div>
                    </div>
                  )
                ))}
            </div>
          )}
          <div className={`over-actions ${onRematch ? 'two' : ''}`}>
            {onRematch && (
              <button className="btn primary big" onClick={onRematch}>
                <RotateCcw size={18} /> {tr('m_rematch')}
              </button>
            )}
            <button className={`btn big ${onRematch ? '' : 'primary block'}`} onClick={onFinish}>
              {endButton ?? t('continue')}
            </button>
          </div>
        </div>
      ) : showResult && last ? (
        <>
          {settled ? (
            <div className={`banner banner-${last.winner} pop`}>
              {statLabel(last.stat)} ({chooserLabel(last.chooser)}):{' '}
              {last.winner === 'player' ? t('m_pointYou') : last.winner === 'cpu' ? t('m_pointCpu') : t('m_tie')}
              {last.jolly && (
                <span className={`rj-used rj-${last.jolly}`}>
                  {last.jolly === 'drs' ? tr('rj_drsUsed') : last.neutralized ? tr('rj_scUsed') : tr('rj_scSpare')}
                </span>
              )}
            </div>
          ) : (
            <div className="banner">{statLabel(last.stat)}…</div>
          )}
          <div className={`duel-stack revealed ${settled ? `clash-${last.winner}` : ''}`}>
            <div className="duel-me">
              <CardView
                card={last.playerCard}
                highlight={last.stat}
                result={settled ? (last.winner === 'player' ? 'win' : last.winner === 'cpu' ? 'lose' : 'tie') : undefined}
              />
            </div>
            <span className="vs-badge" aria-hidden>
              VS
            </span>
            <div className="duel-opp flip-reveal" key={`cpu-${view.round}`}>
              <CardView
                card={last.cpuCard}
                highlight={last.stat}
                result={settled ? (last.winner === 'cpu' ? 'win' : last.winner === 'player' ? 'lose' : 'tie') : undefined}
              />
            </div>
          </div>
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
            {hand && view.chooser === 'cpu' && !cpuPick && !busy
              ? t('m_handFollow')
              : hand && view.chooser === 'player' && !view.passed && free.length > 1
              ? t('m_handLead')
              : view.chooser === 'player'
              ? view.passed
                ? t('m_oppTimeUp')
                : free.length === 1
                ? t('m_last', { stat: statLabel(free[0]) })
                : view.round === 0
                  ? t('m_first')
                  : t('m_yourTurn')
              : cpuPick
                ? t('m_cpuPicks', { stat: statLabel(cpuPick) })
                : view.passed
                  ? t('m_timeUp')
                  : t('m_cpuThinking')}
          </div>
          {hint && view.chooser === 'player' && <p className="match-hint">{tr('m_hint')}</p>}
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
          <div className={`duel-stack ${busy && view.chooser === 'player' ? 'waiting' : ''}`}>
            <div className="duel-me deal-in" key={`me-${view.round}`}>
              <CardView
                card={current!}
                onPickStat={view.chooser === 'player' && !busy ? pick : undefined}
                lockedStats={view.usedStats}
                highlight={cpuPick ?? undefined}
              />
            </div>
            <div className="duel-opp deal-in cpu" key={`back-${view.round}`}>
              <CardBack label={t('m_cpuCard', { a: view.round + 1, b: ROUNDS })} />
            </div>
          </div>
          {hand && (
            <div className="hand-bar">
              <div className="hand-row" role="listbox" aria-label={tr('m_hand')}>
                {hand.map((id, i) => (
                  <button
                    key={id}
                    role="option"
                    aria-selected={i === selected}
                    className={`hand-card ${i === selected ? 'on' : ''}`}
                    disabled={busy || !!cpuPick}
                    onClick={() => {
                      sfx('tap');
                      setSel(i);
                    }}
                  >
                    <CardView card={cardOf(id)} size="sm" />
                  </button>
                ))}
              </div>
              {jollyChoices.length > 0 && (
                <div className="rj-arm">
                  {jollyChoices.map((k) => (
                    <button
                      key={k}
                      className={`rj-chip rj-${k} ${armed === k ? 'on' : ''}`}
                      disabled={busy || !!cpuPick}
                      aria-pressed={armed === k}
                      onClick={() => {
                        sfx('tap');
                        setArmed(armed === k ? null : k);
                      }}
                    >
                      <b>{k === 'drs' ? 'DRS' : 'SC'}</b> ×{boosts?.[k]}
                    </button>
                  ))}
                  <small>{armed ? tr(armed === 'drs' ? 'rj_drs_desc' : 'rj_sc_desc') : tr('rj_armHint')}</small>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* in basso: Abbandona e, dopo il round, «Prossimo round» sulla stessa riga (così non si scorre) */}
      {!finished && (
        <div className="match-actions">
          <button className="btn ghost quit-btn" onClick={quit}>
            <Flag size={16} /> {t('m_quit')}
          </button>
          {hand && choosing && view.chooser === 'cpu' && !busy && !cpuPick && (
            <button className="btn primary next-btn" onClick={follow}>
              {tr('m_playCard')}
            </button>
          )}
          {showResult && last && !synced && (
            <button
              className="btn primary next-btn"
              disabled={!settled}
              onClick={() => {
                sfx('tap');
                setShowResult(false);
              }}
            >
              {outcome ? t('m_final') : t('m_next')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
