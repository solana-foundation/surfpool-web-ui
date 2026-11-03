import { EventEmitter } from 'events';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClockState } from './use-clock-state';

const reply = (result: unknown) => ({ ok: true, json: async () => ({ result }) }) as Response;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('authoritative historical clock state', () => {
  it('preserves normal-mode compatibility without calling the new RPC', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const service = new EventEmitter();
    const { result } = renderHook(() => useClockState('http://fork.invalid', service, false));
    await act(flush); expect(result.current[0]).toBe(false); expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports unknown rather than guessing when an older server has no method', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => ({ ok: true,
      json: async () => ({ error: { code: -32601, message: 'Method not found' } }) }));
    const service = new EventEmitter();
    const { result } = renderHook(() => useClockState('http://fork.invalid', service, true));
    await act(flush); expect(result.current[0]).toBeNull(); expect(error).toHaveBeenCalledOnce();
  });

  it('bounds stalled status requests and leaves state unknown', async () => {
    vi.useFakeTimers(); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let signal!: AbortSignal;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      signal = init.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const service = new EventEmitter();
    const { result } = renderHook(() => useClockState('http://fork.invalid', service, true));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); await flush(); });
    expect(signal.aborted).toBe(true); expect(result.current[0]).toBeNull(); expect(error).toHaveBeenCalledOnce();
  });

  it('keeps a confirmed control event when a pre-mutation read finishes late', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', () => new Promise(resolve => { release = resolve; }));
    const service = new EventEmitter();
    const { result } = renderHook(() => useClockState('http://fork.invalid', service, true));
    await act(async () => {
      window.dispatchEvent(new CustomEvent('clockPauseStateChanged', { detail: { isPaused: false } }));
      release(reply({ paused: true })); await flush();
    });
    expect(result.current[0]).toBe(false);
  });

  it('aborts and detaches listeners on unmount', async () => {
    let signal!: AbortSignal;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal; return new Promise(() => {});
    });
    const service = new EventEmitter();
    const { unmount } = renderHook(() => useClockState('http://fork.invalid', service, true));
    unmount(); expect(signal.aborted).toBe(true);
    expect(service.listenerCount('connected')).toBe(0); expect(service.listenerCount('disconnected')).toBe(0);
  });
});
