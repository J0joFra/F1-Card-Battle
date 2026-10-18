import { describe, expect, it } from 'vitest';
import { easterSunday, seasonOf } from './season';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const iso = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe('temi delle feste', () => {
  it('data di Pasqua', () => {
    expect(iso(easterSunday(2025))).toBe('2025-4-20');
    expect(iso(easterSunday(2026))).toBe('2026-4-5');
    expect(iso(easterSunday(2027))).toBe('2027-3-28');
  });

  it('calendario dei temi', () => {
    expect(seasonOf(at(2026, 10, 24))).toBeNull();
    expect(seasonOf(at(2026, 10, 25))).toBe('halloween');
    expect(seasonOf(at(2026, 10, 31))).toBe('halloween');
    expect(seasonOf(at(2026, 11, 3))).toBe('halloween');
    expect(seasonOf(at(2026, 11, 4))).toBeNull();
    expect(seasonOf(at(2026, 12, 1))).toBe('winter');
    expect(seasonOf(at(2026, 12, 20))).toBe('winter');
    expect(seasonOf(at(2026, 12, 21))).toBe('christmas');
    expect(seasonOf(at(2026, 12, 25))).toBe('christmas');
    expect(seasonOf(at(2026, 12, 27))).toBe('christmas');
    expect(seasonOf(at(2026, 12, 28))).toBe('winter');
    expect(seasonOf(at(2027, 1, 31))).toBe('winter');
    expect(seasonOf(at(2027, 2, 1))).toBeNull();
    // Pasqua 2026 = 5 aprile: dal mercoledì 1 al martedì 7 (dopo Pasquetta)
    expect(seasonOf(at(2026, 3, 31))).toBeNull();
    expect(seasonOf(at(2026, 4, 1))).toBe('easter');
    expect(seasonOf(at(2026, 4, 6))).toBe('easter');
    expect(seasonOf(at(2026, 4, 7))).toBe('easter');
    expect(seasonOf(at(2026, 4, 8))).toBeNull();
  });
});
