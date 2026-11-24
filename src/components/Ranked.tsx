import { useEffect, useId, useState, type CSSProperties } from 'react';
import { ChevronRight, Copy, Gift, Share2, Trophy, Users, X } from 'lucide-react';
import { useI18n, type TFn, type TKey } from '../lib/i18n';
import { callGame } from '../lib/api';
import { inviteLink, shareLink } from '../lib/links';
import { LEAGUES, LEAGUE_MAX_ORO, PROMOTION_REWARD, MAX_REFERRALS, REFERRAL_PACKS, leagueProgress, rankedOf, type RankedResult } from '../game/ranked';
import type { Progress } from '../game/collection';
import type { QueueInfo } from '../server/actions';

// Gara classificata: stemma del campionato, card in home, ricerca dell'avversario e invito agli amici.

export const leagueName = (i: number, t: TFn) => t(`lg_${LEAGUES[i].id}` as TKey);

// Stemma di ogni campionato: Karting = rondella a scacchi (1-3 chevron), F4/FR = esagono, F3/F2 = scudo alato, F1 = scudo con corona e alloro.
const BADGE: { c1: string; c2: string; trim: string; ink: string }[] = [
  { c1: '#8be04e', c2: '#3a8a1b', trim: '#eaffd9', ink: '#fff' },
  { c1: '#3cc46f', c2: '#13653a', trim: '#dcffe9', ink: '#fff' },
  { c1: '#22b8a5', c2: '#0b544c', trim: '#ccfff8', ink: '#fff' },
  { c1: '#4aa3ff', c2: '#1449a0', trim: '#e2f1ff', ink: '#fff' },
  { c1: '#ab8dff', c2: '#5427cc', trim: '#f0eaff', ink: '#fff' },
  { c1: '#ffb04f', c2: '#b0500c', trim: '#fff2df', ink: '#fff' },
  { c1: '#f4f7fb', c2: '#7d8da2', trim: '#ffffff', ink: '#243042' },
  { c1: '#ff4a3a', c2: '#940300', trim: '#ffd54a', ink: '#fff' },
];
const ABBR = ['OKJ', 'OK', 'KZ', 'F4', 'FR', 'F3', 'F2', 'F1'];
const HEX = 'M50 5 L89 27 L89 73 L50 95 L11 73 L11 27 Z';
const SHIELD = 'M50 8 L84 18 L84 50 C84 72 68 86 50 94 C32 86 16 72 16 50 L16 18 Z';

export function LeagueBadge({ league, size = 44, className = '' }: { league: number; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const b = BADGE[league];
  const g = `lbg${uid}`;
  const sh = `lbs${uid}`;
  const kart = league <= 2;
  const winged = league === 5 || league === 6;
  const f1 = league === 7;
  const body = kart ? null : league <= 4 ? HEX : SHIELD;
  return (
    <span className={`league-badge lg-${LEAGUES[league].id} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={b.c1} />
            <stop offset="1" stopColor={b.c2} />
          </linearGradient>
          <linearGradient id={sh} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <pattern id={`chk${uid}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="#fff" />
            <rect width="5" height="5" fill="#111" />
            <rect x="5" y="5" width="5" height="5" fill="#111" />
          </pattern>
          <clipPath id={`cl${uid}`}>{body ? <path d={body} /> : <circle cx="50" cy="50" r="44" />}</clipPath>
        </defs>
        {winged && (
          <g fill={b.trim} stroke={b.c2} strokeWidth="2">
            <path d="M18 30 C4 32 0 46 2 58 C8 52 12 50 18 50 Z" />
            <path d="M82 30 C96 32 100 46 98 58 C92 52 88 50 82 50 Z" />
          </g>
        )}
        {f1 && (
          <g fill="none" stroke="#ffd54a" strokeWidth="4" strokeLinecap="round">
            <path d="M14 34 C4 52 10 76 30 90" />
            <path d="M86 34 C96 52 90 76 70 90" />
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <ellipse cx={9 + i * 2.4} cy={44 + i * 12} rx="5" ry="2.6" fill="#ffd54a" stroke="none" transform={`rotate(${-50 + i * 14} ${9 + i * 2.4} ${44 + i * 12})`} />
                <ellipse cx={91 - i * 2.4} cy={44 + i * 12} rx="5" ry="2.6" fill="#ffd54a" stroke="none" transform={`rotate(${50 - i * 14} ${91 - i * 2.4} ${44 + i * 12})`} />
              </g>
            ))}
          </g>
        )}
        {body ? (
          <path d={body} fill={`url(#${g})`} stroke={b.trim} strokeWidth="5" strokeLinejoin="round" />
        ) : (
          <circle cx="50" cy="50" r="44" fill={`url(#${g})`} stroke={b.trim} strokeWidth="5" />
        )}
        <g clipPath={`url(#cl${uid})`}>
          {kart && <rect x="0" y="70" width="100" height="30" fill={`url(#chk${uid})`} opacity="0.85" />}
          {league >= 3 && league <= 4 && <path d="M0 78 L100 58 L100 66 L0 86 Z" fill={b.trim} opacity="0.5" />}
          {(winged || f1) && <path d="M50 8 L50 94" stroke={b.trim} strokeWidth="3" opacity="0.25" />}
          <rect className="lb-shine" x="-100" y="0" width="100" height="100" fill={`url(#${sh})`} />
        </g>
        {f1 && (
          <path d="M30 14 L36 0 L43 10 L50 -2 L57 10 L64 0 L70 14 Z" fill="#ffd54a" stroke="#a87b00" strokeWidth="1.5" transform="translate(0 6)" />
        )}
        <text x="50" y={kart ? 54 : 58} textAnchor="middle" fontSize={ABBR[league].length > 2 ? 26 : 32} fontWeight="900" fontStyle="italic" fill={b.ink} stroke={b.c2} strokeWidth="1" paintOrder="stroke">
          {ABBR[league]}
        </text>
        {kart &&
          Array.from({ length: league + 1 }, (_, i) => (
            <path key={i} d={`M${50 - league * 6 + i * 12 - 5} 22 l5 -5 l5 5`} fill="none" stroke={b.trim} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        {(league === 3 || league === 4) && <circle cx="50" cy="20" r="4" fill={b.trim} />}
        {league === 6 && <path d="M50 14 l3 6 l6 1 l-4.5 4 l1 6 l-5.5 -3 l-5.5 3 l1 -6 l-4.5 -4 l6 -1 Z" fill={b.c2} />}
      </svg>
    </span>
  );
}

// Animazione d'ingresso del campionato appena raggiunto (diversa per ogni campionato). Tocca per continuare.
export function LeagueIntro({ league, onDone }: { league: number; onDone: () => void }) {
  const { t } = useI18n();
  const id = LEAGUES[league].id;
  const reward = PROMOTION_REWARD[league];
  useEffect(() => {
    try {
      navigator.vibrate?.([30, 60, 30]);
    } catch {
      /* niente vibrazione */
    }
  }, []);
  return (
    <div className={`league-intro li-${id} lg-${id}`} role="dialog" aria-modal="true" onClick={onDone}>
      <span className="li-rays" aria-hidden />
      <span className="li-bits" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ '--a': `${i * 20}deg`, '--d': `${(i % 6) * 0.05}s` } as CSSProperties} />
        ))}
      </span>
      <div className="li-body">
        <small>{t('rk_newLeague')}</small>
        <LeagueBadge league={league} size={170} className="li-badge" />
        <h2>{leagueName(league, t)}</h2>
        <p>
          <span className="rk-oro" /> {t('rk_maxOro', { n: LEAGUE_MAX_ORO[league] })}
          {(reward.packs > 0 || reward.credits > 0) && (
            <>
              {' · '}
              {reward.packs > 0 && <>🎁 {reward.packs} </>}
              {reward.credits > 0 && <>🪙 {reward.credits}</>}
            </>
          )}
        </p>
        <button className="btn big li-go" onClick={onDone}>
          {t('continue')}
        </button>
      </div>
    </div>
  );
}

export function RankedPanel({ progress, online, busy, onPlay, onOpen, onProfile }: { progress: Progress; online: boolean; busy: boolean; onPlay: () => void; onOpen: () => void; onProfile: () => void }) {
  const { t } = useI18n();
  const { points } = rankedOf(progress);
  const { league, ratio, toNext } = leagueProgress(points);
  return (
    <section className={`panel ranked-panel lg-${LEAGUES[league].id}`}>
      <button className="ranked-head" onClick={onOpen} aria-label={t('rk_screen')}>
        <LeagueBadge league={league} />
        <div className="ranked-info">
          <small>{t('rk_label')}</small>
          <b>{leagueName(league, t)}</b>
          <span className="muted">
            <Trophy size={13} /> {points} {toNext !== null && <>· {t('rk_toNext', { n: toNext, league: leagueName(league + 1, t) })}</>}
          </span>
        </div>
        <ChevronRight size={20} className="ranked-go" />
      </button>
      <div className="bar small">
        <div style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      {online ? (
        <button className="btn primary big block" onClick={onPlay} disabled={busy}>
          <Trophy size={18} /> {t('rk_play')}
        </button>
      ) : (
        <button className="btn block" onClick={onProfile}>
          {t('rk_needProfile')}
        </button>
      )}
    </section>
  );
}

// Ricerca dell'avversario: dopo un po' senza nessuno in coda si propone di invitare un amico.
export function RankedQueue({ queue, progress, onCancel }: { queue: QueueInfo; progress: Progress; onCancel: () => void }) {
  const { t } = useI18n();
  const league = leagueProgress(rankedOf(progress).points).league;
  const [started] = useState(() => Date.now() - queue.waited);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - started) / 1000));
  const lonely = secs >= 15 && queue.searching === 0;
  return (
    <div className="overlay modal-backdrop ranked-queue">
      <div className="modal pop" role="dialog" aria-modal="true">
        <LeagueBadge league={league} size={64} />
        <h3 className="waiting-dots">{t('rk_searching')}</h3>
        <p className="muted">
          {leagueName(league, t)} · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          {queue.searching > 0 && <> · {t('rk_inQueue', { n: queue.searching })}</>}
        </p>
        {lonely && (
          <div className="rk-lonely">
            <p>{t('rk_lonely')}</p>
            <InviteFriend compact />
          </div>
        )}
        <button className="btn ghost block" onClick={onCancel}>
          <X size={16} /> {t('rk_cancel')}
        </button>
      </div>
    </div>
  );
}

// Fine gara: punti guadagnati o persi ed eventuale promozione con il suo premio.
export function RankedOutcome({ result }: { result: RankedResult }) {
  const { t } = useI18n();
  return (
    <div className={`ranked-outcome ${result.promoted !== undefined ? 'promoted' : ''}`}>
      <LeagueBadge league={result.league} size={result.promoted !== undefined ? 64 : 40} />
      <div>
        <b className={result.delta >= 0 ? 'up' : 'down'}>
          <Trophy size={14} /> {result.delta >= 0 ? '+' : ''}
          {result.delta} · {result.points}
        </b>
        {result.promoted !== undefined ? (
          <>
            <strong>{t('rk_promoted', { league: leagueName(result.promoted, t) })}</strong>
            <small>
              🎁 +{result.packs} · 🪙 +{result.credits}
            </small>
          </>
        ) : (
          <small className="muted">{leagueName(result.league, t)}</small>
        )}
      </div>
    </div>
  );
}

// Invita un amico: il tuo codice e il link da condividere; quando l'amico crea l'account ricevi i pacchetti.
export function InviteFriend({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<{ code: string; n: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    callGame({ action: 'invite_code' })
      .then((r) => alive && r.inviteCode && setInfo({ code: r.inviteCode, n: r.referrals ?? 0 }))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  async function share() {
    if (!info) return;
    const res = await shareLink(t('inv_shareText', { code: info.code }), inviteLink(info.code));
    if (res === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }
  if (failed) return null;
  return (
    <div className={`invite-friend ${compact ? 'compact' : 'panel'}`}>
      {!compact && (
        <b>
          <Gift size={16} /> {t('inv_title')}
        </b>
      )}
      <p className="muted">{t('inv_desc', { n: REFERRAL_PACKS })}</p>
      <div className="invite-row">
        <span className="code-big small">{info?.code ?? '······'}</span>
        <button className="btn primary friend-btn" onClick={share} disabled={!info}>
          {copied ? <Copy size={16} /> : <Share2 size={16} />} {copied ? t('fr_copied') : t('inv_share')}
        </button>
      </div>
      {info && !compact && <small className="muted">{t('inv_count', { a: Math.min(info.n, MAX_REFERRALS), b: MAX_REFERRALS })}</small>}
    </div>
  );
}

// Sezione Ranked: due schede, il campionato (gara classificata) e gli amici (sfide e inviti)
export function SocialTabs({ value, onChange }: { value: 'league' | 'friends'; onChange: (v: 'league' | 'friends') => void }) {
  const { t } = useI18n();
  return (
    <div className="social-tabs" role="tablist">
      {(['league', 'friends'] as const).map((v) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {v === 'league' ? <Trophy size={16} /> : <Users size={16} />} {t(v === 'league' ? 'soc_league' : 'soc_friends')}
        </button>
      ))}
    </div>
  );
}
