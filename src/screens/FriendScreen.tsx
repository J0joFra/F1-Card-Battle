import { useEffect, useState } from 'react';
import { Copy, Share2, Users } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { callGame } from '../lib/api';
import { FRIEND_DRAW_CREDITS, FRIEND_WIN_CREDITS } from '../game/collection';
import { DECK_SIZE, TURN_SECONDS } from '../game/engine';
import type { Account } from '../hooks/useAccount';
import type { GameResponse, PvpInfo } from '../server/actions';
import { GoogleIcon } from '../components/GoogleIcon';
import { TutorialSection } from '../components/TutorialSection';
import { haptic, sfx } from '../lib/feedback';

const POLL_MS = 2000;

interface Props {
  account: Account;
  canPlay: boolean;
  lobby: PvpInfo | null; // sfida creata, in attesa dell'avversario
  onCreate: () => void;
  onJoin: (code: string) => void;
  onStart: (res: GameResponse) => void; // l'avversario è entrato: si gioca
  onCancel: () => void;
}

export function FriendScreen({ account, canPlay, lobby, onCreate, onJoin, onStart, onCancel }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // in attesa: si chiede al server ogni 2 secondi se l'amico è entrato
  useEffect(() => {
    if (!lobby) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const res = await callGame({ action: 'pvp_state', match: lobby.id });
        if (!alive) return;
        if (res.pvp?.status === 'playing') {
          clearInterval(id);
          sfx('select');
          haptic('success');
          onStart(res);
        } else if (res.pvp?.status === 'cancelled') onCancel();
      } catch {
        /* rete assente: si riprova al giro dopo */
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [lobby?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function share() {
    if (!lobby) return;
    const text = t('fr_shareText', { code: lobby.code });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      /* condivisione annullata: si copia e basta */
    }
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* niente appunti: il codice resta a schermo */
    }
  }

  const tutorial = (
    <TutorialSection
      items={['tut_friend_1', 'tut_friend_2', 'tut_friend_3']}
      params={{ n: DECK_SIZE, s: TURN_SECONDS, w: FRIEND_WIN_CREDITS, d: FRIEND_DRAW_CREDITS }}
    />
  );

  if (!account.online) {
    return (
      <div className="screen friend">
        <header className="screen-head">
          <h2>{t('fr_title')}</h2>
        </header>
        <section className="panel">
          <p>{t('fr_needLogin')}</p>
          <button className="btn google block" onClick={account.signIn}>
            <GoogleIcon /> {t('signin_google')}
          </button>
        </section>
        {tutorial}
      </div>
    );
  }

  if (lobby) {
    return (
      <div className="screen friend">
        <header className="screen-head">
          <h2>{t('fr_title')}</h2>
        </header>
        <section className="panel">
          <p className="center">{t('fr_yourCode')}</p>
          <div className="code-big">{lobby.code}</div>
          <button className="btn primary big block friend-btn" onClick={share}>
            {copied ? <Copy size={18} /> : <Share2 size={18} />} {copied ? t('fr_copied') : t('fr_share')}
          </button>
          <p className="muted center waiting-dots">{t('fr_waiting')}</p>
          <button className="btn ghost block" onClick={onCancel}>
            {t('fr_cancel')}
          </button>
        </section>
      </div>
    );
  }

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return (
    <div className="screen friend">
      <header className="screen-head">
        <h2>{t('fr_title')}</h2>
      </header>
      <p className="muted">{t('fr_desc', { w: FRIEND_WIN_CREDITS, d: FRIEND_DRAW_CREDITS })}</p>
      <section className="panel">
        <b>{t('fr_createTitle')}</b>
        <button className="btn primary big block friend-btn" onClick={onCreate} disabled={!canPlay}>
          <Users size={20} /> {t('fr_create')}
        </button>
      </section>
      <section className="panel">
        <b>{t('fr_joinTitle')}</b>
        <input
          className="code-input"
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('fr_codePh')}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          maxLength={8}
          aria-label={t('fr_codePh')}
        />
        <button className="btn primary block" onClick={() => onJoin(clean)} disabled={clean.length !== 6 || !canPlay}>
          {t('fr_join')}
        </button>
      </section>
      {!canPlay && <p className="muted">{t('home_needCards', { n: DECK_SIZE })}</p>}
      {tutorial}
    </div>
  );
}
