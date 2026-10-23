import { EventEmitter } from 'events';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CompactSlotWidget from './compact-slot-widget';

class FakeService extends EventEmitter {
  async connect() {}
  async subscribeToSlots() {
    return 'slot';
  }
  isConnected() {
    return true;
  }
}

const epochInfo = (absoluteSlot: number) => ({
  epoch: Math.floor(absoluteSlot / 432000),
  slotIndex: absoluteSlot % 432000,
  slotsInEpoch: 432000,
  absoluteSlot,
});
const reply = (result: unknown) => ({ json: async () => ({ result }) });
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const reconnect = async (service: FakeService) => {
  await act(async () => {
    service.emit('disconnected');
    service.emit('connected');
    await flush();
  });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CompactSlotWidget', () => {
  it('re-reads the authoritative slot when a historical surfnet reconnects', async () => {
    let current = 413023262;
    vi.stubGlobal('fetch', async () => reply(epochInfo(current)));
    const service = new FakeService();
    render(<CompactSlotWidget rpcUrl="http://fork.invalid" wsUrl="ws://fork.invalid" solanaWebSocketService={service} historical />);
    await act(flush);
    expect(screen.getByText('413,023,262')).toBeInTheDocument();
    // A restarted frozen fork is back at its boundary and sends no slot until it advances.
    current = 413023261;
    await reconnect(service);
    expect(screen.getByText('413,023,261')).toBeInTheDocument();
  });

  it('keeps a slot notification that is newer than a pending epoch reply', async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => (release = resolve));
    let calls = 0;
    vi.stubGlobal('fetch', async () => (++calls === 1 ? reply(epochInfo(413023261)) : pending));
    const service = new FakeService();
    render(<CompactSlotWidget rpcUrl="http://fork.invalid" wsUrl="ws://fork.invalid" solanaWebSocketService={service} historical />);
    await act(flush);
    await reconnect(service);
    await act(async () => {
      service.emit('slot', { slot: 413023263, parent: 413023262, root: 413023262 });
      await flush();
    });
    await act(async () => {
      release(reply(epochInfo(413023262)));
      await flush();
    });
    expect(screen.getByText('413,023,263')).toBeInTheDocument();
  });

  it('leaves normal mode relative and without reconnect reads', async () => {
    const fetch = vi.fn(async () => reply(epochInfo(413023261)));
    vi.stubGlobal('fetch', fetch);
    const service = new FakeService();
    render(<CompactSlotWidget rpcUrl="http://local.invalid" wsUrl="ws://local.invalid" solanaWebSocketService={service} />);
    await act(flush);
    expect(screen.getByText((413023261 % 432000).toLocaleString())).toBeInTheDocument();
    await reconnect(service);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
