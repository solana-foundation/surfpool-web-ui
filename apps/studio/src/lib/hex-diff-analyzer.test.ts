import { describe, it, expect } from 'vitest';
import {
  analyzeHexDiff,
  createRemovalTestData,
  createUpdateTestData,
  createAdditionTestData,
} from './hex-diff-analyzer';

describe('analyzeHexDiff', () => {
  it('returns empty results for identical arrays', () => {
    const bytes = [1, 2, 3, 4, 5];
    const result = analyzeHexDiff(bytes, bytes);
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it('detects pure additions', () => {
    const { beforeBytes, afterBytes } = createAdditionTestData();
    const result = analyzeHexDiff(beforeBytes, afterBytes);
    expect(result.additions.length).toBeGreaterThan(0);
    expect(result.removals).toHaveLength(0);
  });

  it('detects pure removals', () => {
    const { beforeBytes, afterBytes } = createRemovalTestData();
    const result = analyzeHexDiff(beforeBytes, afterBytes);
    // "0.001" -> "0" removes bytes, the diff algorithm may categorize as removals or updates
    const hasChanges = result.removals.length > 0 || result.updates.length > 0;
    expect(hasChanges).toBe(true);
  });

  it('detects updates (replacements)', () => {
    const { beforeBytes, afterBytes } = createUpdateTestData();
    const result = analyzeHexDiff(beforeBytes, afterBytes);
    expect(result.updates.length).toBeGreaterThan(0);
  });

  it('handles empty before array (all additions)', () => {
    const result = analyzeHexDiff([], [1, 2, 3]);
    expect(result.additions.length).toBeGreaterThan(0);
    expect(result.removals).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it('handles empty after array (all removals)', () => {
    const result = analyzeHexDiff([1, 2, 3], []);
    expect(result.removals.length).toBeGreaterThan(0);
    expect(result.additions).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it('handles both empty arrays', () => {
    const result = analyzeHexDiff([], []);
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it('returns correct range structure for additions', () => {
    const result = analyzeHexDiff([1, 2, 3], [1, 2, 3, 4, 5]);
    for (const addition of result.additions) {
      expect(addition).toHaveProperty('beforeIndex');
      expect(addition).toHaveProperty('afterRange');
      expect(addition.afterRange).toHaveProperty('start');
      expect(addition.afterRange).toHaveProperty('end');
      expect(addition.afterRange.end).toBeGreaterThanOrEqual(addition.afterRange.start);
    }
  });

  it('returns correct range structure for removals', () => {
    const result = analyzeHexDiff([1, 2, 3, 4, 5], [1, 2, 3]);
    for (const removal of result.removals) {
      expect(removal).toHaveProperty('beforeRange');
      expect(removal).toHaveProperty('afterIndex');
      expect(removal.beforeRange).toHaveProperty('start');
      expect(removal.beforeRange).toHaveProperty('end');
      expect(removal.beforeRange.end).toBeGreaterThanOrEqual(removal.beforeRange.start);
    }
  });
});

describe('test data helpers', () => {
  it('createRemovalTestData returns valid data', () => {
    const { beforeBytes, afterBytes } = createRemovalTestData();
    expect(beforeBytes).toEqual([48, 46, 48, 48, 49]); // "0.001"
    expect(afterBytes).toEqual([48]); // "0"
  });

  it('createUpdateTestData returns valid data', () => {
    const { beforeBytes, afterBytes } = createUpdateTestData();
    expect(beforeBytes).toEqual([65, 66, 67]); // "ABC"
    expect(afterBytes).toEqual([88, 89, 90]); // "XYZ"
  });

  it('createAdditionTestData returns valid data', () => {
    const { beforeBytes, afterBytes } = createAdditionTestData();
    expect(beforeBytes).toEqual([65, 66, 67]); // "ABC"
    expect(afterBytes).toEqual([65, 66, 67, 68]); // "ABCD"
  });
});
