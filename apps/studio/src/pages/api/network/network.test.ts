import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNetworkInitializing, getNetworks, fetchRpc, checkNetworkStatus, Network } from './index';

function makeNetwork(overrides: Partial<Network> = {}): Network {
  return {
    id: 'net-1',
    name: 'Test Network',
    description: 'A test network',
    status: 'Running',
    created_at: '2025-01-01T00:00:00Z',
    rpc_url: 'http://localhost:8899',
    datasource_rpc_url: 'http://localhost:8900',
    ...overrides,
  };
}

describe('isNetworkInitializing', () => {
  it('returns true for Pending status', () => {
    expect(isNetworkInitializing(makeNetwork({ status: 'Pending' }))).toBe(true);
  });

  it('returns false for Running status', () => {
    expect(isNetworkInitializing(makeNetwork({ status: 'Running' }))).toBe(false);
  });

  it('returns false for other statuses', () => {
    expect(isNetworkInitializing(makeNetwork({ status: 'Error' }))).toBe(false);
  });
});

describe('getNetworks', () => {
  it('generates a GraphQL query with the workspace UUID', () => {
    const query = getNetworks('workspace-123');
    expect(query).toContain('workspace-123');
    expect(query).toContain('svm_networks');
    expect(query).toContain('_eq');
  });
});

describe('fetchRpc', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a JSON-RPC request and returns the response', async () => {
    const mockResponse = { jsonrpc: '2.0', id: 1, result: { epoch: 1 } };
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockResponse),
    });

    const network = makeNetwork();
    const result = await fetchRpc(network, 'getEpochInfo');
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8899',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getEpochInfo' }),
      })
    );
  });

  it('returns null on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    const result = await fetchRpc(makeNetwork(), 'getEpochInfo');
    expect(result).toBeNull();
  });
});

describe('checkNetworkStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when RPC responds with a result', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: { epoch: 1 } }),
    });
    expect(await checkNetworkStatus(makeNetwork())).toBe(true);
  });

  it('returns false when RPC responds without a result', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, error: { message: 'error' } }),
    });
    expect(await checkNetworkStatus(makeNetwork())).toBe(false);
  });

  it('returns false on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));
    expect(await checkNetworkStatus(makeNetwork())).toBe(false);
  });
});
