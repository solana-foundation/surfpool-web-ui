import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SolanaWebSocketService } from './solana-websocket-service';
import { logger } from '@surfpool/shared';

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  close(code = 1000, reason = '') {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
  sent: string[] = [];
  send(message: string) { this.sent.push(message); }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function droppedService() {
  const service = new SolanaWebSocketService();
  const connected = service.connect('ws://fork.invalid');
  FakeSocket.instances[0].open();
  await connected;
  FakeSocket.instances[0].close(1006);
  return service;
}

describe('SolanaWebSocketService', () => {
  it('reports manual disconnect once even when the browser closes asynchronously', async () => {
    const service = new SolanaWebSocketService();
    const connected = service.connect('ws://fork.invalid');
    const socket = FakeSocket.instances[0];
    socket.open();
    await connected;
    socket.close = (code = 1000, reason = '') => {
      socket.readyState = FakeSocket.CLOSING;
      setTimeout(() => {
        socket.readyState = FakeSocket.CLOSED;
        socket.onclose?.({ code, reason });
      }, 0);
    };
    const disconnected = vi.fn();
    service.on('disconnected', disconnected);
    service.disconnect();
    expect(disconnected).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('does not send dead subscription IDs to a replacement connection', async () => {
    const service = new SolanaWebSocketService();
    const connected = service.connect('ws://fork.invalid');
    const first = FakeSocket.instances[0];
    first.open();
    await connected;
    const subscribe = async (socket: FakeSocket, id: number) => {
      const pending = service.subscribeToTransactions();
      const request = JSON.parse(socket.sent.at(-1)!);
      socket.onmessage?.({ data: JSON.stringify({ id: request.id, result: id }) });
      await pending;
    };
    await subscribe(first, 11);
    first.close(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    const replacement = FakeSocket.instances[1];
    replacement.open();
    await subscribe(replacement, 22);
    service.unsubscribeAll();
    expect(replacement.sent.map(message => JSON.parse(message))
      .filter(message => message.method === 'logsUnsubscribe')
      .map(message => message.params)).toEqual([[22]]);
    service.disconnect();
  });

  it('logs socket errors and failed retries even without debug logging', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const service = new SolanaWebSocketService();
    const connected = service.connect('ws://fork.invalid');
    const failed = connected.catch(error => error);
    const error = new Error('socket refused');
    FakeSocket.instances[0].onerror?.(error);
    await failed;
    expect(logged).toHaveBeenCalledWith('❌ WebSocket error:', error);
    FakeSocket.instances[0].close(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    FakeSocket.instances[1].onerror?.(error);
    await Promise.resolve();
    expect(logged).toHaveBeenCalledWith('🔄 Reconnection failed:', error);
    service.disconnect();
  });

  it('ignores an asynchronously closing socket after a replacement starts', async () => {
    const service = new SolanaWebSocketService();
    const first = service.connect('ws://first.invalid');
    const old = FakeSocket.instances[0];
    old.open();
    await first;
    old.close = () => {
      old.readyState = FakeSocket.CLOSING;
      setTimeout(() => {
        old.readyState = FakeSocket.CLOSED;
        old.onclose?.({ code: 1000, reason: 'Manual disconnect' });
      }, 0);
    };
    service.disconnect();
    const connected = service.connect('ws://replacement.invalid');
    const replacement = FakeSocket.instances[1];
    const disconnected = vi.fn();
    service.on('disconnected', disconnected);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(service.isConnectionInProgress()).toBe(true);
      expect(disconnected).not.toHaveBeenCalled();
    } finally {
      replacement.open();
      await connected;
      service.disconnect();
    }
  });

  it('ignores messages and open/error events from an obsolete socket', async () => {
    const service = new SolanaWebSocketService();
    const first = service.connect('ws://first.invalid');
    const old = FakeSocket.instances[0];
    old.open();
    await first;
    service.disconnect();
    const connected = service.connect('ws://replacement.invalid');
    const replacement = FakeSocket.instances[1];
    const opened = vi.fn(), errors = vi.fn(), slots = vi.fn();
    service.on('connected', opened).on('error', errors).on('slot', slots);
    try {
      old.onopen?.();
      old.onerror?.(new Error('obsolete socket'));
      old.onmessage?.({ data: JSON.stringify({ method: 'slotNotification', params: { result: { slot: 1 } } }) });
      expect(service.isConnectionInProgress()).toBe(true);
      expect(opened).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(slots).not.toHaveBeenCalled();
    } finally {
      replacement.open();
      await connected;
      service.disconnect();
    }
  });

  it('reconnects after the server closes normally during a restart', async () => {
    const service = new SolanaWebSocketService();
    const connected = service.connect('ws://fork.invalid');
    FakeSocket.instances[0].open();
    await connected;
    FakeSocket.instances[0].close(1000, 'server shutdown');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].open();
    await Promise.resolve();
    service.disconnect();
  });

  it('cancels a pending reconnect when the owner disconnects', async () => {
    const service = await droppedService();
    service.disconnect();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('ignores a delayed abnormal close after a manual disconnect', async () => {
    const service = await droppedService();
    service.disconnect();
    FakeSocket.instances[0].close(1006);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('can explicitly connect again after a manual disconnect', async () => {
    const service = await droppedService();
    service.disconnect();
    const connected = service.connect('ws://replacement.invalid');
    FakeSocket.instances[1].open();
    await connected;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(service.isConnected()).toBe(true);
  });

  it('reconnects after an abnormal close, past the old five attempts', async () => {
    await droppedService();
    for (let attempt = 1; attempt <= 7; attempt++) {
      await vi.advanceTimersByTimeAsync(Math.min(1_000 * attempt, 5_000));
      expect(FakeSocket.instances).toHaveLength(attempt + 1);
      FakeSocket.instances[attempt].close(1006);
    }
  });
});
