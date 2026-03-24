import { describe, it, expect } from 'vitest';
import {
  analyzeHexDiff,
  createRemovalTestData,
  createUpdateTestData,
  createAdditionTestData,
} from './hex-diff-analyzer';

describe('analyzeHexDiff', () => {
  it('returns empty result for identical arrays', () => {
    const bytes = [1, 2, 3, 4, 5];
    const result = analyzeHexDiff(bytes, bytes);
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it('returns empty result for two empty arrays', () => {
    const result = analyzeHexDiff([], []);
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it('detects removals using createRemovalTestData', () => {
    const { beforeBytes, afterBytes } = createRemovalTestData();
    const result = analyzeHexDiff(beforeBytes, afterBytes);
    // "0.001" -> "0" is a removal of bytes
    expect(result.removals.length + result.updates.length).toBeGreaterThan(0);
  });

  it('detects updates using createUpdateTestData', () => {
    const { beforeBytes, afterBytes } = createUpdateTestData();
    const result = analyzeHexDiff(beforeBytes, afterBytes);
    // "ABC" -> "XYZ" is a pure update (same length, different values)
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].beforeRange.start).toBe(0);
    expect(result.updates[0].beforeRange.end).toBe(2);
    expect(result.updates[0].afterRange.start).toBe(0);
    expect(result.updates[0].afterRange.end).toBe(2);
  });

  it('detects additions using createAdditionTestData', () => {
    const { beforeBytes, afterBytes } = createAdditionTestData();
    const result = analyzeHexDiff(beforeBytes, afterBytes);
    // "ABC" -> "ABCD" adds one byte
    expect(result.additions).toHaveLength(1);
    expect(result.additions[0].afterRange.start).toBe(3);
    expect(result.additions[0].afterRange.end).toBe(3);
  });

  it('detects all additions when before is empty', () => {
    const result = analyzeHexDiff([], [1, 2, 3]);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(0);
  });

  it('detects all removals when after is empty', () => {
    const result = analyzeHexDiff([1, 2, 3], []);
    expect(result.removals).toHaveLength(1);
    expect(result.additions).toHaveLength(0);
  });
});
