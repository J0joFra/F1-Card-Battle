import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { haptic } from '../lib/feedback';

/*
 * Conferma dentro il gioco (al posto della finestra grigia del browser).
 * Uso: `if (await askConfirm('Vuoi uscire?')) ...` — basta montare <ConfirmHost /> una volta nell'app.
 */

interface Request {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let show: ((r: Request) => void) | null = null;

export function askConfirm(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(message));
    haptic('light');
    show({ message, ...opts, resolve });
  });
}

export function ConfirmHost() {
  const { t } = useI18n();
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);
  if (!req) return null;
  const answer = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };
  return (
    <div className="overlay modal-backdrop confirm-backdrop" onClick={() => answer(false)}>
      <div className="modal confirm pop" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <p>{req.message}</p>
        <div className="actions">
          <button className="btn ghost" onClick={() => answer(false)}>
            {t('cancel')}
          </button>
          <button className={`btn ${req.danger ? 'danger-solid' : 'primary'}`} onClick={() => answer(true)} autoFocus>
            {req.confirmLabel ?? t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
