import { describe, expect, it } from 'vitest';
import { HOUR_MS, ddiScore, decayTo, foldVotes } from './scoring';
import type { Aggregate, ScoreParams, VoteEvent } from './scoring';

const PARAMS: ScoreParams = { halfLifeHours: 8, alpha: 3, kMin: 3 };
const NOW = Date.parse('2026-10-18T12:00:00.000Z');

function votes(up: number, down: number, at: number): VoteEvent[] {
  return [
    ...Array.from({ length: up }, () => ({ value: 1 as const, createdAt: at })),
    ...Array.from({ length: down }, () => ({ value: -1 as const, createdAt: at })),
  ];
}

function agg(net: number, weight: number): Aggregate {
  return { net, weight, computedAt: NOW };
}

function score(net: number, weight: number): number {
  return ddiScore(agg(net, weight), NOW, PARAMS);
}

describe('ddiScore — worked samples (no decay)', () => {
  it('matches every hand-computed row', () => {
    expect(score(1, 1)).toBe(32.2);
    expect(score(2, 2)).toBe(43.9);
    expect(score(5, 5)).toBe(63.2);
    expect(score(10, 10)).toBe(78.3);
    expect(score(50, 50)).toBe(98.2);
    expect(score(100, 100)).toBe(99.7);
    expect(score(20, 100)).toBe(58.3); // 60 up / 40 down
    expect(score(2, 100)).toBe(6.7); // 51 up / 49 down
    expect(score(0, 10)).toBe(0.0); // 5 up / 5 down
  });

  it('returns 0 when there is no weight', () => {
    expect(ddiScore({ net: 0, weight: 0, computedAt: NOW }, NOW, PARAMS)).toBe(0);
  });
});

describe('foldVotes — decay', () => {
  it('folds a vote from 8h ago to half weight', () => {
    const folded = foldVotes(
      [
        { value: 1, createdAt: NOW - 8 * HOUR_MS },
        { value: -1, createdAt: NOW },
      ],
      NOW,
      PARAMS.halfLifeHours,
    );
    expect(folded.net).toBeCloseTo(-0.5, 10);
    expect(folded.weight).toBeCloseTo(1.5, 10);
    expect(ddiScore(folded, NOW, PARAMS)).toBe(-13.5);
  });

  it('is order independent', () => {
    const a = foldVotes(votes(3, 2, NOW - 4 * HOUR_MS).concat(votes(1, 4, NOW - HOUR_MS)), NOW, 8);
    const b = foldVotes(
      [...votes(1, 4, NOW - HOUR_MS), ...votes(3, 2, NOW - 4 * HOUR_MS)].reverse(),
      NOW,
      8,
    );
    expect(a.net).toBeCloseTo(b.net, 10);
    expect(a.weight).toBeCloseTo(b.weight, 10);
  });

  it('decays to zero when nobody votes', () => {
    const folded = foldVotes(votes(10, 0, NOW), NOW, 8);
    const later = ddiScore(folded, NOW + 7 * 24 * HOUR_MS, PARAMS);
    expect(later).toBe(0.0);
  });
});

describe('decayTo', () => {
  it('leaves an aggregate untouched at the same instant', () => {
    const agg0 = { net: 4, weight: 9, computedAt: NOW };
    expect(decayTo(agg0, NOW, 8)).toEqual(agg0);
  });

  it('halves both net and weight after one half-life', () => {
    const decayed = decayTo({ net: 4, weight: 9, computedAt: NOW }, NOW + 8 * HOUR_MS, 8);
    expect(decayed.net).toBeCloseTo(2, 10);
    expect(decayed.weight).toBeCloseTo(4.5, 10);
  });
});

describe('scale invariance', () => {
  it('gives the identical score for the same net/sqrt(W), whatever W is', () => {
    // net / sqrt(W) === 1 in all three rows.
    expect(score(10, 100)).toBe(32.2);
    expect(score(20, 400)).toBe(32.2);
    expect(score(31.6227766, 1000)).toBe(32.2);
  });

  it('does saturate when a consistent majority keeps winning as W grows', () => {
    // Documents the intended semantics: sqrt(W) scaling neutralises *random* drift, not consensus.
    expect(score(2, 10)).toBe(20.8);
    expect(score(200, 1000)).toBe(97.1);
  });
});

describe('foldVotes + ddiScore integration', () => {
  it('reproduces the aggregate path from raw votes', () => {
    const folded = foldVotes(votes(1, 0, NOW), NOW, 8);
    expect(ddiScore(folded, NOW, PARAMS)).toBe(32.2);
  });
});
