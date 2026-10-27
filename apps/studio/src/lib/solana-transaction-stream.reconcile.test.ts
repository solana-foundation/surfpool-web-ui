import { EventEmitter } from 'events';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The hook's shared WebSocket service, replaced by a counting fake.
const service = vi.hoisted(() => ({ current: null as any }));
vi.mock('./solana-websocket-service', () => ({
  solanaWebSocketService: new Proxy({}, { get: (_target, key) => service.current[key].bind(service.current) }),
  SolanaWebSocketService: { convertHttpToWebSocket: (url: string) => url },
}));
import { useTransactionInspector } from './solana-transaction-stream';

class FakeService extends EventEmitter {
  transactionSubscriptions = 0;
  async connect() {
    this.emit('connected');
  }
  async subscribeToTransactions() {
    this.transactionSubscriptions++;
    return `tx-${this.transactionSubscriptions}`;
  }
  async subscribeToSlots() {
    return 'slot';
  }
  unsubscribeAll() {}
}

const transaction = (signature: string) => ({
  slot: 100,
  blockTime: 1000,
  meta: { err: null, fee: 1 },
  transaction: { signatures: [signature], message: { instructions: [], accountKeys: [], recentBlockhash: 'x' } },
});
const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ result }) });
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const urls = { rpcUrl: 'http://fork.invalid', wsUrl: 'ws://fork.invalid' };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useTransactionInspector on a historical surfnet (reconcile)', () => {
  it('loads transactions missed during disconnection without duplicating existing entries', async () => {
    service.current = new FakeService();
    let local = ['A'];
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      const query = JSON.parse(init.body);
      if (query.method === 'surfnet_getLocalSignatures') return reply({ value: local.map(signature => ({ signature })) });
      if (query.method === 'getTransaction') {
        requests.push(query.params[0]);
        return reply(transaction(query.params[0]));
      }
      throw new Error(`unexpected ${query.method}`);
    });
    const { result } = renderHook(() => useTransactionInspector({ ...urls, reconcile: true }));
    await act(flush);
    expect(result.current.transactions.map(tx => tx.transaction.signatures[0])).toEqual(['A']);
    local = ['B', 'A'];
    await act(async () => {
      service.current.emit('disconnected');
      service.current.emit('connected');
      await flush();
    });
    expect(result.current.transactions.map(tx => tx.transaction.signatures[0])).toEqual(['B', 'A']);
    await act(async () => { service.current.emit('slot', { slot: 101 }); await flush(); });
    expect(requests).toEqual(['A', 'B']);
  });

  it('rejects a missed-transaction load superseded by a reset inventory', async () => {
    service.current = new FakeService();
    let local = ['A'];
    let release!: (response: unknown) => void;
    const pending = new Promise(resolve => { release = resolve; });
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      const query = JSON.parse(init.body);
      if (query.method === 'surfnet_getLocalSignatures') return reply({ value: local.map(signature => ({ signature })) });
      if (query.method === 'getTransaction') {
        requested.push(query.params[0]);
        return query.params[0] === 'B' ? pending : reply(transaction(query.params[0]));
      }
      throw new Error(`unexpected ${query.method}`);
    });
    const { result } = renderHook(() => useTransactionInspector({ ...urls, reconcile: true }));
    await act(flush);
    local = ['B', 'A'];
    await act(async () => { service.current.emit('slot', { slot: 101 }); await flush(); });
    expect(requested).toContain('B');
    local = [];
    await act(async () => { service.current.emit('slot', { slot: 100 }); await flush(); });
    await act(async () => { release(reply(transaction('B'))); await flush(); });
    expect(result.current.transactions).toEqual([]);
  });

  it('drops a transaction load that began before a reset cleared the list', async () => {
    service.current = new FakeService();
    let local: string[] = [];
    let release!: (value: unknown) => void;
    const late = new Promise((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      const query = JSON.parse(init.body);
      if (query.method === 'surfnet_getLocalSignatures') return reply({ value: local.map((signature) => ({ signature })) });
      if (query.method === 'getTransaction') return query.params[0] === 'B' ? late : reply(transaction(query.params[0]));
      throw new Error(`unexpected ${query.method}`);
    });
    const { result } = renderHook(() => useTransactionInspector({ ...urls, reconcile: true }));
    await act(flush);
    local = ['A'];
    await act(async () => {
      service.current.emit('transaction', { value: { signature: 'A' } });
      await flush();
    });
    expect(result.current.transactions.map((tx) => tx.transaction.signatures[0])).toEqual(['A']);
    act(() => {
      service.current.emit('transaction', { value: { signature: 'B' } });
    });
    // The surfnet resets: it lists no local transaction any more.
    local = [];
    await act(async () => {
      service.current.emit('slot', { slot: 100, parent: 99 });
      await flush();
    });
    expect(result.current.transactions).toEqual([]);
    await act(async () => {
      release(reply(transaction('B')));
      await flush();
    });
    expect(result.current.transactions).toEqual([]);
  });

  it('still resubscribes after a reconnect while streaming (a restarted surfnet)', async () => {
    service.current = new FakeService();
    vi.stubGlobal('fetch', async () => reply({ value: [] }));
    renderHook(() => useTransactionInspector({ ...urls, reconcile: true, fetchHistorical: false }));
    await act(flush);
    expect(service.current.transactionSubscriptions).toBe(1);
    await act(async () => {
      service.current.emit('disconnected');
      service.current.emit('connected');
      await flush();
    });
    expect(service.current.transactionSubscriptions).toBe(2);
  });

  it('does not subscribe on a reconnect when streaming is disabled', async () => {
    service.current = new FakeService();
    vi.stubGlobal('fetch', async () => reply({ value: [] }));
    const { result } = renderHook(() =>
      useTransactionInspector({ ...urls, reconcile: true, autoStart: false, fetchHistorical: false }),
    );
    await act(flush);
    await act(async () => {
      service.current.emit('disconnected');
      service.current.emit('connected');
      await flush();
    });
    expect(service.current.transactionSubscriptions).toBe(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it('does not subscribe on a reconnect after streaming was stopped', async () => {
    service.current = new FakeService();
    vi.stubGlobal('fetch', async () => reply({ value: [] }));
    const { result } = renderHook(() => useTransactionInspector({ ...urls, reconcile: true, fetchHistorical: false }));
    await act(flush);
    expect(service.current.transactionSubscriptions).toBe(1);
    act(() => result.current.stopStreaming());
    await act(async () => {
      service.current.emit('disconnected');
      service.current.emit('connected');
      await flush();
    });
    expect(service.current.transactionSubscriptions).toBe(1);
    expect(result.current.isStreaming).toBe(false);
  });

  it('leaves normal mode without reconnect subscriptions', async () => {
    service.current = new FakeService();
    vi.stubGlobal('fetch', async () => reply({ value: [] }));
    renderHook(() => useTransactionInspector({ ...urls, autoStart: false, fetchHistorical: false }));
    await act(async () => {
      service.current.emit('disconnected');
      service.current.emit('connected');
      await flush();
    });
    expect(service.current.transactionSubscriptions).toBe(0);
  });
});
