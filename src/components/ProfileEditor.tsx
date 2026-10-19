import { useMemo, useState } from 'react';
import { Check, Copy, Dices, Search, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { errorMessage } from '../lib/api';
import { flagEmoji } from '../game/cards';
import {
  AVATAR_OPTIONS,
  DRIVERS,
  NICK_MAX,
  cleanNickname,
  randomAvatar,
  type Avatar,
  type AvatarPart,
  type PlayerProfile,
} from '../game/profile';
import type { ProfileInput } from '../hooks/useAccount';
import { PlayerAvatar } from './PlayerAvatar';
import type { TKey } from '../lib/i18n';

// schede dell'avatar: per ognuna le parti da scegliere (a colori o con le miniature)
const TABS: { key: TKey; parts: AvatarPart[] }[] = [
  { key: 'av_face', parts: ['skin'] },
  { key: 'av_hair', parts: ['hair', 'hairColor'] },
  { key: 'av_eyes', parts: ['eyes', 'eyeColor', 'brows'] },
  { key: 'av_mouth', parts: ['mouth'] },
  { key: 'av_beard', parts: ['beard'] },
  { key: 'av_glasses', parts: ['glasses'] },
  { key: 'av_suit', parts: ['suit'] },
];
const COLOR_PARTS: AvatarPart[] = ['skin', 'hairColor', 'eyeColor', 'suit'];

interface Props {
  mode: 'create' | 'edit' | 'complete'; // complete: account ripreso con il codice, mancano nickname e avatar
  initial?: PlayerProfile | null;
  onCreate?: (input: ProfileInput) => Promise<string | null>; // restituisce il codice di recupero
  onRecover?: (code: string) => Promise<string | null>;
  onSave?: (input: ProfileInput) => Promise<void>;
  onLater?: () => void;
  onClose: () => void;
}

const driverName = (id: string | null) => DRIVERS.find((d) => d.id === id)?.name ?? null;

// Creazione (o modifica) del profilo: nickname, casco-avatar, pilota preferito. In creazione si può anche
// riprendere un account con il codice di recupero.
export function ProfileEditor({ mode, initial, onCreate, onRecover, onSave, onLater, onClose }: Props) {
  const { t } = useI18n();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [avatar, setAvatar] = useState<Avatar>(() => initial?.avatar ?? randomAvatar());
  const [favorite, setFavorite] = useState<string | null>(initial?.favorite ?? null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [code, setCode] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null); // codice di recupero da mostrare
  const [tab, setTab] = useState(0);

  const nickOk = !!cleanNickname(nickname);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return DRIVERS.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);
  const set = <K extends keyof Avatar>(k: K, v: Avatar[K]) => setAvatar((a) => ({ ...a, [k]: v }));

  async function run(task: () => Promise<string | null | void>) {
    setBusy(true);
    setError(null);
    try {
      const res = await task();
      if (typeof res === 'string') setNewCode(res);
      else onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const input = (): ProfileInput => ({ nickname: cleanNickname(nickname)!, avatar, favorite });
  const submit = () => run(async () => (mode === 'create' ? onCreate!(input()) : onSave!(input())));

  // codice di recupero appena creato: si mostra una volta, va salvato
  if (newCode) return <RecoveryCode code={newCode} onDone={onClose} />;

  return (
    <div className="overlay profile-backdrop">
      <div className="profile-editor" role="dialog" aria-modal="true">
        {mode === 'edit' && (
          <button className="icon-btn modal-close" onClick={onClose} aria-label={t('close')}>
            <X size={20} />
          </button>
        )}
        <h2>{mode === 'create' ? t('pr_createTitle') : mode === 'complete' ? t('pr_completeTitle') : t('pr_editTitle')}</h2>
        {mode === 'create' && <p className="muted center">{t('pr_createSub')}</p>}
        {mode === 'complete' && <p className="muted center">{t('pr_completeSub')}</p>}

        {recovering ? (
          <section className="pr-recover">
            <p className="muted">{t('pr_recoverHelp')}</p>
            <input
              className="pr-input code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-EFGH-JKLM"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={16}
            />
            {error && <p className="pr-error">{error}</p>}
            <button
              className="btn primary big block"
              disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length !== 12}
              onClick={() => run(() => onRecover!(code))}
            >
              {t('pr_recover')}
            </button>
            <button className="btn text block" onClick={() => setRecovering(false)}>
              {t('back')}
            </button>
          </section>
        ) : (
          <>
            <div className="pr-preview">
              <PlayerAvatar avatar={avatar} size={128} />
              <b>{nickname.trim() || t('pr_nickPlaceholder')}</b>
              {favorite && <small className="muted">❤️ {driverName(favorite)}</small>}
            </div>

            <label className="pr-field">
              <span>{t('pr_nickname')}</span>
              <input
                className="pr-input"
                value={nickname}
                maxLength={NICK_MAX}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('pr_nickPlaceholder')}
                autoComplete="nickname"
              />
              <small className={nickname && !nickOk ? 'pr-error' : 'muted'}>{t('pr_nickRules', { max: NICK_MAX })}</small>
            </label>

            <section className="pr-field">
              <span className="pr-row">
                {t('pr_avatar')}
                <button className="btn ghost small" onClick={() => setAvatar(randomAvatar())}>
                  <Dices size={16} /> {t('pr_random')}
                </button>
              </span>
              <div className="av-tabs" role="tablist">
                {TABS.map((tb, i) => (
                  <button key={tb.key} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
                    {t(tb.key)}
                  </button>
                ))}
              </div>
              {TABS[tab].parts.map((part) =>
                COLOR_PARTS.includes(part) ? (
                  <div key={part} className="swatches">
                    {AVATAR_OPTIONS[part].map((c, i) => (
                      <button key={c} className={avatar[part] === i ? 'on' : ''} style={{ background: c }} onClick={() => set(part, i)} aria-label={c} />
                    ))}
                  </div>
                ) : (
                  <div key={part} className="av-options">
                    {AVATAR_OPTIONS[part].map((name, i) => (
                      <button key={name} className={avatar[part] === i ? 'on' : ''} onClick={() => set(part, i)} aria-label={name}>
                        <PlayerAvatar avatar={{ ...avatar, [part]: i }} size={58} zoom={part === 'hair' ? 'head' : 'face'} />
                      </button>
                    ))}
                  </div>
                ),
              )}
            </section>

            <section className="pr-field">
              <span>{t('pr_favorite')}</span>
              {favorite ? (
                <div className="pr-fav">
                  <span>❤️ {driverName(favorite)}</span>
                  <button className="icon-btn" onClick={() => setFavorite(null)} aria-label={t('close')}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="search">
                    <Search size={16} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pr_favSearch')} />
                  </div>
                  {matches.length > 0 && (
                    <ul className="pr-drivers">
                      {matches.map((d) => (
                        <li key={d.id}>
                          <button
                            onClick={() => {
                              setFavorite(d.id);
                              setQuery('');
                            }}
                          >
                            {flagEmoji(d.country)} {d.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {error && <p className="pr-error">{error}</p>}
            <button className="btn primary big block" disabled={busy || !nickOk} onClick={submit}>
              <Check size={18} /> {mode === 'edit' ? t('pr_save') : t('pr_create')}
            </button>
            {mode === 'complete' && onLater && (
              <button className="btn text block muted" onClick={onLater}>
                {t('pr_later')}
              </button>
            )}
            {mode === 'create' && (
              <>
                <button className="btn text block" onClick={() => setRecovering(true)}>
                  {t('pr_haveAccount')}
                </button>
                {onLater && (
                  <button className="btn text block muted" onClick={onLater}>
                    {t('pr_later')}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Il codice di recupero, appena creato: da copiare e tenere da parte.
export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="overlay modal-backdrop">
      <div className="modal recovery" role="dialog" aria-modal="true">
        <h2>🔑 {t('pr_codeTitle')}</h2>
        <p className="muted center">{t('pr_codeHelp')}</p>
        <code className="recovery-code">{code}</code>
        <button
          className="btn ghost block"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
        >
          <Copy size={16} /> {copied ? t('pr_copied') : t('pr_copy')}
        </button>
        <button className="btn primary big block" onClick={onDone}>
          {t('pr_codeSaved')}
        </button>
      </div>
    </div>
  );
}
