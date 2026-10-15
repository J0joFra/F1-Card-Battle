import { CalendarDays, Check, Target } from 'lucide-react';
import { statLabel } from '../game/cards';
import {
  DAILY_REWARD_CREDITS,
  currentStreak,
  dailyPlayed,
  missionDone,
  type DailyChallenge,
  type DailyState,
  type DailyTheme,
  type Mission,
  type MissionsState,
} from '../game/daily';
import { teamColor } from '../game/teamColors';
import { useI18n, type TFn } from '../lib/i18n';

export const themeLabel = (theme: DailyTheme, t: TFn) =>
  theme.kind === 'team' ? t('daily_team', { team: theme.name }) : t('daily_decade', { d: theme.decade });

export function missionText(m: Mission, t: TFn) {
  switch (m.kind) {
    case 'win':
      return t('mis_win', { n: m.target });
    case 'play':
      return t('mis_play', { n: m.target });
    case 'roundsWithStat':
      return t('mis_roundsWithStat', { n: m.target, stat: statLabel(m.stat) });
    case 'winWithTeam':
      return t('mis_winWithTeam', { team: m.teamName });
    case 'winWithDecade':
      return t('mis_winWithDecade', { d: m.decade });
    case 'openPack':
      return t('mis_openPack');
    case 'bigWin':
      return t('mis_bigWin', { n: m.points });
    case 'bronzeRounds':
      return t('mis_bronzeRounds', { n: m.target });
  }
}

interface DailyProps {
  challenge: DailyChallenge;
  state: DailyState;
  canPlay: boolean;
  onPlay: () => void;
}

// Riquadro della sfida del giorno nella home.
export function DailyCard({ challenge, state, canPlay, onPlay }: DailyProps) {
  const { t } = useI18n();
  const played = dailyPlayed(state, challenge.date);
  const streak = currentStreak(state, challenge.date);
  const accent = challenge.theme.kind === 'team' ? teamColor(challenge.theme.team) : '#e8b931';
  return (
    <section className={`panel daily ${played ? 'done' : ''}`} style={{ '--daily': accent } as React.CSSProperties}>
      <div className="daily-head">
        <span className="daily-icon">
          <CalendarDays size={20} />
        </span>
        <div>
          <small>{t('daily_title')}</small>
          <b>{themeLabel(challenge.theme, t)}</b>
        </div>
        {streak > 0 && <span className="streak">{t('daily_streak', { n: streak })}</span>}
      </div>
      <div className="daily-deck" aria-hidden>
        {challenge.cpuDeck.map((c) => (
          <span key={c.id} className={`mini rarity-${c.rarity}`} style={{ '--team': teamColor(c.team.id) } as React.CSSProperties}>
            {played ? c.driver.abbreviation : '?'}
          </span>
        ))}
      </div>
      {played ? (
        <p className={`daily-result ${state.won ? 'won' : 'lost'}`}>{state.won ? t('daily_won') : t('daily_lost')}</p>
      ) : (
        <>
          <p className="muted">{t('daily_desc', { c: DAILY_REWARD_CREDITS })}</p>
          <button className="btn primary block" onClick={onPlay} disabled={!canPlay}>
            {t('daily_play')}
          </button>
        </>
      )}
    </section>
  );
}

// Le tre missioni del giorno, con barra di avanzamento e pulsante per ritirare il premio.
export function MissionsPanel({ missions, onClaim }: { missions: MissionsState; onClaim: (i: number) => void }) {
  const { t } = useI18n();
  return (
    <section className="panel missions">
      <h3>
        <Target size={18} /> {t('mis_title')}
      </h3>
      <ul>
        {missions.list.map((s, i) => {
          const done = missionDone(s);
          return (
            <li key={i} className={`${done ? 'done' : ''} ${s.claimed ? 'claimed' : ''}`}>
              <div className="mis-text">
                <span>{missionText(s.mission, t)}</span>
                <div className="bar small">
                  <div style={{ width: `${(s.progress / s.mission.target) * 100}%` }} />
                </div>
                <small className="muted">
                  {s.progress}/{s.mission.target} · 🪙 {s.reward}
                </small>
              </div>
              {s.claimed ? (
                <span className="mis-claimed">
                  <Check size={16} /> {t('mis_claimed')}
                </span>
              ) : (
                <button className="btn small accent" disabled={!done} onClick={() => onClaim(i)}>
                  {t('mis_claim')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
