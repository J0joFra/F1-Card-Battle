import { Check, Lock, Trophy } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { LEAGUES, PROMOTION_REWARD, RANKED_POINTS, leagueProgress, rankedOf } from '../game/ranked';
import type { Progress } from '../game/collection';
import { LeagueBadge, leagueName } from '../components/Ranked';
import type { ReactNode } from 'react';
import { coin } from '../lib/season';

/*
 * Campionati (stile Clash Royale): il tuo campionato con le coppe, la gara online e il percorso
 * dal Karting OK-Junior alla Formula 1 con i premi di ogni promozione.
 */
interface Props {
  progress: Progress;
  online: boolean; // profilo creato: si può gareggiare online
  busy: boolean;
  onPlay: () => void;
  onProfile: () => void;
  tabs: ReactNode; // schede Campionato / Amici
}

export function RankedScreen({ progress, online, busy, onPlay, onProfile, tabs }: Props) {
  const { t } = useI18n();
  const { points, best } = rankedOf(progress);
  const { league, ratio, toNext } = leagueProgress(points);
  const road = LEAGUES.map((l, i) => ({ ...l, i })).reverse();
  return (
    <div className="screen ranked">
      <header className="screen-head">{tabs}</header>

      <section className={`rk-hero lg-${LEAGUES[league].id}`}>
        <LeagueBadge league={league} size={96} />
        <small>{t('rk_yourLeague')}</small>
        <h3>{leagueName(league, t)}</h3>
        <div className="rk-cups">
          <Trophy size={20} /> <b>{points}</b> <span>{t('rk_cupsWord')}</span>
        </div>
        <div className="bar">
          <div style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <p className="muted">{toNext !== null ? t('rk_toNext', { n: toNext, league: leagueName(league + 1, t) }) : t('rk_top')}</p>
        {online ? (
          <button className="btn primary big block" onClick={onPlay} disabled={busy}>
            <Trophy size={18} /> {t('rk_play')}
          </button>
        ) : (
          <button className="btn primary block" onClick={onProfile}>
            {t('rk_needProfile')}
          </button>
        )}
        <ul className="odds-chips rk-rules">
          <li>⚔️ {t('rk_ruleFormat')}</li>
          <li>🏆 {t('rk_rulePoints', { w: RANKED_POINTS.player, d: RANKED_POINTS.draw, l: `−${-RANKED_POINTS.cpu}` })}</li>
          <li>🃏 {t('rk_ruleFirst')}</li>
          <li>🛡️ {t('rk_ruleFloor')}</li>
        </ul>
      </section>

      <section className="panel rk-road">
        <b>{t('rk_road')}</b>
        <ol>
          {road.map(({ id, min, i }) => {
            const state = i === league ? 'here' : i < league ? 'done' : 'next';
            const reward = PROMOTION_REWARD[i];
            const got = i <= best;
            return (
              <li key={id} className={`rk-step ${state} lg-${id}`}>
                <LeagueBadge league={i} size={state === 'here' ? 52 : 40} />
                <div className="rk-step-info">
                  <b>{leagueName(i, t)}</b>
                  <small>
                    <Trophy size={12} /> {min}
                  </small>
                </div>
                <div className="rk-step-side">
                  {state === 'here' && <span className="rk-here">{t('rk_here')}</span>}
                  {(reward.packs > 0 || reward.credits > 0) && (
                    <span className={`rk-reward ${got ? 'got' : ''}`}>
                      {got ? <Check size={13} /> : state === 'next' ? <Lock size={13} /> : null}
                      {reward.packs > 0 && <> 🎁 {reward.packs}</>}
                      {reward.credits > 0 && (
                        <>
                          {' '}
                          {coin()} {reward.credits}
                        </>
                      )}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

    </div>
  );
}
