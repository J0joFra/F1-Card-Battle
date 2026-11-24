import { useMemo, useState } from 'react';
import type { Card, Rarity } from '../types';
import { ArrowDownUp, Search } from 'lucide-react';
import { ALL_CARDS, careerCardOf, rarityLabel, teamCardsOfDriver } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { TOTAL_CARDS, collectionSize, jollyTargets, type Progress } from '../game/collection';
import { askConfirm } from '../components/ConfirmDialog';
import { FlipCard } from '../components/FlipCard';
import { useProgressive } from '../hooks/useProgressive';

interface Props {
  progress: Progress;
  today: string;
  onShop: () => void; // la card è tra quelle del giorno nel negozio
  onUseJolly: (card: Card) => void;
}

type OwnedFilter = 'tutte' | 'mie' | 'mancanti';
type Sort = 'rarity' | 'ovr' | 'name';
type RarityFilter = Rarity | 'tutte';

// rarità nell'ordine del riepilogo (dalla più comune) e peso per l'ordinamento (prima le più rare)
const RARITY_ROW: Rarity[] = ['bronzo', 'argento', 'oro', 'platino', 'leggendaria', 'classica', 'pioniere'];
const RARITY_RANK: Record<Rarity, number> = { leggendaria: 7, platino: 6, oro: 5, pioniere: 4, classica: 3, argento: 2, bronzo: 1 };
const TOTAL_BY_RARITY = Object.fromEntries(RARITY_ROW.map((r) => [r, ALL_CARDS.filter((c) => c.rarity === r).length])) as Record<Rarity, number>;
const SORT_KEY = 'f1-card-battle:col-sort';

export function CollectionScreen({ progress, today, onShop, onUseJolly }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<RarityFilter>('tutte');
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('mie');
  const [sort, setSortRaw] = useState<Sort>(() => {
    try {
      const v = localStorage.getItem(SORT_KEY);
      return v === 'ovr' || v === 'name' ? v : 'rarity';
    } catch {
      return 'rarity';
    }
  });
  const setSort = (v: Sort) => {
    setSortRaw(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {
      /* niente memoria */
    }
  };
  // carte possedute per rarità (riepilogo in alto)
  const ownedBy = useMemo(() => {
    const n = Object.fromEntries(RARITY_ROW.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const c of ALL_CARDS) if (progress.owned[c.id]) n[c.rarity]++;
    return n;
  }, [progress.owned]);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ALL_CARDS.filter((c) => {
      const owned = !!progress.owned[c.id];
      if (ownedFilter === 'mie' && !owned) return false;
      if (ownedFilter === 'mancanti' && owned) return false;
      if (rarity !== 'tutte' && c.rarity !== rarity) return false;
      if (q && !`${c.driver.name} ${c.team.name}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const byName = (a: Card, b: Card) => a.driver.lastName.localeCompare(b.driver.lastName) || a.period.localeCompare(b.period);
    if (sort === 'name') return list.sort(byName);
    if (sort === 'ovr') return list.sort((a, b) => b.ovr - a.ovr || byName(a, b));
    return list.sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.ovr - a.ovr || byName(a, b));
  }, [query, rarity, ownedFilter, sort, progress.owned]);
  const inShop = (c: Card) => progress.store?.date === today && progress.store.cards.includes(c.id);
  const { limit, sentinel } = useProgressive(cards.length, 48, `${query}|${rarity}|${ownedFilter}|${sort}`);

  return (
    <div className="screen collection">
      <header className="screen-head">
        <h2>{t('col_title')}</h2>
        <HelpButton items={['tut_coll_1', 'tut_coll_2', 'tut_coll_3']} />
      </header>
      {/* riepilogo: quante card hai per rarità (tocca una rarità per vedere solo quella) */}
      <section className="panel col-summary">
        <div className="col-total">
          <b>{collectionSize(progress)}</b>
          <span className="muted">/ {TOTAL_CARDS}</span>
          <div className="bar small">
            <div style={{ width: `${(collectionSize(progress) / TOTAL_CARDS) * 100}%` }} />
          </div>
        </div>
        <div className="col-rarities">
          {RARITY_ROW.map((r) => (
            <button
              key={r}
              className={`col-rarity rarity-${r} ${rarity === r ? 'on' : ''}`}
              onClick={() => setRarity(rarity === r ? 'tutte' : r)}
              aria-pressed={rarity === r}
            >
              <span className="cr-dot" aria-hidden />
              <small>{rarityLabel(r)}</small>
              <b>
                {ownedBy[r]}
                <span className="muted">/{TOTAL_BY_RARITY[r]}</span>
              </b>
            </button>
          ))}
        </div>
      </section>

      <div className="filters">
        <label className="search">
          <Search size={16} />
          <input type="search" placeholder={t('col_search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="col-toolbar">
          <div className="seg" role="radiogroup">
            {(['mie', 'mancanti', 'tutte'] as OwnedFilter[]).map((f) => (
              <button key={f} role="radio" aria-checked={ownedFilter === f} className={ownedFilter === f ? 'on' : ''} onClick={() => setOwnedFilter(f)}>
                {f === 'mie' ? t('f_mine') : f === 'mancanti' ? t('f_missing') : t('f_all')}
              </button>
            ))}
          </div>
          <label className="col-sort">
            <ArrowDownUp size={14} />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('col_sort')}>
              <option value="rarity">{t('col_sortRarity')}</option>
              <option value="ovr">{t('col_sortOvr')}</option>
              <option value="name">{t('col_sortName')}</option>
            </select>
          </label>
        </div>
        {(rarity !== 'tutte' || query) && (
          <p className="col-result muted">
            {t('col_results', { n: cards.length })}
            {rarity !== 'tutte' && (
              <button className="chip on" onClick={() => setRarity('tutte')}>
                {rarityLabel(rarity)} ✕
              </button>
            )}
          </p>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="muted empty">{t('col_empty')}</p>
      ) : (
        <div className="grid col-grid">
          {cards.slice(0, limit).map((c) => (
            <div key={c.id} className="grid-item">
              <FlipCard
                card={c}
                dimmed={!progress.owned[c.id]}
                count={progress.owned[c.id]}
                action={<CardInfo card={c} progress={progress} inShop={inShop(c)} onShop={onShop} onUseJolly={onUseJolly} />}
              />
            </div>
          ))}
          {limit < cards.length && <div ref={sentinel} className="grid-sentinel" />}
        </div>
      )}
    </div>
  );
}

// sul retro della card: avanzamento verso la card carriera e, se manca, il negozio di oggi
function CardInfo({
  card,
  progress,
  inShop,
  onShop,
  onUseJolly,
}: {
  card: Card;
  progress: Progress;
  inShop: boolean;
  onShop: () => void;
  onUseJolly: (card: Card) => void;
}) {
  const { t } = useI18n();
  const owned = !!progress.owned[card.id];
  // card mancante che si può prendere con un Jolly (si chiede conferma: il Jolly non va sprecato)
  const jollyOk = !owned && progress.jolly > 0 && jollyTargets(progress).some((tg) => tg.missing.includes(card));
  async function useJolly() {
    const ok = await askConfirm(t('j_confirm', { card: `${card.driver.name} · ${card.team.name} ${card.period}` }), {
      confirmLabel: t('j_use'),
    });
    if (ok) onUseJolly(card);
  }
  const career = careerCardOf(card.driver.id);
  const teamCards = teamCardsOfDriver(card.driver.id);
  const ownedTeams = teamCards.filter((c) => progress.owned[c.id]).length;
  const progressLine = career && card.kind === 'team';
  if (card.kind === 'pioneer' || card.kind === 'classic')
    return (
      <div className="card-info">
        <small>
          {card.kind === 'pioneer' ? '🏛' : '🎞️'} {t('card_collectOnly')}
        </small>
      </div>
    );
  if (!progressLine && !(inShop && !owned) && !jollyOk) return null;
  return (
    <div className="card-info">
      {progressLine && (
        <small
          title={`${t('col_teamProgress', { name: card.driver.lastName, a: ownedTeams, b: teamCards.length })} ${t(
            progress.owned[career.id] ? 'col_careerUnlocked' : 'col_careerHint'
          )}`}
        >
          ★ {ownedTeams}/{teamCards.length} {progress.owned[career.id] ? '✓' : ''}
        </small>
      )}
      {jollyOk && (
        <button className="btn primary" onClick={() => void useJolly()}>
          🃏 {t('j_take')}
        </button>
      )}
      {!owned && inShop && (
        <button className="btn primary" onClick={onShop}>
          🛒 {t('shop_inShopToday')}
        </button>
      )}
    </div>
  );
}
