import type { Card, Rarity } from '../types';
import { ALL_CARDS } from './cards';
import { deckSlots, type Progress } from './collection';
import { DECK_SIZE } from './engine';

/*
 * Obiettivi di Play Giochi. Si ricavano dai progressi (salvati sul server): l'app li manda a Play Giochi,
 * che ricorda quelli già sbloccati. ID da Play Console → Play Games Services → Obiettivi → Ottieni risorse.
 */

export interface AchievementContext {
  profile: boolean; // profilo creato con avatar e pilota preferito
  friends: number;
}

// steps: obiettivo incrementale (quanti passi servono); value: passi fatti, oppure true/false
export interface Achievement {
  key: string;
  id: string;
  steps?: number;
  value: (p: Progress, ctx: AchievementContext) => number | boolean;
}

const rarityIds = (r: Rarity) => ALL_CARDS.filter((c) => c.rarity === r).map((c) => c.id);
const BY_RARITY = Object.fromEntries((['oro', 'platino', 'leggendaria', 'pioniere', 'classica'] as Rarity[]).map((r) => [r, rarityIds(r)])) as Record<
  'oro' | 'platino' | 'leggendaria' | 'pioniere' | 'classica',
  string[]
>;

// scuderie con almeno 5 card (le card Carriera non contano: non hanno una scuderia)
const TEAMS: string[][] = Object.values(
  ALL_CARDS.reduce<Record<string, string[]>>((m, c: Card) => {
    if (c.kind !== 'career') (m[c.team.id] ??= []).push(c.id);
    return m;
  }, {}),
).filter((ids) => ids.length >= 5);

const owns = (p: Progress, ids: string[]) => ids.filter((id) => p.owned[id]).length;
const ownsAll = (p: Progress, ids: string[]) => ids.every((id) => p.owned[id]);
const played = (p: Progress) => p.wins + p.losses + p.draws;
const distinct = (p: Progress) => Object.keys(p.owned).length;
const stat = (p: Progress, k: keyof NonNullable<Progress['stats']>) => p.stats?.[k] ?? 0;
const fullTeams = (p: Progress) => TEAMS.filter((ids) => ownsAll(p, ids)).length;
const bestStreak = (p: Progress) => Math.max(stat(p, 'bestStreak'), p.daily.streak);

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'lights_out', id: 'CgkIu7LlvM0TEAIQDA', value: (p) => p.wins >= 1 },
  { key: 'first_rip', id: 'CgkIu7LlvM0TEAIQFw', value: (p) => stat(p, 'packs') >= 1 },
  { key: 'perfect_pit_stop', id: 'CgkIu7LlvM0TEAIQKQ', value: (p) => deckSlots(p).every((d) => d.length === DECK_SIZE) },
  { key: 'suited_up', id: 'CgkIu7LlvM0TEAIQMg', value: (_, c) => c.profile },
  { key: 'ace_up_your_sleeve', id: 'CgkIu7LlvM0TEAIQNA', value: (p) => stat(p, 'jolly') >= 1 },
  { key: 'pit_lane_shopping', id: 'CgkIu7LlvM0TEAIQIw', value: (p) => stat(p, 'bought') >= 1 },
  { key: 'points_finish', id: 'CgkIu7LlvM0TEAIQHg', steps: 10, value: (p) => p.wins },
  { key: 'veteran', id: 'CgkIu7LlvM0TEAIQKA', steps: 50, value: (p) => p.wins },
  { key: 'world_champion', id: 'CgkIu7LlvM0TEAIQHA', steps: 100, value: (p) => p.wins },
  { key: 'dominator', id: 'CgkIu7LlvM0TEAIQEA', steps: 250, value: (p) => p.wins },
  { key: 'hall_of_fame', id: 'CgkIu7LlvM0TEAIQLg', steps: 500, value: (p) => p.wins },
  { key: 'the_goat', id: 'CgkIu7LlvM0TEAIQEQ', steps: 1000, value: (p) => p.wins },
  { key: 'full_season', id: 'CgkIu7LlvM0TEAIQBQ', steps: 100, value: played },
  { key: 'endurance', id: 'CgkIu7LlvM0TEAIQJw', steps: 500, value: played },
  { key: 'a_life_on_track', id: 'CgkIu7LlvM0TEAIQJQ', steps: 1500, value: played },
  { key: 'flawless_victory', id: 'CgkIu7LlvM0TEAIQFQ', value: (p) => stat(p, 'flawless') >= 1 },
  { key: 'comeback', id: 'CgkIu7LlvM0TEAIQMA', value: (p) => stat(p, 'comeback') >= 1 },
  { key: 'david_vs_goliath', id: 'CgkIu7LlvM0TEAIQEg', value: (p) => stat(p, 'bronze') >= 1 },
  { key: 'hat_trick', id: 'CgkIu7LlvM0TEAIQCw', value: (p) => bestStreak(p) >= 3 },
  { key: 'perfect_week', id: 'CgkIu7LlvM0TEAIQCA', value: (p) => bestStreak(p) >= 7 },
  { key: 'month_of_glory', id: 'CgkIu7LlvM0TEAIQMw', value: (p) => bestStreak(p) >= 30 },
  { key: 'race_engineer', id: 'CgkIu7LlvM0TEAIQHw', steps: 50, value: (p) => stat(p, 'missions') },
  { key: 'chief_engineer', id: 'CgkIu7LlvM0TEAIQDw', steps: 300, value: (p) => stat(p, 'missions') },
  { key: 'head_to_head', id: 'CgkIu7LlvM0TEAIQLA', value: (p) => stat(p, 'pvpWins') >= 1 },
  { key: 'rival', id: 'CgkIu7LlvM0TEAIQKw', steps: 10, value: (p) => stat(p, 'pvpWins') },
  { key: 'king_of_the_paddock', id: 'CgkIu7LlvM0TEAIQAw', steps: 50, value: (p) => stat(p, 'pvpWins') },
  { key: 'teammate', id: 'CgkIu7LlvM0TEAIQLw', value: (_, c) => c.friends >= 1 },
  { key: 'pack_opener', id: 'CgkIu7LlvM0TEAIQBg', steps: 50, value: (p) => stat(p, 'packs') },
  { key: 'pack_addict', id: 'CgkIu7LlvM0TEAIQBA', steps: 250, value: (p) => stat(p, 'packs') },
  { key: 'mountain_of_cards', id: 'CgkIu7LlvM0TEAIQCQ', steps: 1000, value: (p) => stat(p, 'packs') },
  { key: 'pure_gold', id: 'CgkIu7LlvM0TEAIQCg', value: (p) => owns(p, BY_RARITY.oro) >= 1 },
  { key: 'platinum', id: 'CgkIu7LlvM0TEAIQJA', value: (p) => owns(p, BY_RARITY.platino) >= 1 },
  { key: 'legend', id: 'CgkIu7LlvM0TEAIQHQ', value: (p) => owns(p, BY_RARITY.leggendaria) >= 1 },
  { key: 'pioneer', id: 'CgkIu7LlvM0TEAIQMQ', value: (p) => owns(p, BY_RARITY.pioniere) >= 1 },
  { key: 'grand_classic', id: 'CgkIu7LlvM0TEAIQDQ', value: (p) => owns(p, BY_RARITY.classica) >= 1 },
  { key: 'collector', id: 'CgkIu7LlvM0TEAIQJg', steps: 50, value: distinct },
  { key: 'full_garage', id: 'CgkIu7LlvM0TEAIQFg', steps: 150, value: distinct },
  { key: 'historic_archive', id: 'CgkIu7LlvM0TEAIQGw', steps: 300, value: distinct },
  { key: 'museum', id: 'CgkIu7LlvM0TEAIQGQ', steps: 500, value: distinct },
  { key: 'half_the_grid', id: 'CgkIu7LlvM0TEAIQEw', steps: 750, value: distinct },
  { key: 'encyclopedia', id: 'CgkIu7LlvM0TEAIQKg', steps: 1000, value: distinct },
  { key: 'the_whole_story', id: 'CgkIu7LlvM0TEAIQIQ', value: (p) => ALL_CARDS.every((c) => p.owned[c.id]) },
  { key: 'full_team', id: 'CgkIu7LlvM0TEAIQGA', value: (p) => fullTeams(p) >= 1 },
  { key: 'constructor', id: 'CgkIu7LlvM0TEAIQLQ', steps: 10, value: fullTeams },
  { key: 'all_that_glitters', id: 'CgkIu7LlvM0TEAIQIA', value: (p) => ownsAll(p, BY_RARITY.oro) },
  { key: 'platinum_collection', id: 'CgkIu7LlvM0TEAIQGg', value: (p) => ownsAll(p, BY_RARITY.platino) },
  { key: 'roll_of_honour', id: 'CgkIu7LlvM0TEAIQFA', steps: 25, value: (p) => owns(p, BY_RARITY.leggendaria) },
  { key: 'vintage_album', id: 'CgkIu7LlvM0TEAIQDg', value: (p) => ownsAll(p, BY_RARITY.pioniere) },
  { key: 'all_the_classics', id: 'CgkIu7LlvM0TEAIQIg', value: (p) => ownsAll(p, BY_RARITY.classica) },
  { key: 'bank_vault', id: 'CgkIu7LlvM0TEAIQBw', value: (p) => p.credits >= 5000 },
];

// Stato attuale di ogni obiettivo: passi fatti (fino al massimo) o 1 se sbloccato. Gli obiettivi a 0 non si mandano.
export function achievementState(p: Progress, ctx: AchievementContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of ACHIEVEMENTS) {
    const v = a.value(p, ctx);
    const n = a.steps ? Math.min(Number(v), a.steps) : v ? 1 : 0;
    if (n > 0) out[a.key] = n;
  }
  return out;
}
