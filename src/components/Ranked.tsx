import { useEffect, useState } from 'react';
import { ChevronRight, Copy, Gift, Share2, Trophy, X } from 'lucide-react';
import { useI18n, type TFn, type TKey } from '../lib/i18n';
import { callGame } from '../lib/api';
import { inviteLink, shareLink } from '../lib/links';
import { LEAGUES, MAX_REFERRALS, REFERRAL_PACKS, leagueProgress, rankedOf, type RankedResult } from '../game/ranked';
import type { Progress } from '../game/collection';
import type { QueueInfo } from '../server/actions';

// Gara classificata: stemma del campionato, card in home, ricerca dell'avversario e invito agli amici.

export const leagueName = (i: number, t: TFn) => t(`lg_${LEAGUES[i].id}` as TKey);

export function LeagueBadge({ league, size = 44 }: { league: number; size?: number }) {
  return (
    <span className={`league-badge lg-${LEAGUES[league].id}`} style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden>
      {['OKJ', 'OK', 'KZ', 'F4', 'FR', 'F3', 'F2', 'F1'][league]}
    </span>
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
