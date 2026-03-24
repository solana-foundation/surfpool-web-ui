import { describe, it, expect, vi } from 'vitest';
import {
  truncateAddress,
  aggressiveTruncateAddress,
  copyToClipboard,
  convertTokenAmount,
  convertToRawAmount,
  formatTokenAmount,
} from './address-utils';

describe('truncateAddress', () => {
  it('returns short addresses unchanged', () => {
    expect(truncateAddress('abcd1234abcd1234')).toBe('abcd1234abcd1234'); // exactly 16
    expect(truncateAddress('short')).toBe('short');
  });

  it('truncates long addresses with ellipsis', () => {
    const addr = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    expect(truncateAddress(addr)).toBe('7xKXtg2C⋯uJosgAsU');
  });

  it('handles empty string', () => {
    expect(truncateAddress('')).toBe('');
  });
});

describe('aggressiveTruncateAddress', () => {
  it('returns short addresses unchanged', () => {
    expect(aggressiveTruncateAddress('abcd1234')).toBe('abcd1234'); // exactly 8
    expect(aggressiveTruncateAddress('abc')).toBe('abc');
  });

  it('truncates longer addresses with 4 chars each side', () => {
    const addr = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    expect(aggressiveTruncateAddress(addr)).toBe('7xKX⋯gAsU');
  });
});

describe('copyToClipboard', () => {
  it('returns true on success', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    expect(await copyToClipboard('test')).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test');
  });

  it('returns false on failure', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('fail')) },
    });
    expect(await copyToClipboard('test')).toBe(false);
  });
});

describe('convertTokenAmount', () => {
  it('converts raw amount to human-readable with decimals', () => {
    expect(convertTokenAmount(1000000000, 9)).toBe(1);
    expect(convertTokenAmount(500000, 6)).toBe(0.5);
    expect(convertTokenAmount(100, 2)).toBe(1);
  });

  it('handles zero decimals', () => {
    expect(convertTokenAmount(42, 0)).toBe(42);
  });

  it('handles zero amount', () => {
    expect(convertTokenAmount(0, 9)).toBe(0);
  });
});

describe('convertToRawAmount', () => {
  it('converts human-readable to raw amount', () => {
    expect(convertToRawAmount(1, 9)).toBe(1000000000);
    expect(convertToRawAmount(0.5, 6)).toBe(500000);
  });

  it('is the inverse of convertTokenAmount', () => {
    const raw = 123456789;
    const decimals = 6;
    expect(convertToRawAmount(convertTokenAmount(raw, decimals), decimals)).toBeCloseTo(raw);
  });
});

describe('formatTokenAmount', () => {
  it('formats with symbol', () => {
    expect(formatTokenAmount(1000000000, 9, 'SOL')).toBe('1 SOL');
  });

  it('respects maximumFractionDigits', () => {
    const result = formatTokenAmount(1500000000, 9, 'SOL', { maximumFractionDigits: 2 });
    expect(result).toBe('1.5 SOL');
  });

  it('respects minimumFractionDigits', () => {
    const result = formatTokenAmount(1000000000, 9, 'SOL', { minimumFractionDigits: 2 });
    expect(result).toBe('1.00 SOL');
  });

  it('respects useGrouping', () => {
    const result = formatTokenAmount(1000000000000, 9, 'SOL', { useGrouping: false });
    expect(result).toBe('1000 SOL');
  });

  it('formats large amounts with grouping by default', () => {
    const result = formatTokenAmount(1000000000000, 9, 'SOL');
    expect(result).toBe('1,000 SOL');
  });
});
