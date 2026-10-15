import { LANGS, useI18n } from '../lib/i18n';

// Selettore lingua a bandierine (usato nell'introduzione e nelle impostazioni).
export function LangPicker() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-picker" role="radiogroup">
      {LANGS.map((l) => (
        <button
          key={l.code}
          role="radio"
          aria-checked={lang === l.code}
          className={lang === l.code ? 'on' : ''}
          onClick={() => setLang(l.code)}
          title={l.label}
        >
          <span className="flag">{l.flag}</span>
          <span className="code">{l.code.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
