'use client';

import { useEffect, useState } from 'react';

interface ClockConnection {
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

export function useClockState(rpcUrl: string, connection: ClockConnection, historical: boolean) {
  const [paused, setPaused] = useState<boolean | null>(historical ? null : false);

  useEffect(() => {
    let current = true;
    let request: AbortController | null = null;
    const invalidate = () => {
      request?.abort();
      request = null;
    };
    const refresh = async () => {
      invalidate();
      setPaused(null);
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'surfnet_getClockState', params: [] }),
        });
        const data = await response.json();
        if (!current || request !== controller) return;
        if (controller.signal.aborted) throw new Error('Surfnet clock state request timed out');
        if (!response.ok || typeof data.result?.paused !== 'boolean') {
          throw new Error(data.error?.message || 'Invalid Surfnet clock state');
        }
        setPaused(data.result.paused);
      } catch (error) {
        if (current && request === controller) {
          console.error('Unable to read Surfnet clock state:', error);
        }
      } finally {
        clearTimeout(timeout);
      }
    };
    const onPause = (event: Event) => {
      const value: unknown = (event as CustomEvent).detail?.isPaused;
      if (typeof value !== 'boolean') return;
      invalidate();
      setPaused(value);
    };
    const onDisconnected = () => { invalidate(); setPaused(null); };
    window.addEventListener('clockPauseStateChanged', onPause);
    if (historical) {
      void refresh();
      connection.on('connected', refresh);
      connection.on('disconnected', onDisconnected);
    } else {
      setPaused(false);
    }
    return () => {
      current = false;
      invalidate();
      window.removeEventListener('clockPauseStateChanged', onPause);
      connection.off('connected', refresh);
      connection.off('disconnected', onDisconnected);
    };
  }, [rpcUrl, connection, historical]);

  return [paused, setPaused] as const;
}
