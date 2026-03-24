import { describe, it, expect } from 'vitest';
import { SolanaWebSocketService } from './solana-websocket-service';

describe('SolanaWebSocketService.convertHttpToWebSocket', () => {
  it('converts http:// to ws://', () => {
    expect(SolanaWebSocketService.convertHttpToWebSocket('http://localhost:8899')).toBe('ws://localhost:8899');
  });

  it('converts https:// to wss://', () => {
    expect(SolanaWebSocketService.convertHttpToWebSocket('https://api.mainnet-beta.solana.com')).toBe(
      'wss://api.mainnet-beta.solana.com'
    );
  });

  it('returns ws:// URLs unchanged', () => {
    expect(SolanaWebSocketService.convertHttpToWebSocket('ws://localhost:8900')).toBe('ws://localhost:8900');
  });

  it('returns wss:// URLs unchanged', () => {
    expect(SolanaWebSocketService.convertHttpToWebSocket('wss://api.example.com')).toBe('wss://api.example.com');
  });

  it('adds ws:// prefix when no protocol specified', () => {
    expect(SolanaWebSocketService.convertHttpToWebSocket('localhost:8899')).toBe('ws://localhost:8899');
  });

  it('returns empty string unchanged', () => {
    expect(SolanaWebSocketService.convertHttpToWebSocket('')).toBe('');
  });

  it('preserves path and query params', () => {
    expect(SolanaWebSocketService.convertHttpToWebSocket('http://localhost:8899/ws?key=val')).toBe(
      'ws://localhost:8899/ws?key=val'
    );
  });
});
