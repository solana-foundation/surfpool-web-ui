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
afterEach(cleanup);

describe('normal transaction stream reconnect', () => {
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
    });
  }
});
