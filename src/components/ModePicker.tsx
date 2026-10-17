import type { Card } from '../types';
import { Check } from 'lucide-react';
import { CARDS_DATA, RARITIES, flagEmoji, rarityLabel } from '../game/cards';
import { CLASSIC, DECADES, NATIONS, deckProblems, fillDeck, fitsMode, type MatchMode } from '../game/deckRules';
import { DECK_SIZE } from '../game/engine';
import { getLang, useI18n, type TFn } from '../lib/i18n';

// nome della nazione nella lingua del gioco (IT → Italia)
export function countryName(code: string) {
  try {
    return new Intl.DisplayNames([getLang()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function modeLabel(mode: MatchMode, t: TFn) {
  switch (mode.kind) {
    case 'classic':
      return t('mode_classic');
    case 'rarity':
      return t('mode_only', { r: rarityLabel(mode.rarity) });
    case 'decade':
      return t('daily_decade', { d: mode.decade });
    case 'nation':
      return `${flagEmoji(mode.country)} ${countryName(mode.country)}`;
    case 'team':
      return t('daily_team', { team: CARDS_DATA.teams[mode.team] ?? mode.team });
  }
}

// quante card adatte hai e se basta per un mazzo valido
export function modeReady(mode: MatchMode, owned: Card[]) {
  const usable = owned.filter((c) => fitsMode(mode, c));
  return { have: usable.length, ok: fillDeck(usable, [], mode, Math.random, true).length === DECK_SIZE };
}

type Kind = Exclude<MatchMode['kind'], 'team'>;
const KINDS: Kind[] = ['classic', 'rarity', 'decade', 'nation'];

export function modeOptions(kind: Kind): MatchMode[] {
  switch (kind) {
    case 'classic':
      return [CLASSIC];
    case 'rarity':
      return RARITIES.map((rarity) => ({ kind: 'rarity', rarity }));
    case 'decade':
      return DECADES.map((decade) => ({ kind: 'decade', decade }));
    case 'nation':
      return NATIONS.map((country) => ({ kind: 'nation', country }));
  }
}

const sameMode = (a: MatchMode, b: MatchMode) => JSON.stringify(a) === JSON.stringify(b);

interface Props {
  mode: MatchMode;
  owned: Card[];
  decks: Card[][];
  slot: number;
  onMode: (m: MatchMode) => void;
  onDeck: (slot: number) => void;
}

// Scelta della modalità per la partita veloce: classica (con uno dei 3 mazzi) o a tema.
export function ModePicker({ mode, owned, decks, slot, onMode, onDeck }: Props) {
  const { t } = useI18n();
  const kind = mode.kind as Kind;
  const pickKind = (k: Kind) => {
    if (k === kind) return;
    const opts = modeOptions(k);
    onMode(opts.find((m) => modeReady(m, owned).ok) ?? opts[0]);
  };
  return (
    <div className="mode-picker">
      <div className="mode-kinds" role="tablist">
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'on' : ''} onClick={() => pickKind(k)}>
            {t(`mode_${k}`)}
          </button>
        ))}
      </div>
      {kind === 'classic' ? (
        <div className="deck-tabs home-decks" role="tablist" aria-label={t('home_deck')}>
          <span className="muted">{t('home_deck')}</span>
          {decks.map((d, i) => (
            <button key={i} role="tab" aria-selected={i === slot} className={i === slot ? 'on' : ''} onClick={() => onDeck(i)}>
              {i + 1}
              {d.length === DECK_SIZE && !deckProblems(d).length && <Check size={12} />}
            </button>
          ))}
        </div>
      ) : (
        <div className="chips mode-options">
          {modeOptions(kind).map((m) => {
            const { have, ok } = modeReady(m, owned);
            return (
              <button
                key={JSON.stringify(m)}
                className={`chip ${sameMode(m, mode) ? 'on' : ''} ${ok ? '' : 'locked'}`}
                onClick={() => onMode(m)}
                title={ok ? undefined : t('mode_need', { n: DECK_SIZE, m: have })}
              >
                {modeLabel(m, t)} <small>{Math.min(have, 99)}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
