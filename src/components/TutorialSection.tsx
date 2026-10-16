import { useState } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { useI18n, type TKey } from '../lib/i18n';

/**
 * Pulsante "?" nell'intestazione di una schermata: apre i consigli solo se servono.
 * `items` sono chiavi di traduzione; `params` i valori da inserire nei testi.
 */
export function HelpButton({ items, params }: { items: TKey[]; params?: Record<string, string | number> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon-btn help-btn" onClick={() => setOpen(true)} aria-label={t('tut_title')}>
        <CircleHelp size={20} />
      </button>
      {open && (
        <div className="overlay sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sheet-grip" />
            <header className="sheet-head">
              <h2>{t('tut_title')}</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label={t('close')}>
                <X size={20} />
              </button>
            </header>
            <ol className="tutorial-list">
              {items.map((k, i) => (
                <li key={k}>
                  <span className="step">{i + 1}</span>
                  <span>{t(k, params)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
