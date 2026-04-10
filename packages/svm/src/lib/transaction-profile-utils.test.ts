import { describe, expect, it } from 'vitest';
import {
  computeHexDiff,
  getInstanceSummary,
  getMergedTransactionProfile,
  getReportSummary,
  getTransactionComputeUnits,
  getTransactionPrograms,
  mergeTransactionProfiles,
  type SurfpoolReport,
  type TransactionReportEntry,
} from './transaction-profile-utils';

const transactionEntry: TransactionReportEntry = {
  signature: '5N7K6F6C9p9wW4mTnW8a3yM4i6AqZfFXE3R4G5H6J7K8L9M1N2P3Q4R5S6T7U8V9',
  slot: 42,
  error: null,
  logs: ['Program 11111111111111111111111111111111 invoke [1]', 'Program log: transfer complete'],
  profile_json_parsed: {
    slot: 42,
    transactionProfile: {
      computeUnitsConsumed: 3300,
      accountStates: {
        writable11111111111111111111111111111111: {
          type: 'writable',
          accountChange: {
            type: 'update',
            data: [
              {
                lamports: 10,
                owner: '11111111111111111111111111111111',
                executable: false,
                rentEpoch: 0,
                space: 0,
                data: {
                  parsed: {
                    amount: 10,
                  },
                },
              },
              {
                lamports: 20,
                owner: '11111111111111111111111111111111',
                executable: false,
                rentEpoch: 0,
                space: 0,
                data: {
                  parsed: {
                    amount: 20,
                  },
                },
              },
            ],
          },
        },
      },
      logMessages: [],
      errorMessage: null,
    },
    instructionProfiles: [
      {
        computeUnitsConsumed: 3300,
        logMessages: ['Program 11111111111111111111111111111111 invoke [1]'],
        errorMessage: null,
        accountStates: {
          writable11111111111111111111111111111111: {
            type: 'writable',
            accountChange: {
              type: 'unchanged',
            },
          },
        },
      },
    ],
    readonlyAccountStates: {
      readonly11111111111111111111111111111111: {
        lamports: 99,
        owner: '11111111111111111111111111111111',
        executable: false,
        rentEpoch: 0,
        space: 0,
        data: {
          parsed: {
            amount: 99,
          },
        },
      },
    },
  },
  profile_base64: {
    slot: 42,
    transactionProfile: {
      computeUnitsConsumed: 3300,
      accountStates: {
        writable11111111111111111111111111111111: {
          type: 'writable',
          accountChange: {
            type: 'update',
            data: [
              {
                lamports: 10,
                owner: '11111111111111111111111111111111',
                executable: false,
                rentEpoch: 0,
                space: 0,
                data: ['AQID', 'base64'],
              },
              {
                lamports: 20,
                owner: '11111111111111111111111111111111',
                executable: false,
                rentEpoch: 0,
                space: 0,
                data: ['BAUG', 'base64'],
              },
            ],
          },
        },
      },
    },
    instructionProfiles: [
      {
        computeUnitsConsumed: 3300,
        logMessages: ['Program 11111111111111111111111111111111 invoke [1]'],
        errorMessage: null,
        accountStates: {
          writable11111111111111111111111111111111: {
            type: 'writable',
            accountChange: {
              type: 'unchanged',
            },
          },
        },
      },
    ],
    readonlyAccountStates: {
      readonly11111111111111111111111111111111: {
        lamports: 99,
        owner: '11111111111111111111111111111111',
        executable: false,
        rentEpoch: 0,
        space: 0,
        data: ['BwgJ', 'base64'],
      },
    },
  },
};

describe('transaction-profile-utils', () => {
  it('merges parsed and base64 data into a processed profile', () => {
    const merged = mergeTransactionProfiles(transactionEntry.profile_json_parsed, transactionEntry.profile_base64);
    const profile = getMergedTransactionProfile(transactionEntry);

    expect(merged.instructionProfiles).toHaveLength(1);
    expect(profile?.instructionProfiles[0].accountStates.writable11111111111111111111111111111111.accountChange?.type).toBe(
      'update'
    );
    expect(
      (profile?.instructionProfiles[0].accountStates.writable11111111111111111111111111111111.accountChange?.data as any[])[0]
        .bytes
    ).toEqual([1, 2, 3]);
    expect((profile?.readonlyAccountStates.readonly11111111111111111111111111111111 as any).bytes).toEqual([7, 8, 9]);
  });

  it('summarizes report totals and program names', () => {
    const report: SurfpoolReport = {
      generated_at: '2026-04-03T12:00:00Z',
      instances: [
        {
          instance_id: 'instance-a',
          test_name: 'sdk::report',
          rpc_url: 'http://127.0.0.1:8899',
          timestamp: '2026-04-03T12:00:00Z',
          transactions: [transactionEntry],
        },
      ],
    };

    expect(getTransactionComputeUnits(transactionEntry)).toBe(3300);
    expect(getTransactionPrograms(transactionEntry)).toEqual(['11111111111111111111111111111111']);
    expect(getInstanceSummary(report.instances[0])).toEqual({
      transactions: 1,
      failed: 0,
      computeUnits: 3300,
    });
    expect(getReportSummary(report)).toEqual({
      tests: 1,
      transactions: 1,
      failed: 0,
      computeUnits: 3300,
    });
  });

  it('marks additions, removals, and updates in hex diffs', () => {
    const { beforeDiffMap, afterDiffMap } = computeHexDiff([1, 2, 3], [1, 9, 3, 4]);

    expect(beforeDiffMap.get(1)?.type).toBe('update');
    expect(afterDiffMap.get(1)?.type).toBe('update');
    expect(afterDiffMap.get(3)?.type).toBe('addition');
  });
});
