import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompactSlotWidget from './compact-slot-widget';

vi.mock('@surfpool/shared', () => ({ logger: { log: vi.fn() } }));
class Service extends EventEmitter {
  connect = vi.fn(async () => {});
  subscribeToSlots = vi.fn(async () => 'slots');
  isConnected = () => true;
}
function deferred<T = Response>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const info = (epoch: number, absoluteSlot: number, slotIndex: number, slotsInEpoch: number) =>
  ({ epoch, absoluteSlot, slotIndex, slotsInEpoch });
const reply = (result: ReturnType<typeof info>) => ({ json: async () => ({ result }) }) as Response;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let service: Service;
let fetcher: ReturnType<typeof vi.fn>;
function mount(historical = true) {
  const view = render(<CompactSlotWidget rpcUrl="http://fork.invalid" wsUrl="ws://fork.invalid"
    solanaWebSocketService={service} historical={historical} />);
  const label = (name: string) => Number([...view.container.querySelectorAll('span')]
    .find(span => span.textContent === name)!.nextElementSibling!.textContent!.replaceAll(',', ''));
  return { ...view, slot: () => label('Slot'), epoch: () => label('Epoch') };
}
async function notify(slot: number) {
  await act(async () => { service.emit('slot', { slot, parent: slot - 1 }); await flush(); });
}
beforeEach(() => {
  vi.useFakeTimers(); service = new Service();
  fetcher = vi.fn(async () => reply(info(10, 10020, 20, 1000)));
  vi.stubGlobal('fetch', (url: string, init: RequestInit) =>
    JSON.parse(init.body as string).method === 'surfnet_getClockState'
      ? Promise.resolve({ ok: true, json: async () => ({ result: { paused: true } }) })
      : fetcher(url, init));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('historical epoch range refresh', () => {
  it('keeps absolute slots when a time-travel event contains an epoch-relative slotIndex', async () => {
    const view = mount(); await act(flush);
    fetcher.mockResolvedValue(reply(info(11, 11000, 0, 1000)));
    await act(async () => {
      window.dispatchEvent(new CustomEvent('epochChanged', { detail: info(11, 11000, 0, 1000) }));
      await flush();
    });
    expect(view.slot()).toBe(11000); expect(view.epoch()).toBe(11);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not let an older time-travel response overwrite a newer warp', async () => {
    const pending = deferred();
    const view = mount(); await act(flush);
    fetcher.mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(reply(info(12, 12000, 0, 1000)));
    await act(async () => {
      window.dispatchEvent(new CustomEvent('epochChanged', { detail: { epoch: 11, slotIndex: 0 } }));
      await flush();
      window.dispatchEvent(new CustomEvent('epochChanged', { detail: { epoch: 12, slotIndex: 0 } }));
      await flush();
    });
    await act(async () => { pending.resolve(reply(info(11, 11000, 0, 1000))); await flush(); });
    expect(view.slot()).toBe(12000); expect(view.epoch()).toBe(12);
  });

  it('refreshes the epoch when a real c4-style warp leaves its authoritative range', async () => {
    const initial = info(956, 413023261, 31261, 432000);
    const next = initial.absoluteSlot - initial.slotIndex + initial.slotsInEpoch;
    fetcher.mockResolvedValueOnce(reply(initial)).mockResolvedValue(reply(info(initial.epoch + 1, next, 0, initial.slotsInEpoch)));
    const view = mount(); await act(flush); expect(view.epoch()).toBe(initial.epoch);
    await notify(next);
    expect(view.slot()).toBe(next); expect(view.epoch()).toBe(initial.epoch + 1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses non-aligned warmup range metadata and does not refetch within that range', async () => {
    fetcher.mockResolvedValueOnce(reply(info(2, 150, 54, 128))).mockResolvedValue(reply(info(3, 224, 0, 256)));
    const view = mount(); await act(flush);
    for (const slot of [151, 180, 223]) await notify(slot);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(view.epoch()).toBe(2);
    await notify(224); expect(view.epoch()).toBe(3);
    await notify(300); expect(fetcher).toHaveBeenCalledTimes(2); expect(view.slot()).toBe(300);
  });

  it('refreshes backward to the authoritative epoch after a historical reset', async () => {
    fetcher.mockResolvedValueOnce(reply(info(11, 11020, 20, 1000)))
      .mockResolvedValue(reply(info(10, 10020, 20, 1000)));
    const view = mount(); await act(flush); expect(view.epoch()).toBe(11);
    await notify(10020);
    expect(view.slot()).toBe(10020); expect(view.epoch()).toBe(10);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('coalesces a pending notification storm and retains the newer observed slot', async () => {
    const pending = deferred();
    const view = mount(); await act(flush); fetcher.mockImplementationOnce(() => pending.promise);
    for (const slot of [11000, 11001, 11003, 11005]) await notify(slot);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { pending.resolve(reply(info(11, 11000, 0, 1000))); await flush(); });
    expect(view.epoch()).toBe(11); expect(view.slot()).toBe(11005);
    await notify(11006); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects epoch metadata for an older notification and makes one follow-up read', async () => {
    const older = deferred(), newest = deferred();
    const view = mount(); await act(flush);
    fetcher.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newest.promise);
    await notify(11000); await notify(12000);
    await act(async () => { older.resolve(reply(info(11, 11000, 0, 1000))); await flush(); });
    expect(view.epoch()).toBe(10); expect(view.slot()).toBe(12000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => { newest.resolve(reply(info(12, 12000, 0, 1000))); await flush(); });
    expect(view.epoch()).toBe(12); expect(view.slot()).toBe(12000);
  });

  it('keeps reconnect authority when a pre-reconnect crossing reply arrives late', async () => {
    const old = deferred(); const view = mount(); await act(flush);
    fetcher.mockImplementationOnce(() => old.promise).mockResolvedValueOnce(reply(info(12, 12000, 0, 1000)));
    await notify(11000);
    await act(async () => { service.emit('disconnected'); service.emit('connected'); await flush(); });
    expect(view.epoch()).toBe(12); expect(view.slot()).toBe(12000);
    await act(async () => { old.resolve(reply(info(11, 11000, 0, 1000))); await flush(); });
    expect(view.epoch()).toBe(12); expect(view.slot()).toBe(12000);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('aborts a pending crossing read on unmount and never follows it up', async () => {
    const pending = deferred(); const view = mount(); await act(flush);
    fetcher.mockImplementationOnce(() => pending.promise); await notify(11000); await notify(12000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const signal = fetcher.mock.calls[1][1].signal as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(reply(info(11, 11000, 0, 1000))); await flush(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not add epoch-refresh calls or absolute display to normal slot notifications', async () => {
    const view = mount(false); await act(flush); await notify(11000);
    expect(view.slot()).toBe(999); expect(view.epoch()).toBe(10);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
