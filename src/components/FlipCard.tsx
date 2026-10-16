import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card } from '../types';
import { CardView } from './CardView';
import { StatRadar } from './StatRadar';
import { reducedMotion } from '../lib/feedback';

const HALF_MS = 140; // metà giro: la card si "chiude", cambia faccia e si riapre

/*
 * Card che si gira (stile Clash Royale): davanti la card, dietro il diagramma a ragnatela delle metriche.
 * Con il mouse si gira passandoci sopra; toccandola (o cliccandola) si gira e si ingrandisce al centro dello schermo.
 * Il retro può avere un'azione (es. "Aggiungi").
 * Il giro è un'animazione 2D (non una rotazione 3D): così i tocchi sul retro arrivano sempre al pulsante giusto.
 */
export function FlipCard({ card, action, badge }: { card: Card; action?: ReactNode; badge?: ReactNode }) {
  const [face, setFace] = useState<'front' | 'back'>('front');
  const [turning, setTurning] = useState(false);
  const target = useRef<'front' | 'back'>('front');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [zoom, setZoom] = useState(false);
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

  const back = (big: boolean) => (
    <div className={`flip-face flip-back card ${big ? 'card-md flip-zoom flip-in' : 'card-sm'} rarity-${card.rarity}`}>
      <div className="flip-back-head">
        <b>
          {big ? card.driver.name : card.driver.abbreviation} · {card.kind === 'career' ? '★' : card.team.name}
        </b>
        {big && <small>{card.period}</small>}
      </div>
      <StatRadar card={card} />
      {action && (
        <div className="flip-action" onClick={(e) => e.stopPropagation()}>
          {action}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`flip ${face === 'back' ? 'flipped' : ''} ${turning ? 'turning' : ''}`}
        onPointerEnter={(e) => e.pointerType === 'mouse' && turnTo('back')}
        onPointerLeave={(e) => e.pointerType === 'mouse' && turnTo('front')}
        onClick={() => {
          // tocco (o clic): la card si gira e si ingrandisce al centro dello schermo
          turnTo('front');
          setZoom(true);
        }}
      >
        <div className="flip-inner">
          <div className="flip-face flip-front" aria-hidden={face === 'back'}>
            <CardView card={card} size="sm" />
            {badge}
          </div>
          {face === 'back' && back(false)}
        </div>
      </div>
      {zoom && (
        <div className="overlay modal-backdrop flip-zoom-backdrop" onClick={() => setZoom(false)}>
          <div onClick={(e) => e.stopPropagation()}>{back(true)}</div>
        </div>
      )}
    </>
  );
}
