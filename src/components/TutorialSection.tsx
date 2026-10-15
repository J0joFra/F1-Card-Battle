import { useState } from 'react';
import { ChevronDown, GraduationCap } from 'lucide-react';
import { useI18n, type TKey } from '../lib/i18n';

/**
 * Tendina "Rivedi tutorial" in fondo a una schermata, chiusa di default.
 * `items` sono chiavi di traduzione; `params` i valori da inserire nei testi.
 */
export function TutorialSection({ items, params }: { items: TKey[]; params?: Record<string, string | number> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <section className={`tutorial ${open ? 'open' : ''}`}>
      <button className="tutorial-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <GraduationCap size={18} />
        <span>{t('tut_title')}</span>
        <ChevronDown size={18} className="chev" />
      </button>
      {open && (
        <ol className="tutorial-list">
          {items.map((k, i) => (
            <li key={k}>
              <span className="step">{i + 1}</span>
              <span>{t(k, params)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
