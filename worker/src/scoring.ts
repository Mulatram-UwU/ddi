export const HOUR_MS = 3_600_000;

export interface VoteEvent {
  value: 1 | -1;
  createdAt: number; // epoch ms
}

export interface Aggregate {
  net: number; // S
  weight: number; // W
  computedAt: number; // epoch ms at which net/weight were folded
}

export interface ScoreParams {
  halfLifeHours: number;
  alpha: number;
  kMin: number;
}

function decayFactor(deltaMs: number, halfLifeHours: number): number {
  return Math.pow(2, -deltaMs / (halfLifeHours * HOUR_MS));
}

/** Decay an already-folded aggregate forward to `now` (never mutates the input). */
export function decayTo(agg: Aggregate, now: number, halfLifeHours: number): Aggregate {
  const d = decayFactor(now - agg.computedAt, halfLifeHours);
  return { net: agg.net * d, weight: agg.weight * d, computedAt: now };
}

/** Fold raw vote events into an aggregate, then decay it to `now`. */
export function foldVotes(votes: VoteEvent[], now: number, halfLifeHours: number): Aggregate {
  const sorted = [...votes].sort((a, b) => a.createdAt - b.createdAt);
  let net = 0;
  let weight = 0;
  let computedAt = now;
  if (sorted.length > 0) {
    computedAt = sorted[0].createdAt;
    for (const vote of sorted) {
      const d = decayFactor(vote.createdAt - computedAt, halfLifeHours);
      net = net * d + vote.value;
      weight = weight * d + 1;
      computedAt = vote.createdAt;
    }
  }
  return decayTo({ net, weight, computedAt }, now, halfLifeHours);
}

/**
 * DDI = 100 * tanh(S / max(kMin, alpha * sqrt(W))), rounded to 1 decimal.
 *
 * sqrt(W) normalisation is a z-score against the "everyone votes ±1 at random" null, so the
 * index does not saturate merely because W grows. A *consistent* majority does approach ±100
 * as W grows — that is the intended behaviour.
 */
export function ddiScore(agg: Aggregate, now: number, p: ScoreParams): number {
  const decayed = decayTo(agg, now, p.halfLifeHours);
  if (decayed.weight === 0) return 0;
  const k = Math.max(p.kMin, p.alpha * Math.sqrt(decayed.weight));
  const raw = 100 * Math.tanh(decayed.net / k);
  return Math.round(raw * 10) / 10;
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
