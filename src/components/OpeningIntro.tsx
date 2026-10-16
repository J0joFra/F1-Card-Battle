import { useEffect, useState } from 'react';
import { haptic, reducedMotion, sfx } from '../lib/feedback';

const TOTAL_MS = 2300; // durata dell'animazione

// bordo seghettato della striscia che si strappa (e del bordo della busta sotto)
const TEETH = 18;
const zigzag = (bottom: boolean) => {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH * 2; i++) {
    const x = (i / (TEETH * 2)) * 100;
    const y = bottom ? (i % 2 ? 100 : 72) : i % 2 ? 0 : 3.5;
    pts.push(`${x.toFixed(2)}% ${y}%`);
  }
  return bottom ? `polygon(0 0, 100% 0, ${pts.reverse().join(', ')})` : `polygon(${pts.join(', ')}, 100% 100%, 0 100%)`;
};
const TOP_CLIP = zigzag(true);
const BODY_CLIP = zigzag(false);
const TEAR_MS = 650; // quando si strappa la busta

/*
 * Animazione di apertura: una busta F1 arriva, si strappa in alto ed esce la card con il logo.
 * Si vede a ogni avvio dell'app; un tocco la salta.
 */
export function OpeningIntro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (reducedMotion()) {
      const id = setTimeout(onDone, 500);
      return () => clearTimeout(id);
    }
    const tear = setTimeout(() => {
      sfx('pack');
      haptic('medium');
    }, TEAR_MS);
    const out = setTimeout(() => setLeaving(true), TOTAL_MS - 350);
    const done = setTimeout(onDone, TOTAL_MS);
    return () => [tear, out, done].forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    setLeaving(true);
    setTimeout(onDone, 250);
  };

  return (
    <div className={`intro ${leaving ? 'leaving' : ''} ${reducedMotion() ? 'still' : ''}`} onClick={skip} aria-hidden>
      <div className="intro-stage">
        <img className="intro-card" src="./logo-card.png" alt="" draggable={false} />
        <div className="intro-pack">
          <div className="intro-pack-top" style={{ clipPath: TOP_CLIP }} />
          <div className="intro-pack-body" style={{ clipPath: BODY_CLIP }}>
            <span>F1</span>
            <small>CARDS</small>
          </div>
        </div>
        <div className="intro-flash" />
      </div>
    </div>
  );
}
