import { describe, expect, it } from 'vitest';
import { bucketStart } from './snapshot';

describe('bucketStart', () => {
  it('floors to the bucket boundary', () => {
    expect(bucketStart(1792348800, 10)).toBe(1792348800);
    expect(bucketStart(1792348800 + 359, 10)).toBe(1792348800);
    expect(bucketStart(1792348800 + 599, 10)).toBe(1792348800);
    expect(bucketStart(1792349400, 10)).toBe(1792349400);
    expect(bucketStart(1792349399, 10)).toBe(1792348800);
  });

  it('never returns a non-multiple of the bucket', () => {
    for (const sec of [0, 1, 599, 600, 601, 1792349999]) {
      expect(bucketStart(sec, 10) % 600).toBe(0);
    }
  });
});
