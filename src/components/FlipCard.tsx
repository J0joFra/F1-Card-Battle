import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card } from '../types';
import { CardView } from './CardView';
import { StatRadar } from './StatRadar';
import { reducedMotion } from '../lib/feedback';

const HALF_MS = 140; // metà giro: la card si "chiude", cambia faccia e si riapre

/*
 * Card che si gira (stile Clash Royale): davanti la card, dietro il diagramma a ragnatela delle metriche.
 * Con il mouse si gira passandoci sopra, sul telefono toccandola. Il retro può avere un'azione (es. "Aggiungi").
 * Il giro è un'animazione 2D (non una rotazione 3D): così i tocchi sul retro arrivano sempre al pulsante giusto.
 */
export function FlipCard({ card, action, badge }: { card: Card; action?: ReactNode; badge?: ReactNode }) {
  const [face, setFace] = useState<'front' | 'back'>('front');
  const [turning, setTurning] = useState(false);
  const target = useRef<'front' | 'back'>('front');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pointer = useRef<string>('mouse');
  useEffect(() => () => clearTimeout(timer.current), []);

  function turnTo(next: 'front' | 'back') {
    if (target.current === next) return;
    target.current = next;
    clearTimeout(timer.current);
    if (reducedMotion()) {
      setFace(next);
      return;
    }
    setTurning(true);
    timer.current = setTimeout(() => {
      setFace(target.current);
      setTurning(false);
    }, HALF_MS);
  }

  return (
    <div
      className={`flip ${face === 'back' ? 'flipped' : ''} ${turning ? 'turning' : ''}`}
      onPointerDown={(e) => (pointer.current = e.pointerType)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && turnTo('back')}
      onPointerLeave={(e) => e.pointerType === 'mouse' && turnTo('front')}
      onClick={() => pointer.current !== 'mouse' && turnTo(target.current === 'back' ? 'front' : 'back')}
    >
      <div className="flip-inner">
        <div className="flip-face flip-front" aria-hidden={face === 'back'}>
          <CardView card={card} size="sm" />
          {badge}
        </div>
        {face === 'back' && (
          <div className={`flip-face flip-back card card-sm rarity-${card.rarity}`}>
            <div className="flip-back-head">
              <b>
                {card.driver.abbreviation} · {card.kind === 'career' ? '★' : card.team.name}
              </b>
            </div>
            <StatRadar card={card} />
            {action && (
              <div className="flip-action" onClick={(e) => e.stopPropagation()}>
                {action}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
