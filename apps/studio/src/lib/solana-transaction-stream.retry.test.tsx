import { act, cleanup, renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ service: null as any }));
vi.mock('@surfpool/shared', () => ({ logger: { log: vi.fn() } }));
vi.mock('@solana/spl-token', () => ({}));
vi.mock('@solana/web3.js', () => ({}));
vi.mock('./address-utils', () => ({}));
vi.mock('./solana-websocket-service', () => ({
  solanaWebSocketService: new Proxy({}, {
    get: (_, key) => {
      const value = state.service[key];
      return typeof value === 'function' ? value.bind(state.service) : value;
    }
  }),
  SolanaWebSocketService: { convertHttpToWebSocket: (value: string) => value }
}));
import { useTransactionInspector } from './solana-transaction-stream';

class Service extends EventEmitter {
  active = new Set<string>();
  connect = vi.fn(async () => { this.emit('connected'); });
  subscribeToTransactions = vi.fn<() => Promise<string>>(async (): Promise<string> => {
    const id = 'logs-' + this.subscribeToTransactions.mock.calls.length;
    this.active.add(id);
    return id;
  });
  unsubscribe = vi.fn((id: string) => this.active.delete(id));
  unsubscribeAll = vi.fn(() => this.active.clear());
}
let service: Service;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const mount = (options = {}) => renderHook(() => useTransactionInspector({
  rpcUrl: 'http://fork.invalid', wsUrl: 'ws://fork.invalid',
  fetchHistorical: false, ...options
}));
beforeEach(() => { service = new Service(); state.service = service; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('normal transaction stream reconnect', () => {
  for (const stage of ['connect', 'subscribe', 'before startup']) {
    it(`marks a manual stream running after a disconnect (${stage})`, async () => {
      let finish!: () => void;
      if (stage === 'connect') {
        service.connect.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
      } else if (stage === 'subscribe') {
        service.subscribeToTransactions.mockImplementationOnce(() => new Promise<string>(resolve => {
          finish = () => { service.active.add('stale'); resolve('stale'); };
        }));
      }
      const hook = mount({ autoStart: false });
      if (stage === 'before startup') act(() => { service.emit('disconnected'); });
      act(() => { void hook.result.current.startStreaming(); });
      await act(flush);
      if (stage !== 'before startup') {
        await act(async () => {
          service.active.clear();
          service.emit('disconnected'); service.emit('connected'); await flush();
          finish(); await flush();
        });
      }
      expect(service.active.size).toBe(1);
      expect(service.active.has('stale')).toBe(false);
      expect(hook.result.current.isStreaming).toBe(true);
      const subscriptions = service.subscribeToTransactions.mock.calls.length;
      act(() => hook.result.current.toggleStreaming());
      expect(hook.result.current.isStreaming).toBe(false);
      expect(service.active.size).toBe(0);
      expect(service.subscribeToTransactions).toHaveBeenCalledTimes(subscriptions);
    });
  }

  it('invalidates old historical inventory without cancelling the pending subscription', async () => {
    let finish!: () => void;
    let release!: (value: any) => void;
    const oldInventory = new Promise(resolve => { release = resolve; });
    service.subscribeToTransactions.mockImplementationOnce(() => new Promise<string>(resolve => {
      finish = () => { service.active.add('pending'); resolve('pending'); };
    }));
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body).method);
      return url === 'http://fork.invalid' ? oldInventory :
        { ok: true, status: 200, json: async () => ({ result: { value: [] } }) };
    });
    const hook = renderHook(({ rpcUrl }) => useTransactionInspector({
      rpcUrl, wsUrl: 'ws://fork.invalid', reconcile: true
    }), { initialProps: { rpcUrl: 'http://fork.invalid' } });
    await act(flush);
    expect(requests).toContain('surfnet_getLocalSignatures');
    hook.rerender({ rpcUrl: 'http://refreshed.invalid' });
    await act(async () => {
      release({ ok: true, status: 200, json: async () => ({ result: { value: [{ signature: 'old' }] } }) });
      finish(); await flush();
    });
    expect(service.active.size).toBe(1);
    expect(service.connect).toHaveBeenCalledTimes(1);
    expect(requests).not.toContain('getTransaction');
    expect(hook.result.current.transactions).toEqual([]);
  });

  for (const stage of ['connect', 'subscribe']) {
    for (const autoStart of [true, false]) {
      it(`preserves a pending ${stage} across RPC refresh (autoStart=${autoStart})`, async () => {
        let finish!: () => void;
        if (stage === 'connect') {
          service.connect.mockImplementationOnce(() => new Promise<void>(resolve => {
            finish = () => { service.emit('connected'); resolve(); };
          }));
        } else {
          service.subscribeToTransactions.mockImplementationOnce(() => new Promise<string>(resolve => {
            finish = () => { service.active.add('pending'); resolve('pending'); };
          }));
        }
        const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: null }) }));
        vi.stubGlobal('fetch', fetch);
        const hook = renderHook(({ rpcUrl }) => useTransactionInspector({
          rpcUrl, wsUrl: 'ws://fork.invalid', fetchHistorical: false, autoStart
        }), { initialProps: { rpcUrl: 'http://fork.invalid' } });
        if (!autoStart) act(() => { void hook.result.current.startStreaming(); });
        await act(flush);
        hook.rerender({ rpcUrl: 'http://refreshed.invalid' });
        await act(async () => { finish(); await flush(); });
        expect(service.connect).toHaveBeenCalledTimes(1);
        expect(service.subscribeToTransactions).toHaveBeenCalledTimes(1);
        expect(service.active.size).toBe(1);
        expect(hook.result.current.stats.connectionStatus).toBe('connected');
        expect(hook.result.current.isStreaming).toBe(true);
        await act(async () => { service.emit('transaction', { value: { signature: 'new-tx' } }); await flush(); });
        expect(fetch).toHaveBeenCalledWith('http://refreshed.invalid', expect.any(Object));
      });
    }
  }

  it('restores its log subscription after the server connection is replaced', async () => {
    const hook = mount(); await act(flush);
    expect(service.subscribeToTransactions).toHaveBeenCalledTimes(1);
    await act(async () => {
      service.active.clear();
      service.emit('disconnected'); service.emit('connected'); await flush();
    });
    expect(service.subscribeToTransactions).toHaveBeenCalledTimes(2);
    expect(service.active.size).toBe(1);
    expect(hook.result.current.isStreaming).toBe(true);
  });

  it('does not start a disabled stream on reconnect', async () => {
    const hook = mount({ autoStart: false }); await act(flush);
    await act(async () => { service.emit('disconnected'); service.emit('connected'); await flush(); });
    expect(service.subscribeToTransactions).not.toHaveBeenCalled();
    expect(hook.result.current.isStreaming).toBe(false);
  });

  it('preserves an explicit stop across reconnect', async () => {
    const hook = mount(); await act(flush);
    act(() => hook.result.current.stopStreaming());
    await act(async () => { service.emit('disconnected'); service.emit('connected'); await flush(); });
    expect(service.subscribeToTransactions).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isStreaming).toBe(false);
  });

  it('shows a resubscription failure and clears it after recovery', async () => {
    const hook = mount(); await act(flush);
    const failure = new Error('subscription was refused');
    service.subscribeToTransactions.mockRejectedValueOnce(failure);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => { service.emit('disconnected'); service.emit('connected'); await flush(); });
      expect(hook.result.current.error).toBe(failure.message);
      expect(hook.result.current.stats.connectionStatus).toBe('error');
      expect(logged).toHaveBeenCalledWith('Resubscribing after a reconnect failed:', failure);
      await act(async () => { service.emit('disconnected'); service.emit('connected'); await flush(); });
      expect(hook.result.current.error).toBeNull();
      expect(hook.result.current.stats.connectionStatus).toBe('connected');
    } finally { logged.mockRestore(); }
  });

  for (const close of ['stop', 'unmount']) {
    it(`cancels a late reconnect subscription after ${close}`, async () => {
      const hook = mount(); await act(flush);
      let finish!: (id: string) => void;
      service.subscribeToTransactions.mockImplementationOnce(() => new Promise<string>(resolve => {
        finish = id => { service.active.add(id); resolve(id); };
      }));
      act(() => { service.emit('disconnected'); service.emit('connected'); });
      expect(service.subscribeToTransactions).toHaveBeenCalledTimes(2);
      if (close === 'stop') act(() => hook.result.current.stopStreaming());
      else hook.unmount();
      await act(async () => { finish('late'); await flush(); });
      expect(service.active.has('late')).toBe(false);
      if (close === 'stop') expect(hook.result.current.isStreaming).toBe(false);
    });
  }
});
