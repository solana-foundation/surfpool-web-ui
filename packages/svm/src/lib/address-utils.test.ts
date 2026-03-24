import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  truncateAddress,
  aggressiveTruncateAddress,
  copyToClipboard,
  convertTokenAmount,
  convertToRawAmount,
  formatTokenAmount,
} from './address-utils';

describe('truncateAddress', () => {
  it('returns short addresses unchanged (<=16 chars)', () => {
    expect(truncateAddress('abc123')).toBe('abc123');
  });

  it('returns exactly 16 char address unchanged', () => {
    const addr = '1234567890123456';
    expect(truncateAddress(addr)).toBe(addr);
  });

  it('truncates addresses longer than 16 chars', () => {
    const addr = '12345678901234567'; // 17 chars
    expect(truncateAddress(addr)).toBe('12345678\u22EF01234567');
  });

  it('truncates a Solana-style address', () => {
    const addr = '83astBRguLMdt2h5U1Tpdq5tjFoJ6noeGwaY3mDLVcri';
    expect(truncateAddress(addr)).toBe('83astBRg\u22EF3mDLVcri');
  });
});

describe('aggressiveTruncateAddress', () => {
  it('returns short addresses unchanged (<=8 chars)', () => {
    expect(aggressiveTruncateAddress('12345678')).toBe('12345678');
  });

  it('truncates addresses longer than 8 chars', () => {
    expect(aggressiveTruncateAddress('123456789')).toBe('1234\u22EF6789');
  });

  it('truncates a Solana-style address', () => {
    const addr = '83astBRguLMdt2h5U1Tpdq5tjFoJ6noeGwaY3mDLVcri';
    expect(aggressiveTruncateAddress(addr)).toBe('83as\u22EFVcri');
  });
});

describe('copyToClipboard', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it('returns true on success', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const result = await copyToClipboard('test text');
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
  });

  it('returns false on failure', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    const result = await copyToClipboard('test text');
    expect(result).toBe(false);
  });
});

describe('convertTokenAmount', () => {
  it('converts raw amount with decimals', () => {
    expect(convertTokenAmount(1000000000, 9)).toBe(1);
  });

  it('handles zero decimals', () => {
    expect(convertTokenAmount(100, 0)).toBe(100);
  });

  it('handles fractional results', () => {
    expect(convertTokenAmount(5, 1)).toBeCloseTo(0.5);
  });

  it('handles zero amount', () => {
    expect(convertTokenAmount(0, 9)).toBe(0);
  });
});

describe('convertToRawAmount', () => {
  it('converts human amount to raw', () => {
    expect(convertToRawAmount(1, 9)).toBe(1000000000);
  });

  it('handles zero decimals', () => {
    expect(convertToRawAmount(100, 0)).toBe(100);
  });

  it('handles fractional human amounts', () => {
    expect(convertToRawAmount(0.5, 1)).toBeCloseTo(5);
  });
});

describe('formatTokenAmount', () => {
  it('formats with default options', () => {
    const result = formatTokenAmount(1000000000, 9, 'SOL');
    expect(result).toBe('1 SOL');
  });

  it('formats large amounts with grouping', () => {
    const result = formatTokenAmount(1234567000000000, 9, 'SOL');
    expect(result).toContain(',');
    expect(result).toContain('SOL');
  });

  it('respects minimumFractionDigits', () => {
    const result = formatTokenAmount(1000000000, 9, 'SOL', { minimumFractionDigits: 2 });
    expect(result).toBe('1.00 SOL');
  });

  it('respects maximumFractionDigits', () => {
    const result = formatTokenAmount(1234567890, 9, 'SOL', { maximumFractionDigits: 4 });
    expect(result).toMatch(/^1\.2346 SOL$/);
  });

  it('respects useGrouping: false', () => {
    const result = formatTokenAmount(1234567000000000, 9, 'TOKEN', { useGrouping: false });
    expect(result).not.toContain(',');
  });
});
