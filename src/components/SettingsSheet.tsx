import { Eye, EyeOff, Gamepad2, KeyRound, LogOut, Monitor, Moon, Music, PartyPopper, Pencil, RotateCcw, ShieldCheck, Smartphone, Sun, Trash2, Volume2, X } from 'lucide-react';
import { hasMusic, setFeedback, useFeedbackSettings, type FeedbackSettings } from '../lib/feedback';
import { useI18n, type TKey } from '../lib/i18n';
import type { ThemePref } from '../lib/theme';
import type { Account } from '../hooks/useAccount';
import { CARDS_DATA } from '../game/cards';
import { LangPicker } from './LangPicker';
import { PlayerAvatar } from './PlayerAvatar';
import { DRIVERS } from '../game/profile';
import { PRIVACY_URL } from '../lib/links';
import { playGamesAvailable } from '../lib/playGames';
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
              {pgResult && <small className="muted">{pgResult}</small>}
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
