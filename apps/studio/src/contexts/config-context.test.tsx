import { useAppConfig } from '@/hooks/use-app-config';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfigProvider, useConfig } from './config-context';

vi.mock('@surfpool/shared', () => ({ logger: { log: vi.fn() } }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

it('keeps an already mounted dashboard and its edits during recovery', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let finish!: (value: unknown) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockReturnValue(pending));
  function Consumer() {
    const { refetch } = useConfig();
    return <><input aria-label="draft" defaultValue="" /><button onClick={refetch}>Refresh</button></>;
  }
  render(<ConfigProvider><Consumer /></ConfigProvider>);
  const input = await screen.findByLabelText('draft');
  fireEvent.change(input, { target: { value: 'unsaved edit' } });
  fireEvent.click(screen.getByText('Refresh'));
  expect(screen.queryByLabelText('draft')).toBe(input);
  expect(input).toHaveValue('unsaved edit');
  await act(async () => finish({ ok: false, status: 503 }));
  expect(screen.getByLabelText('draft')).toBe(input);
});

it('keeps a valid dashboard and its edits mounted during configuration refresh', async () => {
  let finish!: (response: unknown) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  const configured = { ok: true, json: async () => ({
    rpc_url: 'http://127.0.0.1:29111', ws_url: 'ws://127.0.0.1:29112',
    rpc_datasource_url: null, studio_url: 'http://127.0.0.1:29113',
  }) };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(configured).mockReturnValueOnce(pending));
  function Consumer() {
    const { refetch } = useConfig();
    return <><input aria-label="draft" /><button onClick={refetch}>Refresh</button></>;
  }
  render(<ConfigProvider><Consumer /></ConfigProvider>);
  const input = await screen.findByLabelText('draft');
  fireEvent.change(input, { target: { value: 'unsaved edit' } });
  fireEvent.click(screen.getByText('Refresh'));
  expect(screen.getByLabelText('draft')).toBe(input);
  await act(async () => { finish(configured); });
  expect(screen.getByLabelText('draft')).toBe(input);
  expect(input).toHaveValue('unsaved edit');
});

for (const fallback of [false, true]) {
  it(`bounds a stalled ${fallback ? 'fallback' : 'local'} configuration fetch`, async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stalled = vi.fn((_url: unknown, options?: RequestInit) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const fetch = vi.fn(stalled);
    if (fallback) fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetch);
    function Consumer() {
      const { error } = useConfig();
      return <span data-testid="config-error">{error}</span>;
    }
    render(<ConfigProvider><Consumer /></ConfigProvider>);
    const loading = screen.queryByRole('status');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.queryByTestId('config-error')).toHaveTextContent(/timed out/i);
    expect(loading).toHaveTextContent(/loading/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
}
