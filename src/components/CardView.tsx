import type { CSSProperties } from 'react';
import type { Card, StatKey } from '../types';
import { RARITY_LABEL, STATS, flagEmoji, formatStat } from '../game/cards';
import { teamColor } from '../game/teamColors';

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

function palmaresLine(card: Card) {
  const { vittorie, podi, mondiali } = card.palmares;
  const parts = [];
  if (mondiali) parts.push(`🏆 ${mondiali} ${mondiali === 1 ? 'mondiale' : 'mondiali'}`);
  if (vittorie) parts.push(`${vittorie} ${vittorie === 1 ? 'vittoria' : 'vittorie'}`);
  else if (podi) parts.push(`${podi} ${podi === 1 ? 'podio' : 'podi'}`);
  return parts.join(' · ');
}

export function CardView({ card, size = 'md', onPickStat, lockedStats, highlight, result, dimmed, count, onClick }: Props) {
  const color = card.kind === 'career' ? '#c9a227' : teamColor(card.team.id);
  const style = { '--team': color } as CSSProperties;
  const palmares = palmaresLine(card);
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
        {size === 'md' && palmares && <div className="card-palmares">{palmares}</div>}
      </div>
      {size === 'md' && (
        <ul className="card-stats">
          {STATS.map((s) => {
            const locked = !!lockedStats?.includes(s.key);
            const content = (
              <>
                <span>
                  {s.label}
                  {s.lowerWins && <i className="low" title="Vince il più basso">↓</i>}
                  {locked && <i className="lock"> 🔒</i>}
                </span>
                <b>{formatStat(s, card.stats[s.key])}</b>
              </>
            );
            return (
              <li key={s.key} className={`${highlight === s.key ? 'hl' : ''} ${locked ? 'locked' : ''}`}>
                {onPickStat ? (
                  <button type="button" onClick={() => onPickStat(s.key)} disabled={locked} title={locked ? 'Già usata in questa partita' : s.hint}>
                    {content}
                  </button>
                ) : (
                  <div className="stat-row" title={s.hint}>{content}</div>
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
