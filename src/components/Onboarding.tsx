import { useState } from 'react';
import { Layers, Sparkles, Swords, Trophy } from 'lucide-react';
import { useI18n, type TKey } from '../lib/i18n';
import { DECK_SIZE } from '../game/engine';
import { LangPicker } from './LangPicker';

export const ONBOARDING_KEY = 'f1-card-battle:onboarded-v1';

export const onboardingDone = () => {
  try {
    return !!localStorage.getItem(ONBOARDING_KEY);
  } catch {
    return true;
  }
};

const SLIDES: { icon: typeof Trophy; t: TKey; d: TKey }[] = [
  { icon: Sparkles, t: 'ob1_t', d: 'ob1_d' },
  { icon: Layers, t: 'ob2_t', d: 'ob2_d' },
  { icon: Swords, t: 'ob3_t', d: 'ob3_d' },
  { icon: Trophy, t: 'ob4_t', d: 'ob4_d' },
];

// Introduzione a schede mostrata al primo avvio (e riapribile dalle impostazioni).
export function Onboarding({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const last = step === SLIDES.length - 1;
  const S = SLIDES[step];
  const Icon = S.icon;

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      /* ignora */
    }
    onClose();
  };

  return (
    <div className="overlay onboarding" role="dialog" aria-modal="true">
      <div className="ob-card">
        <div className="ob-hero">
          <LangPicker />
          <div className="ob-icon" key={step}>
            <Icon size={36} />
          </div>
        </div>
        <div className="ob-body">
          <h2 key={`t${step}`}>{t(S.t)}</h2>
          <p key={`d${step}`}>{t(S.d, { n: DECK_SIZE })}</p>
          <div className="ob-dots">
            {SLIDES.map((_, i) => (
              <button key={i} className={i === step ? 'on' : ''} onClick={() => setStep(i)} aria-label={`${i + 1}`} />
            ))}
          </div>
          <button className="btn primary block big" onClick={() => (last ? dismiss() : setStep((s) => s + 1))}>
            {last ? t('ob_start') : t('ob_next')}
          </button>
          {!last && (
            <button className="btn text block" onClick={dismiss}>
              {t('ob_skip')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
