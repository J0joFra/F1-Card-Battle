import { Check, Eye, EyeOff, Gamepad2, Mail, Medal, RefreshCw, UserCog, KeyRound, LogOut, Monitor, Moon, Music, PartyPopper, Pencil, RotateCcw, ShieldCheck, Smartphone, Sun, Trash2, Volume2, X } from 'lucide-react';
import { hasMusic, setFeedback, useFeedbackSettings, type FeedbackSettings } from '../lib/feedback';
import { useI18n, type TKey } from '../lib/i18n';
import type { ThemePref } from '../lib/theme';
import type { Account } from '../hooks/useAccount';
import { CARDS_DATA } from '../game/cards';
import { LangPicker } from './LangPicker';
import { PlayerAvatar } from './PlayerAvatar';
import { DRIVERS } from '../game/profile';
import { PRIVACY_URL } from '../lib/links';
import { callGame, errorMessage } from '../lib/api';
import type { SupportRequestView } from '../server/types';
import { playGamesAvailable, showAchievements } from '../lib/playGames';
import { AccessData } from './ProfileEditor';
import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

interface Props {
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
  onProfile: () => void; // crea o modifica il profilo
  onLogout: () => void; // esce dall'account su questo telefono
  seasons: boolean; // temi delle feste accesi
  onSeasons: (on: boolean) => void;
  account: Account;
  onIntro: () => void;
  onReset: () => void;
  onDeleteAccount: () => void;
  onClose: () => void;
}

const THEMES: { id: ThemePref; icon: typeof Sun; label: TKey }[] = [
  { id: 'system', icon: Monitor, label: 'theme_system' },
  { id: 'light', icon: Sun, label: 'theme_light' },
  { id: 'dark', icon: Moon, label: 'theme_dark' },
];

// Pannello impostazioni che sale dal basso: tema, lingua, account, introduzione.
export function SettingsSheet({
  theme,
  onTheme,
  seasons,
  onSeasons,
  account,
  onProfile,
  onLogout,
  onIntro,
  onReset,
  onDeleteAccount,
  onClose,
}: Props) {
  const { t } = useI18n();
  const fb = useFeedbackSettings();
  const [pgBusy, setPgBusy] = useState(false);
  const [pgResult, setPgResult] = useState<string | null>(null);
  // versione dell'app installata (solo app Android): per capire se il telefono ha l'ultimo aggiornamento
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    App.getInfo()
      .then((info) => setVersion(`${info.version} (${info.build})`))
      .catch(() => {});
  }, []);
  const favoriteName = DRIVERS.find((d) => d.id === account.profile?.favorite)?.name;
  const toggles: { key: keyof FeedbackSettings; icon: typeof Sun; label: TKey }[] = [
    { key: 'sound', icon: Volume2, label: 'fb_sound' },
    ...(hasMusic ? [{ key: 'music' as const, icon: Music, label: 'fb_music' as TKey }] : []),
    { key: 'haptics', icon: Smartphone, label: 'fb_haptics' },
  ];
  return (
    <div className="overlay sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <header className="sheet-head">
          <h2>{t('set_title')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <X size={20} />
          </button>
        </header>

        <section className="set-group">
          <h3>{t('set_account')}</h3>
          {account.profile ? (
            <>
              <div className="profile-row">
                <PlayerAvatar avatar={account.profile.avatar} size={52} />
                <div className="account-info">
                  <b>{account.profile.nickname}</b>
                  {favoriteName && <small>❤️ {favoriteName}</small>}
                  <small className={`sync sync-${account.status}`}>{account.status !== 'offline' && t(`sync_${account.status}` as TKey)}</small>
                </div>
                <button className="btn ghost small" onClick={onProfile}>
                  <Pencil size={16} /> {t('pr_edit')}
                </button>
              </div>
              <AccessBox username={account.username} code={account.code} />
              {playGamesAvailable() && (
                <button
                  className="btn ghost block"
                  disabled={pgBusy}
                  onClick={async () => {
                    setPgBusy(true);
                    const r = await account.connectPlayGames();
                    setPgBusy(false);
                    setPgResult(r.ok ? t('acc_pgLinked') : r.message === 'other' ? t('acc_pgOther') : t('acc_pgError', { e: r.message ?? '' }));
                  }}
                >
                  <Gamepad2 size={16} /> {t('acc_pgConnect')}
                </button>
              )}
              {playGamesAvailable() && (
                <button
                  className="btn ghost block"
                  onClick={async () => {
                    const err = await showAchievements();
                    if (err) setPgResult(t('acc_achievementsError', { e: err }));
                  }}
                >
                  <Medal size={16} /> {t('acc_achievements')}
                </button>
              )}
              {pgResult && <small className="muted selectable">{pgResult}</small>}
              {account.admin && <AdminBox reset={account.adminResetCode} />}
              <button className="btn ghost block" onClick={onLogout}>
                <LogOut size={16} /> {t('acc_logout')}
              </button>
            </>
          ) : (
            <button className="btn primary block" onClick={onProfile}>
              {t('pr_createTitle')}
            </button>
          )}
        </section>

        <section className="set-group">
          <h3>{t('set_theme')}</h3>
          <div className="segmented">
            {THEMES.map(({ id, icon: Icon, label }) => (
              <button key={id} className={theme === id ? 'on' : ''} onClick={() => onTheme(id)}>
                <Icon size={16} /> {t(label)}
              </button>
            ))}
          </div>
          <label className="toggle-row">
            <PartyPopper size={18} />
            <span>
              {t('set_seasons')}
              <small className="muted block-hint">{t('set_seasons_hint')}</small>
            </span>
            <input type="checkbox" role="switch" checked={seasons} onChange={(e) => onSeasons(e.target.checked)} />
          </label>
        </section>

        <section className="set-group">
          <h3>{t('set_feedback')}</h3>
          {toggles.map(({ key, icon: Icon, label }) => (
            <label key={key} className="toggle-row">
              <Icon size={18} />
              <span>{t(label)}</span>
              <input type="checkbox" role="switch" checked={fb[key]} onChange={(e) => setFeedback({ [key]: e.target.checked })} />
            </label>
          ))}
        </section>

        <section className="set-group">
          <h3>{t('set_language')}</h3>
          <LangPicker />
        </section>

        <section className="set-group">
          <button className="btn ghost block" onClick={onIntro}>
            {t('set_intro')}
          </button>
          {/* con l'accesso fatto la collezione è sul server: si ricomincia solo da ospite */}
          {!account.online && (
            <button className="btn text danger block" onClick={onReset}>
              <RotateCcw size={14} /> {t('reset')}
            </button>
          )}
          {account.online && (
            <button className="btn text danger block" onClick={onDeleteAccount}>
              <Trash2 size={14} /> {t('del_button')}
            </button>
          )}
          <a className="btn text block muted" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            <ShieldCheck size={14} /> {t('set_privacy')}
          </a>
        </section>

        <footer className="credits">
          {t('footer_data', { src: CARDS_DATA.source, date: CARDS_DATA.generatedAt })}
          {!CARDS_DATA.seasonComplete && t('footer_season', { y: CARDS_DATA.latestSeason })}. {t('footer_unofficial')}
          {version && <span className="block-hint"> v{version}</span>}
        </footer>
      </div>
    </div>
  );
}

// dati di accesso nelle impostazioni: username sempre, codice nascosto finché non lo chiedi
// Solo per l'amministratore: nuovo codice di accesso per chi l'ha dimenticato (il vecchio non vale più)
function AdminBox({ reset }: { reset: Account['adminResetCode'] }) {
  const { t } = useI18n();
  const [user, setUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ target: string; code: string } | null>(null);
  return (
    <div className="access-box">
      <div className="access-head">
        <UserCog size={16} /> <b>{t('acc_adminTitle')}</b>
      </div>
      <SupportRequests />
      <small className="muted">{t('acc_adminHint')}</small>
      <input className="pr-input" value={user} placeholder={t('acc_adminUser')} autoCapitalize="none" autoCorrect="off"
        onChange={(e) => { setUser(e.target.value); setDone(null); setMsg(null); }} />
      <button
        className="btn ghost block"
        disabled={busy || !user.trim()}
        onClick={async () => {
          if (!window.confirm(t('acc_adminConfirm', { user: user.trim() }))) return;
          setBusy(true);
          const r = await reset(user.trim());
          setBusy(false);
          if (r.code) setDone({ target: r.target ?? user.trim(), code: r.code });
          else setMsg(r.error === 'no_account' ? t('acc_adminNoAccount') : t('acc_adminError', { e: r.error ?? '' }));
        }}
      >
        <KeyRound size={16} /> {t('acc_adminReset')}
      </button>
      {done && (
        <p className="selectable">
          {t('acc_adminDone', { user: done.target })} <b className="admin-code">{done.code}</b>
        </p>
      )}
      {msg && <small className="muted">{msg}</small>}
    </div>
  );
}

// una domanda: la risposta del giocatore e, sotto, il dato vero dell'account con ✓ / ✗
function SupCheck({ label, answer, ok, real }: { label: string; answer: string; ok?: boolean; real?: string }) {
  const { t } = useI18n();
  return (
    <div className="sup-check">
      <small className="muted">{label}</small>
      <span>“{answer}”</span>
      {real !== undefined && (
        <span className={ok ? 'sup-ok' : 'sup-no'}>
          {ok ? '✓' : '✗'} <small>{t('sup_real')}:</small> {real}
        </span>
      )}
    </div>
  );
}

const mailto = (to: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const driverLabel = (id: string | null) => (id ? DRIVERS.find((d) => d.id === id)?.name ?? id : '—');

// Amministratore: richieste di chi ha dimenticato il codice. Accanto alle risposte ci sono i dati veri
// dell'account: se coincidono si approva, e si manda al giocatore l'email con username e nuovo codice.
function SupportRequests() {
  const { t } = useI18n();
  const [list, setList] = useState<SupportRequestView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ href: string; text: string }[]>([]);
  const load = () => {
    setError(null);
    callGame({ action: 'support_list' })
      .then((r) => setList(r.supportRequests ?? []))
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  async function resolve(r: SupportRequestView, approve: boolean) {
    if (!window.confirm(t(approve ? 'sup_approveConfirm' : 'sup_rejectConfirm', { user: r.username }))) return;
    setBusy(r.id);
    try {
      const res = await callGame({ action: 'support_resolve', id: r.id, approve });
      const name = res.target ?? r.account?.nickname ?? r.username;
      const href = approve
        ? mailto(r.email, t('sup_mailSubject'), t('sup_mailBody', { name, user: res.username ?? r.username, code: res.recoveryCode ?? '' }))
        : mailto(r.email, t('sup_mailRejectSubject'), t('sup_mailRejectBody', { user: r.username }));
      setDone((d) => [{ href, text: approve ? t('sup_doneApproved', { user: r.username, code: res.recoveryCode ?? '' }) : t('sup_doneRejected', { user: r.username }) }, ...d]);
      setList((l) => l?.filter((x) => x.id !== r.id) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sup-admin">
      <div className="access-head">
        <b>{t('sup_adminTitle', { n: list?.length ?? 0 })}</b>
        <button className="icon-btn" onClick={load} aria-label={t('sup_refresh')}>
          <RefreshCw size={16} />
        </button>
      </div>
      {error && <small className="pr-error">{error}</small>}
      {done.map((d, i) => (
        <div key={i} className="sup-done selectable">
          <p>{d.text}</p>
          <a className="btn primary block" href={d.href}>
            <Mail size={16} /> {t('sup_sendMail')}
          </a>
        </div>
      ))}
      {list && list.length === 0 && <small className="muted">{t('sup_none')}</small>}
      {list?.map((r) => {
        const a = r.account;
        const rareMatch = !!a?.rareCards.some((c) => c.match);
        const winsOk = !!a && r.answers.wins !== null && Math.abs(a.wins - r.answers.wins) <= Math.max(5, a.wins * 0.25);
        return (
          <div key={r.id} className="sup-req">
            <div className="sup-head">
              {a?.avatar && <PlayerAvatar avatar={a.avatar} size={44} />}
              <div>
                <b>{a?.nickname ?? r.username}</b> <small className="muted">@{r.username}</small>
                <br />
                <small className="muted selectable">{r.email} · {new Date(r.createdAt).toLocaleString()}</small>
              </div>
            </div>
            {!a ? (
              <p className="sup-no">{t('sup_noAccount')}</p>
            ) : (
              <div className="sup-checks">
                <SupCheck label={t('sup_favorite')} answer={driverLabel(r.answers.favorite)} ok={!!r.answers.favorite && r.answers.favorite === a.favorite} real={driverLabel(a.favorite)} />
                <SupCheck label={t('sup_card')} answer={r.answers.card || '—'} ok={rareMatch}
                  real={rareMatch ? a.rareCards.filter((c) => c.match).slice(0, 3).map((c) => c.name).join(' · ') : t('sup_rareCount', { n: a.rareCards.length })} />
                <SupCheck label={t('sup_wins')} answer={r.answers.wins === null ? '—' : String(r.answers.wins)} ok={winsOk} real={String(a.wins)} />
                <SupCheck label={t('sup_avatar')} answer={r.answers.avatar || '—'} />
                {r.answers.note && <SupCheck label={t('sup_note')} answer={r.answers.note} />}
              </div>
            )}
            <div className="sup-actions">
              <button className="btn primary" disabled={!a || busy === r.id} onClick={() => resolve(r, true)}>
                <Check size={16} /> {t('sup_approve')}
              </button>
              <button className="btn ghost" disabled={busy === r.id} onClick={() => resolve(r, false)}>
                <X size={16} /> {t('sup_reject')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AccessBox({ username, code }: { username: string | null; code: string | null }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="access-box">
      <div className="access-head">
        <KeyRound size={16} /> <b>{t('pr_codeTitle')}</b>
        {code && (
          <button className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={t(show ? 'acc_hide' : 'acc_show')}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      <AccessData username={username} code={code ? (show ? code : '••••-••••-••••') : null} />
      <small className="muted">{code ? t('acc_codeHelp') : t('acc_codeUnknown')}</small>
    </div>
  );
}
