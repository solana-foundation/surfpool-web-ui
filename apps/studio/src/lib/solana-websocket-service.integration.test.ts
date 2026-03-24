import { describe, it, expect, afterEach } from 'vitest';
import { SolanaWebSocketService } from './solana-websocket-service';

const RPC_URL = process.env.SURFPOOL_RPC_URL || 'http://127.0.0.1:8899';
const WS_URL = SolanaWebSocketService.convertHttpToWebSocket(
  process.env.SURFPOOL_WS_URL || 'ws://127.0.0.1:8900'
);

describe('Surfpool RPC integration', () => {
  it('getHealth returns a response', async () => {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
    });
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.jsonrpc).toBe('2.0');
  });

  it('getEpochInfo returns epoch data', async () => {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getEpochInfo' }),
    });
    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(typeof data.result.epoch).toBe('number');
    expect(typeof data.result.absoluteSlot).toBe('number');
  });

  it('getSlot returns a slot number', async () => {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
    });
    const data = await response.json();
    expect(typeof data.result).toBe('number');
    expect(data.result).toBeGreaterThanOrEqual(0);
  });
});

describe('Surfpool config endpoint integration', () => {
  it('returns config with expected shape', async () => {
    const studioUrl = process.env.SURFPOOL_STUDIO_URL || 'http://127.0.0.1:18488';
    const response = await fetch(`${studioUrl}/config`);
    expect(response.ok).toBe(true);
    const config = await response.json();
    expect(config).toHaveProperty('rpc_url');
    expect(config).toHaveProperty('ws_url');
    expect(config).toHaveProperty('rpc_datasource_url');
    expect(config).toHaveProperty('studio_url');
  });
});

describe('Surfpool WebSocket integration', () => {
  let service: SolanaWebSocketService;

  afterEach(() => {
    service?.disconnect();
  });

  it('connects to WebSocket endpoint', async () => {
    service = new SolanaWebSocketService();
    await service.connect(WS_URL);
    expect(service.isConnected()).toBe(true);
    expect(service.getConnectionStatus()).toBe('connected');
  });

  it('subscribes to slot notifications and receives at least one', async () => {
    service = new SolanaWebSocketService();
    await service.connect(WS_URL);

    const slotPromise = new Promise<any>((resolve) => {
      service.on('slot', (data) => resolve(data));
    });

    await service.subscribeToSlots();

    const slotData = await Promise.race([
      slotPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timed out waiting for slot notification')), 15000)
      ),
    ]);

    expect(slotData).toBeDefined();
  });
});
