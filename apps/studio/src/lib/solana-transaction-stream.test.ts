import { describe, it, expect } from 'vitest';
import {
  formatSignature,
  formatTime,
  getTransactionStatus,
  getTransactionPrograms,
  TransactionInfo,
} from './solana-transaction-stream';

function makeTx(overrides: Partial<TransactionInfo> = {}): TransactionInfo {
  return {
    signatures: ['sig123'],
    slot: 100,
    err: null,
    memo: null,
    blockTime: 1700000000,
    meta: {
      err: null,
      fee: 5000,
      preBalances: [1000000],
      postBalances: [995000],
      innerInstructions: [],
      logMessages: [],
      preTokenBalances: [],
      postTokenBalances: [],
      rewards: [],
      loadedAddresses: null,
      returnData: null,
      computeUnitsConsumed: 200,
    },
    transaction: {
      message: {
        accountKeys: ['addr1', 'addr2'],
        recentBlockhash: 'hash123',
        instructions: [
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { programId: '11111111111111111111111111111111' },
        ],
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 1,
        },
      },
      signatures: ['sig123'],
    },
    ...overrides,
  };
}

describe('formatSignature', () => {
  it('returns the signature unchanged', () => {
    expect(formatSignature('abc123')).toBe('abc123');
  });
});

describe('formatTime', () => {
  it('returns N/A for null timestamp', () => {
    expect(formatTime(null)).toBe('N/A');
  });

  it('returns N/A for zero timestamp', () => {
    expect(formatTime(0)).toBe('N/A');
  });

  it('formats a valid unix timestamp', () => {
    const result = formatTime(1700000000);
    // Should be a time string - just verify it's not N/A and has some content
    expect(result).not.toBe('N/A');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getTransactionStatus', () => {
  it('returns success for transaction with meta and no error', () => {
    expect(getTransactionStatus(makeTx())).toBe('success');
  });

  it('returns failed for transaction with meta error', () => {
    const tx = makeTx({
      meta: {
        err: { InstructionError: [0, 'Custom'] },
        fee: 5000,
        preBalances: [],
        postBalances: [],
        innerInstructions: [],
        logMessages: [],
        preTokenBalances: [],
        postTokenBalances: [],
        rewards: [],
        loadedAddresses: null,
        returnData: null,
        computeUnitsConsumed: 0,
      },
    });
    expect(getTransactionStatus(tx)).toBe('failed');
  });

  it('returns pending for transaction with null meta', () => {
    const tx = makeTx({ meta: null });
    expect(getTransactionStatus(tx)).toBe('pending');
  });
});

describe('getTransactionPrograms', () => {
  it('returns unique program IDs', () => {
    const tx = makeTx();
    const programs = getTransactionPrograms(tx);
    expect(programs).toContain('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(programs).toContain('11111111111111111111111111111111');
    expect(programs).toHaveLength(2);
  });

  it('deduplicates program IDs', () => {
    const tx = makeTx({
      transaction: {
        message: {
          accountKeys: [],
          recentBlockhash: '',
          instructions: [
            { programId: 'prog1' },
            { programId: 'prog1' },
            { programId: 'prog2' },
          ],
          header: { numRequiredSignatures: 0, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
        },
        signatures: [],
      },
    });
    expect(getTransactionPrograms(tx)).toEqual(['prog1', 'prog2']);
  });

  it('returns empty array for missing instructions', () => {
    const tx = makeTx({
      transaction: {
        message: {
          accountKeys: [],
          recentBlockhash: '',
          instructions: [],
          header: { numRequiredSignatures: 0, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
        },
        signatures: [],
      },
    });
    expect(getTransactionPrograms(tx)).toEqual([]);
  });
});
