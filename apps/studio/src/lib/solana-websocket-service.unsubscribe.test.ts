import { afterEach, expect, it, vi } from 'vitest';
import { SolanaWebSocketService } from './solana-websocket-service';

afterEach(() => vi.unstubAllGlobals());

it('cancels one late subscription without unsubscribing other consumers', () => {
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  const service = new SolanaWebSocketService();
  const send = vi.fn();
  const state = service as any;
  state.ws = { readyState: 1, send };
  state.subscriptions.set('late', { id: 'late' });
  state.subscriptions.set('other', { id: 'other' });
  service.unsubscribe('late', 'transaction');
  expect(state.subscriptions.has('late')).toBe(false);
  expect(state.subscriptions.has('other')).toBe(true);
  expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
    method: 'logsUnsubscribe', params: ['late'],
  });
});
