import { LogOut, Monitor, Moon, Music, RotateCcw, Smartphone, Sun, Volume2, X } from 'lucide-react';
import { hasMusic, setFeedback, useFeedbackSettings, type FeedbackSettings } from '../lib/feedback';
import { useI18n, type TKey } from '../lib/i18n';
import type { ThemePref } from '../lib/theme';
import type { Account } from '../hooks/useAccount';
import { CARDS_DATA } from '../game/cards';
import { LangPicker } from './LangPicker';
import { GoogleIcon } from './GoogleIcon';

interface Props {
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
  account: Account;
  onIntro: () => void;
  onReset: () => void;
  onClose: () => void;
}

const THEMES: { id: ThemePref; icon: typeof Sun; label: TKey }[] = [
  { id: 'system', icon: Monitor, label: 'theme_system' },
  { id: 'light', icon: Sun, label: 'theme_light' },
  { id: 'dark', icon: Moon, label: 'theme_dark' },
];

// Pannello impostazioni che sale dal basso: tema, lingua, account, introduzione.
export function SettingsSheet({ theme, onTheme, account, onIntro, onReset, onClose }: Props) {
  const { t } = useI18n();
  const fb = useFeedbackSettings();
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
          {account.session ? (
            <div className="account-row">
              <span className="avatar">{(account.name ?? '?').trim().charAt(0).toUpperCase()}</span>
              <div className="account-info">
                <b>{account.name}</b>
                <small className={`sync sync-${account.status}`}>{account.status !== 'offline' && t(`sync_${account.status}` as TKey)}</small>
              </div>
              <button className="btn ghost small" onClick={account.signOut}>
                <LogOut size={16} /> {t('signout')}
              </button>
            </div>
          ) : (
            <>
              <p className="muted small-text">{t('set_guest')}</p>
              <button className="btn google block" onClick={account.signIn}>
                <GoogleIcon /> {t('signin_google')}
              </button>
            </>
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
          <button className="btn text danger block" onClick={onReset}>
            <RotateCcw size={14} /> {t('reset')}
          </button>
        </section>

        <footer className="credits">
          {t('footer_data', { src: CARDS_DATA.source, date: CARDS_DATA.generatedAt })}
          {!CARDS_DATA.seasonComplete && t('footer_season', { y: CARDS_DATA.latestSeason })}. {t('footer_unofficial')}
        </footer>
      </div>
    </div>
  );
}
