import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ConfigContext } from '@/contexts/config-context';
import { vi } from 'vitest';
import type { TransactionInfo } from '@/lib/solana-transaction-stream';

// Default config matching useAppConfig fallbacks
const DEFAULT_CONFIG = {
  rpc_url: 'http://127.0.0.1:8899',
  ws_url: 'ws://127.0.0.1:8900',
  rpc_datasource_url: 'https://api.mainnet-beta.solana.com/',
  studio_url: 'http://127.0.0.1:18488',
};

export function makeConfig(overrides: Record<string, string> = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}

interface RenderWithConfigOptions extends Omit<RenderOptions, 'wrapper'> {
  config?: Record<string, string> | null;
  loading?: boolean;
  error?: string | null;
}

export function renderWithConfig(
  ui: React.ReactElement,
  {
    config = DEFAULT_CONFIG,
    loading = false,
    error = null,
    ...renderOptions
  }: RenderWithConfigOptions = {}
) {
  const value = {
    config: config as any,
    loading,
    error,
    refetch: vi.fn(),
  };

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ConfigContext.Provider value={value}>
        {children}
      </ConfigContext.Provider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    refetch: value.refetch,
  };
}

export function makeTx(overrides: Partial<TransactionInfo> = {}): TransactionInfo {
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
