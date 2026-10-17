import type { CSSProperties } from 'react';
import type { Card, StatKey } from '../types';
import { STATS, flagEmoji, formatStat, rarityLabel, statHint, statLabel } from '../game/cards';
import { teamColor } from '../game/teamColors';
import { useI18n, type TFn } from '../lib/i18n';
import { DriverArt } from './DriverArt';

interface Props {
  card: Card;
  size?: 'sm' | 'md';
  onPickStat?: (stat: StatKey) => void;
  lockedStats?: StatKey[]; // metriche già usate in questa partita
  highlight?: StatKey;
  result?: 'win' | 'lose' | 'tie';
  dimmed?: boolean;
  count?: number;
  onClick?: () => void;
}

function palmaresLine(card: Card, t: TFn) {
  const { vittorie, podi, mondiali } = card.palmares;
  const parts: string[] = [];
  if (mondiali) parts.push(`🏆 ${t(mondiali === 1 ? 'pal_title_one' : 'pal_title_many', { n: mondiali })}`);
  if (vittorie) parts.push(t(vittorie === 1 ? 'pal_win_one' : 'pal_win_many', { n: vittorie }));
  else if (podi) parts.push(t(podi === 1 ? 'pal_podium_one' : 'pal_podium_many', { n: podi }));
  return parts.join(' · ');
}

export const teamLabel = (card: Card, t: TFn) => (card.kind === 'career' ? `★ ${t('card_career')}` : card.team.name);

export function CardView({ card, size = 'md', onPickStat, lockedStats, highlight, result, dimmed, count, onClick }: Props) {
  const { t } = useI18n();
  const color = card.kind === 'career' ? '#c9a227' : teamColor(card.team.id);
  const style = { '--team': color } as CSSProperties;
  const palmares = palmaresLine(card, t);
  return (
    <div
      className={`card card-${size} rarity-${card.rarity} ${result ? `result-${result}` : ''} ${dimmed ? 'dimmed' : ''} ${onClick ? 'clickable' : ''}`}
      style={style}
      onClick={onClick}
    >
      <div className="card-art">
        <DriverArt card={card} />
        <span className="card-flag" aria-hidden>
          {flagEmoji(card.driver.country)}
        </span>
        <span className="card-rarity">{rarityLabel(card.rarity)}</span>
        <span className="card-abbr">{card.driver.abbreviation}</span>
        {card.kind === 'pioneer' ? (
          <span className="card-ovr" title={t('card_collectOnly')}>
            🏛
          </span>
        ) : (
          <span className="card-ovr" title={t('ovr_hint')}>
            {card.ovr}
          </span>
        )}
      </div>
      <div className="card-title">
        <div className="card-name">{card.driver.name}</div>
        <div className="card-team">
          {teamLabel(card, t)} · {card.period}
        </div>
        {size === 'md' && palmares && <div className="card-palmares">{palmares}</div>}
      </div>
      {size === 'md' && (
        <ul className="card-stats">
          {STATS.map((s) => {
            const locked = !!lockedStats?.includes(s.key);
            const content = (
              <>
                <span>
                  {statLabel(s.key)}
                  {s.lowerWins && (
                    <i className="low" title={t('lower_wins')}>
                      ↓
                    </i>
                  )}
                </span>
                <b>{formatStat(s, card.stats[s.key])}</b>
              </>
            );
            return (
              <li key={s.key} className={`${highlight === s.key ? 'hl' : ''} ${locked ? 'locked' : ''}`}>
                {onPickStat ? (
                  <button
                    type="button"
                    onClick={() => onPickStat(s.key)}
                    disabled={locked}
                    title={locked ? t('card_used') : statHint(s.key)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="stat-row" title={statHint(s.key)}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {count !== undefined && count > 1 && <span className="card-count">×{count}</span>}
    </div>
  );
}

export function CardBack({ size = 'md', onClick, label }: { size?: 'sm' | 'md'; onClick?: () => void; label?: string }) {
  return (
    <div className={`card card-${size} card-back ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="card-back-logo">
        F1
        <small>Card Battle</small>
      </div>
      {label && <div className="card-back-label">{label}</div>}
    </div>
  );
}
