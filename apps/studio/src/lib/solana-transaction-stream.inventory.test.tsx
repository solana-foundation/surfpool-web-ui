import { EventEmitter } from 'events';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ service: null as any }));
vi.mock('./solana-websocket-service', () => ({
  solanaWebSocketService: new Proxy({}, { get: (_target, key) => state.service[key].bind(state.service) }),
  SolanaWebSocketService: { convertHttpToWebSocket: (url: string) => url },
}));
import { useTransactionInspector } from './solana-transaction-stream';

class Service extends EventEmitter {
  async connect() { this.emit('connected'); }
  async subscribeToTransactions() { return 'transactions'; }
  async subscribeToSlots() { return 'slots'; }
  unsubscribeAll() {}
}
const reply = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
const transaction = (signature: string) => ({
  slot: 100, meta: { err: null, fee: 1 },
  transaction: { signatures: [signature], message: {
    instructions: [{ programId: signature.startsWith('match') ? 'target' : 'other' }], accountKeys: [] } },
});
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const options = { rpcUrl: 'http://fork.invalid', wsUrl: 'ws://fork.invalid', reconcile: true };
let local: string[], requested: string[];
let inventory: (() => Promise<unknown>) | undefined;
const notify = async (signature: string) => {
  await act(async () => { state.service.emit('transaction', { value: { signature } }); await flush(); });
};
const slot = async () => {
  await act(async () => { state.service.emit('slot', { slot: 100 }); await flush(); });
};
const signatures = (transactions: { transaction: { signatures: string[] } }[]) => transactions.map(tx => tx.transaction.signatures[0]);

beforeEach(() => {
  state.service = new Service(); local = []; requested = []; inventory = undefined;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const query = JSON.parse(init.body as string);
    if (query.method === 'surfnet_getLocalSignatures') return inventory
      ? inventory() : reply({ value: local.map(signature => ({ signature })) });
    if (query.method === 'getTransaction') { requested.push(query.params[0]); return reply(transaction(query.params[0])); }
    throw new Error(`Unexpected ${query.method}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('historical transaction inventory order and scope', () => {
  it('applies ordered slow inventories even while newer slot reads remain pending', async () => {
    const { result } = renderHook(() => useTransactionInspector(options));
    await act(flush);
    const releases: ((value: unknown) => void)[] = [];
    inventory = () => new Promise(resolve => { releases.push(resolve); });
    await slot(); await slot(); await slot();
    expect(releases).toHaveLength(3);
    await act(async () => { releases[0](reply({ value: [{ signature: 'A' }] })); await flush(); });
    expect(signatures(result.current.transactions)).toEqual(['A']);
    await act(async () => { releases[1](reply({ value: [{ signature: 'B' }, { signature: 'A' }] })); await flush(); });
    expect(signatures(result.current.transactions)).toEqual(['B', 'A']);
    await act(async () => { releases[2](reply({ value: [] })); await flush(); });
    expect(result.current.transactions).toEqual([]);
  });

  it('does not let an older inventory overwrite a newer reset that already applied', async () => {
    const { result } = renderHook(() => useTransactionInspector(options));
    await act(flush);
    const releases: ((value: unknown) => void)[] = [];
    inventory = () => new Promise(resolve => { releases.push(resolve); });
    await slot(); await slot();
    await act(async () => { releases[1](reply({ value: [] })); await flush(); });
    await act(async () => { releases[0](reply({ value: [{ signature: 'old' }] })); await flush(); });
    expect(result.current.transactions).toEqual([]);
    expect(requested).toEqual([]);
  });

  it.each([1, 2])('retains the newest entries before applying a limit of %i', async maxTransactions => {
    const { result } = renderHook(() => useTransactionInspector({ ...options, maxTransactions }));
    await act(flush); await notify('C'); local = ['C', 'B', 'A'];
    await act(async () => { state.service.emit('disconnected'); state.service.emit('connected'); await flush(); });
    expect(signatures(result.current.transactions)).toEqual(local.slice(0, maxTransactions));
    await slot();
    expect(signatures(result.current.transactions)).toEqual(local.slice(0, maxTransactions));
    expect(requested).toEqual(local.slice(0, maxTransactions));
    // A formerly out-of-window entry can become visible after a reset removes C.
    local = ['B', 'A']; await slot();
    expect(signatures(result.current.transactions)).toEqual(local.slice(0, maxTransactions));
  });

  it('keeps live-only panes free of history but still removes reset entries', async () => {
    const { result } = renderHook(() => useTransactionInspector({ ...options, fetchHistorical: false }));
    await act(flush); await notify('C'); local = ['C', 'B', 'A']; await slot();
    expect(signatures(result.current.transactions)).toEqual(['C']); expect(requested).toEqual(['C']);
    local = []; await slot(); expect(result.current.transactions).toEqual([]);
    await notify('D'); expect(signatures(result.current.transactions)).toEqual(['D']);
  });

  it('retains a notification newer than the inventory above its ordered history', async () => {
    const { result } = renderHook(() => useTransactionInspector({ ...options, maxTransactions: 3 }));
    await act(flush); await notify('C');
    let release!: (response: unknown) => void;
    inventory = () => new Promise(resolve => { release = resolve; });
    await slot(); await notify('D');
    await act(async () => {
      release(reply({ value: ['C', 'B', 'A'].map(signature => ({ signature })) })); await flush();
    });
    expect(signatures(result.current.transactions)).toEqual(['D', 'C', 'B']);
  });

  it('counts matching programs rather than raw inventory entries toward the limit', async () => {
    const { result } = renderHook(() => useTransactionInspector({ ...options, maxTransactions: 2, filterByProgram: 'target' }));
    await act(flush); local = ['otherC', 'matchB', 'otherA', 'matchA']; await slot();
    expect(signatures(result.current.transactions)).toEqual(['matchB', 'matchA']);
  });

  it('does not count a newer notification twice when the inventory also lists it', async () => {
    const { result } = renderHook(() => useTransactionInspector({ ...options, maxTransactions: 2 }));
    await act(flush);
    let release!: (response: unknown) => void;
    inventory = () => new Promise(resolve => { release = resolve; });
    await slot(); await notify('C');
    await act(async () => {
      release(reply({ value: ['C', 'B', 'A'].map(signature => ({ signature })) })); await flush();
    });
    expect(signatures(result.current.transactions)).toEqual(['C', 'B']);
    expect(requested).toEqual(['C', 'B']);
  });

  it('keeps inventory order for a delayed duplicate notification outside the visible window', async () => {
    const { result } = renderHook(() => useTransactionInspector({ ...options, maxTransactions: 2 }));
    await act(flush); await notify('C'); local = ['C', 'B', 'A']; await slot();
    await notify('A'); expect(signatures(result.current.transactions)).toEqual(['C', 'B']);
  });

  it('preserves normal-mode duplicate suppression after truncation', async () => {
    const { result } = renderHook(() => useTransactionInspector({ ...options, reconcile: false,
      fetchHistorical: false, maxTransactions: 1 }));
    await act(flush); await notify('A'); await notify('B'); await notify('A');
    expect(signatures(result.current.transactions)).toEqual(['B']);
    expect(requested).toEqual(['A', 'B']);
  });
});
