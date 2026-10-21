import { describe, expect, it } from 'vitest';
import { formatShares, softmaxShares, topSlices } from './softmax';

function sumOf(pcts: string[]): number {
  return Math.round(pcts.reduce((total, pct) => total + Number(pct) * 10, 0));
}

describe('softmaxShares', () => {
  it('matches the reference shares at T = 10', () => {
    const shares = softmaxShares([30, 0, -30], 10);
    expect(shares[0]).toBeCloseTo(0.95034, 4);
    expect(shares[1]).toBeCloseTo(0.047314, 4);
    expect(shares[2]).toBeCloseTo(0.0023558, 4);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('is uniform when every score is equal', () => {
    expect(softmaxShares([0, 0, 0], 10)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('never produces NaN or Infinity at an extreme temperature', () => {
    for (const temp of [0, 1, -5, 100]) {
      const shares = softmaxShares([100, -100], temp);
      expect(shares.every((share) => Number.isFinite(share))).toBe(true);
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it('returns an empty array for no models', () => {
    expect(softmaxShares([], 10)).toEqual([]);
  });
});

describe('formatShares', () => {
  it('renders the reference shares and sums to exactly 100.0', () => {
    const pcts = formatShares(softmaxShares([30, 0, -30], 10));
    expect(pcts).toEqual(['95.1', '4.7', '0.2']);
    expect(sumOf(pcts)).toBe(1000);
  });

  it('absorbs the rounding residue on a seven-way split', () => {
    const pcts = formatShares(Array.from({ length: 7 }, () => 1 / 7));
    expect(sumOf(pcts)).toBe(1000);
    expect(pcts[0]).toBe('14.2');
  });
});

describe('topSlices', () => {
  const label = (count: number) => `others:${count}`;

  it('keeps every model when there are fewer than the limit', () => {
    const slices = topSlices(['a', 'b'], [30, 0], 10, label);
    expect(slices).toHaveLength(2);
    expect(slices[0].label).toBe('a');
    expect(slices[0].pct).toBe('95.3');
    expect(slices[1].score).toBe(0);
  });

  it('merges the tail only above the slice limit', () => {
    const names = Array.from({ length: 26 }, (_, index) => `m${index}`);
    const scores = names.map((_, index) => 30 - index * 2);
    const slices = topSlices(names, scores, 10, label);
    expect(slices).toHaveLength(25);
    expect(slices[24].label).toBe('others:2');
    expect(slices[24].color).toBe('color-mix(in srgb, var(--muted) 45%, var(--surface))');
    expect(slices[24].score).toBeNull();
    expect(sumOf(slices.map((slice) => slice.pct))).toBe(1000);
  });
});
