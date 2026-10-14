import type { CSSProperties } from 'react';
import type { Card, StatKey } from '../types';
import { NO_FINISH, RARITY_LABEL, STATS, flagEmoji } from '../game/cards';
import { teamColor } from '../game/teamColors';

interface Props {
  card: Card;
  size?: 'sm' | 'md';
  onPickStat?: (stat: StatKey) => void;
  highlight?: StatKey;
  result?: 'win' | 'lose' | 'tie';
  dimmed?: boolean;
  count?: number;
  onClick?: () => void;
}

function fmt(v: number, suffix?: string, isPosition?: boolean) {
  if (isPosition) return v >= NO_FINISH ? '—' : `${v}°`;
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}${suffix ?? ''}`;
}

export function CardView({ card, size = 'md', onPickStat, highlight, result, dimmed, count, onClick }: Props) {
  const color = card.kind === 'career' ? '#c9a227' : teamColor(card.team.id);
  const style = { '--team': color } as CSSProperties;
  return (
    <div
      className={`card card-${size} rarity-${card.rarity} ${result ? `result-${result}` : ''} ${dimmed ? 'dimmed' : ''} ${onClick ? 'clickable' : ''}`}
      style={style}
      onClick={onClick}
    >
      <div className="card-head">
        <span className="card-number">{card.kind === 'career' ? '★' : card.number ?? ''}</span>
        <span className="card-rarity">{RARITY_LABEL[card.rarity]}</span>
      </div>
      <div className="card-hero">
        <span className="card-abbr">{card.driver.abbreviation}</span>
        <span className="card-flag" aria-hidden>{flagEmoji(card.driver.country)}</span>
      </div>
      <div className="card-title">
        <div className="card-name">{card.driver.name}</div>
        <div className="card-team">
          {card.kind === 'career' ? '★ Carriera' : card.team.name} · {card.period}
        </div>
      </div>
      {size === 'md' && (
        <ul className="card-stats">
          {STATS.map((s) => {
            const content = (
              <>
                <span>{s.label}</span>
                <b>{fmt(card.stats[s.key], s.suffix, s.lowerWins)}</b>
              </>
            );
            return (
              <li key={s.key} className={highlight === s.key ? 'hl' : ''}>
                {onPickStat ? (
                  <button type="button" onClick={() => onPickStat(s.key)}>
                    {content}
                  </button>
                ) : (
                  <div className="stat-row">{content}</div>
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
