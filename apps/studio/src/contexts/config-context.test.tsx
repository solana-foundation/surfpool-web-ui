import { useAppConfig } from '@/hooks/use-app-config';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfigProvider } from './config-context';

vi.mock('@surfpool/shared', () => ({ logger: { log: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('holds consumers until configured endpoints are available', async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(resolved => { resolve = resolved; });
  vi.stubGlobal('fetch', vi.fn(() => pending));
  const mounted: string[] = [];
  function Consumer() {
    const { rpcUrl } = useAppConfig();
    useEffect(() => { mounted.push(rpcUrl); }, []);
    return <span data-testid="consumer">{rpcUrl}</span>;
  }
  render(<ConfigProvider><Consumer /></ConfigProvider>);
  expect(mounted).toEqual([]);
  expect(screen.queryByTestId('consumer')).not.toBeInTheDocument();
  await act(async () => resolve({ ok: true, json: async () => ({
    rpc_url: 'http://127.0.0.1:29111', ws_url: 'ws://127.0.0.1:29112',
    rpc_datasource_url: 'https://example.invalid', studio_url: 'http://127.0.0.1:29113',
  }) }));
  expect(await screen.findByTestId('consumer')).toHaveTextContent('29111');
  expect(mounted).toEqual(['http://127.0.0.1:29111']);
});

it('surfaces configuration failure before mounting the existing default path', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
  const mounted: Array<string | null> = [];
  function Consumer() {
    const { error } = useAppConfig();
    useEffect(() => { mounted.push(error); }, []);
    return <span data-testid="consumer">{error}</span>;
  }
  render(<ConfigProvider><Consumer /></ConfigProvider>);
  expect(await screen.findByTestId('consumer')).toHaveTextContent('Failed to fetch config');
  expect(mounted).toHaveLength(1);
  expect(mounted[0]).toContain('503');
  expect(console.error).toHaveBeenCalled();
});
