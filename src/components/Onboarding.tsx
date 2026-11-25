import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
import type { Card, StatKey } from '../types';
import { CARD_BY_ID, PLAYABLE_CARDS, STATS, STAT_BY_KEY, formatStat, statHint, statLabel, statShort } from '../game/cards';
import { ROUNDS, cpuChooseStat, matchOutcome, playRound, type MatchState } from '../game/engine';
import { WINS_PER_PACK } from '../game/collection';
import { useI18n } from '../lib/i18n';
import { haptic, sfx } from '../lib/feedback';
import { CardBack, CardView } from './CardView';
import { LangPicker } from './LangPicker';

export const ONBOARDING_KEY = 'f1-card-battle:onboarded-v1';

export const onboardingDone = () => {
  try {
    return !!localStorage.getItem(ONBOARDING_KEY);
  } catch {
    return true;
  }
};

// Partita di prova: card fisse, in quest'ordine, scelte perché ogni round insegni qualcosa:
// 1) Senna batte Lauda quasi ovunque (pareggio solo sul miglior arrivo);
// 2) il Leclerc esordiente perde su tutto contro il Vettel campione, così poi sceglie la CPU;
// 3) la CPU sceglie la sua metrica migliore, ma Alonso la batte comunque.
const PLAYER = ['ayrton-senna__mclaren', 'charles-leclerc__sauber', 'fernando-alonso__ferrari'];
const CPU = ['niki-lauda__brabham', 'sebastian-vettel__red-bull', 'mick-schumacher__haas'];

function practiceDeck(ids: string[], offset: number): Card[] {
  const cards = ids.map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c);
  return cards.length === ids.length ? cards : PLAYABLE_CARDS.slice(offset, offset + ids.length);
}

const CPU_THINK_MS = 900;
const CPU_ANNOUNCE_MS = 1300;

type Phase = 'intro' | 'stats' | 'play' | 'result' | 'end' | 'outro';

// Tutorial interattivo del primo avvio (riapribile dalle impostazioni): il senso del gioco, le metriche
// e una partita di prova di 3 round contro la CPU, con un "coach" che spiega ogni passo.
export function Onboarding({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const start = useMemo<MatchState>(
    () => ({
      player: practiceDeck(PLAYER, 0),
      cpu: practiceDeck(CPU, 3),
      round: 0,
      chooser: 'player',
      usedStats: [],
      score: { player: 0, cpu: 0 },
      history: [],
    }),
    [],
  );
  const [phase, setPhase] = useState<Phase>('intro');
  const [match, setMatch] = useState(start);
  const [cpuPick, setCpuPick] = useState<StatKey | null>(null);

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      /* ignora */
    }
    onClose();
  };

  function play(stat: StatKey) {
    const next = playRound(match, stat);
    const won = next.history[next.history.length - 1].winner;
    sfx(won === 'player' ? 'roundWin' : won === 'cpu' ? 'roundLose' : 'roundTie');
    haptic(won === 'player' ? 'success' : won === 'cpu' ? 'error' : 'warning');
    setMatch(next);
    setCpuPick(null);
    setPhase('result');
  }

  // turno della CPU: "pensa", annuncia la metrica, poi gioca il round
  const cpuTurn = phase === 'play' && match.chooser === 'cpu';
  useEffect(() => {
    if (!cpuTurn) return;
    if (!cpuPick) {
      const tm = setTimeout(() => {
        setCpuPick(cpuChooseStat(match));
        sfx('tap');
      }, CPU_THINK_MS);
      return () => clearTimeout(tm);
    }
    const tm = setTimeout(() => play(cpuPick), CPU_ANNOUNCE_MS);
    return () => clearTimeout(tm);
  }, [cpuTurn, cpuPick]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = start.player.length;
  const last = match.history[match.history.length - 1];
  const outcome = matchOutcome(match);

  function coachText() {
    if (phase === 'play') {
      if (match.chooser === 'cpu') return cpuPick ? t('m_cpuPicks', { stat: statLabel(cpuPick) }) : t('tu_cpuTurn');
      if (match.round === 0) return t('tu_pick1', { n: total });
      return last?.winner === 'player' ? t('tu_pickAgain') : t('tu_pickTurn');
    }
    if (phase === 'result' && last) {
      const def = STAT_BY_KEY[last.stat];
      const params = {
        stat: statLabel(last.stat),
        a: formatStat(def, last.playerCard.stats[last.stat]),
        b: formatStat(def, last.cpuCard.stats[last.stat]),
      };
      const w = last.winner === 'player' ? 'Win' : last.winner === 'cpu' ? 'Lose' : 'Tie';
      const parts = [t(`tu_${w.toLowerCase() as 'win' | 'lose' | 'tie'}`, params)];
      if (def.lowerWins) parts.push(t('tu_low'));
      if (!outcome) parts.push(t(`tu_next${w}`));
      return parts.join(' ');
    }
    return '';
  }

  const coach = (text: string) => (
    <div className="tu-coach" key={text}>
      <GraduationCap size={22} aria-hidden />
      <p>{text}</p>
    </div>
  );

  const skip = (
    <button className="icon-btn tu-skip" onClick={dismiss} aria-label={t('ob_skip')} title={t('ob_skip')}>
      <X size={20} />
    </button>
  );

  // introduzione, metriche e saluto finale: schede con testo
  if (phase === 'intro' || phase === 'stats' || phase === 'outro') {
    return (
      <div className="overlay tutorial" role="dialog" aria-modal="true">
        <div className="tu-page screen">
          <div className="tu-top">
            {phase === 'intro' ? <LangPicker /> : <span />}
            {skip}
          </div>
          {phase === 'intro' && (
            <>
              <h2 className="tu-title">{t('tu_intro_t')}</h2>
              <p className="tu-text">{t('tu_intro_d')}</p>
              <div className="tu-card">
                <CardView card={start.player[0]} />
              </div>
            </>
          )}
          {phase === 'stats' && (
            <>
              <h2 className="tu-title">{t('tu_stats_t', { n: STATS.length })}</h2>
              <p className="tu-text">{t('tu_stats_d')}</p>
              <ul className="tu-stats">
                {STATS.map((s) => (
                  <li key={s.key}>
                    <b>
                      {statLabel(s.key)}
                      {s.lowerWins && <i className="low"> ↓</i>}
                    </b>
                    <small>{statHint(s.key)}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
          {phase === 'outro' && (
            <>
              <h2 className="tu-title">{t('tu_out_t')}</h2>
              <p className="tu-text">{t('tu_out_d', { w: WINS_PER_PACK })}</p>
            </>
          )}
          <div className="tu-actions">
            {phase === 'intro' && (
              <button className="btn primary block big" onClick={() => setPhase('stats')}>
                {t('ob_next')}
              </button>
            )}
            {phase === 'stats' && (
              <button className="btn primary block big" onClick={() => setPhase('play')}>
                {t('tu_try')}
              </button>
            )}
            {phase === 'outro' && (
              <button className="btn primary block big" onClick={dismiss}>
                {t('ob_start')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // partita di prova
  const shownRound = Math.min(match.round + (phase === 'result' ? 0 : 1), total);
  return (
    <div className="overlay tutorial" role="dialog" aria-modal="true">
      <div className="tu-page screen match">
        <div className="tu-top">
          <span className="tu-badge">{t('tu_badge')}</span>
          {skip}
        </div>
        <div className="scoreboard">
          <div className="side you">
            <small>{t('m_you')}</small>
            <b>{match.score.player}</b>
          </div>
          <div className="round">
            {phase === 'end' ? t('m_end') : t('m_round', { a: shownRound, b: total })}
            <div className="round-dots">
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={`rd ${match.history[i] ? `rd-${match.history[i].winner}` : ''}`} />
              ))}
            </div>
          </div>
          <div className="side cpu">
            <small>{t('m_cpu')}</small>
            <b>{match.score.cpu}</b>
          </div>
        </div>

        {phase === 'end' ? (
          <>
            <div className="match-over">
              <h2 className={`over-${outcome}`}>{outcome === 'player' ? t('m_win') : outcome === 'cpu' ? t('m_lose') : t('m_draw')}</h2>
              <ol className="recap">
                {match.history.map((h, i) => {
                  const def = STAT_BY_KEY[h.stat];
                  return (
                    <li key={i} className={`rd-${h.winner}`}>
                      <span>
                        {statLabel(h.stat)}
                        <small className="muted"> · {h.chooser === 'player' ? t('m_byYou') : t('m_byCpu')}</small>
                      </span>
                      <span>
                        {h.playerCard.driver.abbreviation} {formatStat(def, h.playerCard.stats[h.stat])} – {formatStat(def, h.cpuCard.stats[h.stat])}{' '}
                        {h.cpuCard.driver.abbreviation}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            {coach(t('tu_end_d', { n: ROUNDS }))}
            <div className="match-actions">
              <button className="btn primary next-btn" onClick={() => setPhase('outro')}>
                {t('ob_next')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="stat-chips">
              {STATS.map((s) => {
                const h = match.history.find((x) => x.stat === s.key);
                return (
                  <span key={s.key} className={`stat-chip ${h ? `used rd-${h.winner}` : ''}`} title={statLabel(s.key)}>
                    {statShort(s.key)}
                  </span>
                );
              })}
            </div>
            {coach(coachText())}
            {phase === 'result' && last ? (
              <>
                <div className={`duel-stack revealed clash-${last.winner}`}>
                  <div className="duel-me">
                    <CardView
                      card={last.playerCard}
                      highlight={last.stat}
                      result={last.winner === 'player' ? 'win' : last.winner === 'cpu' ? 'lose' : 'tie'}
                    />
                  </div>
                  <div className="duel-opp flip-reveal" key={`cpu-${match.round}`}>
                    <CardView
                      card={last.cpuCard}
                      highlight={last.stat}
                      result={last.winner === 'cpu' ? 'win' : last.winner === 'player' ? 'lose' : 'tie'}
                    />
                  </div>
                </div>
                <div className={`compare compare-${last.winner}`}>
                  <span className="you">
                    {last.playerCard.driver.abbreviation} <b>{formatStat(STAT_BY_KEY[last.stat], last.playerCard.stats[last.stat])}</b>
                  </span>
                  <small>{statShort(last.stat)}</small>
                  <span className="opp">
                    <b>{formatStat(STAT_BY_KEY[last.stat], last.cpuCard.stats[last.stat])}</b> {last.cpuCard.driver.abbreviation}
                  </span>
                </div>
                <div className="match-actions">
                  <button
                    className="btn primary next-btn"
                    onClick={() => {
                      sfx('tap');
                      setPhase(outcome ? 'end' : 'play');
                    }}
                  >
                    {outcome ? t('m_final') : t('m_next')}
                  </button>
                </div>
              </>
            ) : (
              <div className={`duel-stack ${cpuTurn ? 'waiting' : ''} ${cpuTurn ? '' : 'tu-pick'}`}>
                <div className="duel-me deal-in" key={`me-${match.round}`}>
                  <CardView
                    card={match.player[match.round]}
                    onPickStat={cpuTurn ? undefined : play}
                    lockedStats={match.usedStats}
                    highlight={cpuPick ?? undefined}
                  />
                </div>
                <div className="duel-opp deal-in cpu" key={`back-${match.round}`}>
                  <CardBack label={t('m_cpuCard', { a: match.round + 1, b: total })} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
