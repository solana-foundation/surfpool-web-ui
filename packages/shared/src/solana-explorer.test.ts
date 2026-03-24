import { describe, it, expect } from 'vitest';
import { getSolanaExplorerUrl, getAddressExplorerUrl, getTransactionExplorerUrl } from './solana-explorer';

describe('getSolanaExplorerUrl', () => {
  const rpcUrl = 'http://localhost:8899';

  it('returns base URL with custom cluster param when no path given', () => {
    const url = getSolanaExplorerUrl(rpcUrl);
    expect(url).toBe(`https://explorer.solana.com/?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`);
  });

  it('returns URL with path and custom cluster param', () => {
    const url = getSolanaExplorerUrl(rpcUrl, 'address/abc123');
    expect(url).toBe(`https://explorer.solana.com/address/abc123?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`);
  });

  it('strips leading slash from path', () => {
    const url = getSolanaExplorerUrl(rpcUrl, '/address/abc123');
    expect(url).toBe(`https://explorer.solana.com/address/abc123?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`);
  });

  it('encodes special characters in RPC URL', () => {
    const specialRpcUrl = 'http://localhost:8899?param=value&other=123';
    const url = getSolanaExplorerUrl(specialRpcUrl);
    expect(url).toContain(encodeURIComponent(specialRpcUrl));
  });

  it('handles empty path string', () => {
    const url = getSolanaExplorerUrl(rpcUrl, '');
    // Empty string is falsy, so no path is added
    expect(url).toBe(`https://explorer.solana.com/?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`);
  });
});

describe('getAddressExplorerUrl', () => {
  it('returns explorer URL with address path', () => {
    const address = '83astBRguLMdt2h5U1Tpdq5tjFoJ6noeGwaY3mDLVcri';
    const rpcUrl = 'http://localhost:8899';
    const url = getAddressExplorerUrl(address, rpcUrl);
    expect(url).toContain(`/address/${address}`);
    expect(url).toContain('cluster=custom');
  });
});

describe('getTransactionExplorerUrl', () => {
  it('returns explorer URL with tx path', () => {
    const signature = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
    const rpcUrl = 'http://localhost:8899';
    const url = getTransactionExplorerUrl(signature, rpcUrl);
    expect(url).toContain(`/tx/${signature}`);
    expect(url).toContain('cluster=custom');
  });
});
