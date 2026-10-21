import { PIE_MUTED_COLOR, pieColor } from './chart';
import type { PieSlice } from './chart';

/**
 * p_i = exp(score_i / T) / Σ exp(score_j / T), computed after subtracting the max so the
 * exponentials stay in range. exp (not plain normalisation) is required because DDI is signed:
 * Σ score can be zero or negative, which would produce negative shares or a divide-by-zero.
 */
export function softmaxShares(scores: number[], temp: number): number[] {
  if (scores.length === 0) return [];
  const t = Math.max(1, temp);
  let max = scores[0];
  for (const score of scores) if (score > max) max = score;
  const exps = scores.map((score) => Math.exp((score - max) / t));
  let sum = 0;
  for (const value of exps) sum += value;
  if (!Number.isFinite(sum) || sum <= 0) return scores.map(() => 1 / scores.length);
  return exps.map((value) => value / sum);
}

/**
 * Percent strings that sum to exactly 100.0: each share is rounded to a tenth of a point and the
 * rounding residue is pushed onto the largest slice (first one on a tie).
 */
export function formatShares(shares: number[]): string[] {
  const milli = shares.map((share) => Math.round(share * 1000));
  let residue = 1000;
  for (const value of milli) residue -= value;
  if (residue !== 0 && milli.length > 0) {
    let largest = 0;
    for (let index = 1; index < milli.length; index += 1) {
      if (milli[index] > milli[largest]) largest = index;
    }
    milli[largest] += residue;
  }
  return milli.map((value) => (value / 10).toFixed(1));
}

export function topSlices(
  names: string[],
  scores: number[],
  temp: number,
  otherLabel: (count: number) => string,
  limit = 24,
): PieSlice[] {
  const shares = softmaxShares(scores, temp);
  const order = shares.map((share, index) => ({ share, index }));
  order.sort((a, b) => b.share - a.share || a.index - b.index);

  const head = order.slice(0, limit);
  const tail = order.slice(limit);
  const displayed = head.map((entry) => ({ share: entry.share, index: entry.index }));
  if (tail.length > 0) {
    let merged = 0;
    for (const entry of tail) merged += entry.share;
    displayed.push({ share: merged, index: -1 });
  }

  const pcts = formatShares(displayed.map((entry) => entry.share));
  return displayed.map((entry, position) => ({
    label: entry.index === -1 ? otherLabel(tail.length) : names[entry.index],
    share: entry.share,
    pct: pcts[position],
    score: entry.index === -1 ? null : scores[entry.index],
    color: entry.index === -1 ? PIE_MUTED_COLOR : pieColor(position, displayed.length),
  }));
}
