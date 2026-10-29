import { useAppConfig } from '@/hooks/use-app-config';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfigProvider } from './config-context';

vi.mock('@surfpool/shared', () => ({ logger: { log: vi.fn() } }));
const normal = {
  rpc_url: 'http://127.0.0.1:19999',
  ws_url: 'ws://127.0.0.1:20000',
  rpc_datasource_url: 'https://example.invalid/mainnet',
  studio_url: 'http://127.0.0.1:18489',
};

function Status() {
  const config = useAppConfig();
  return <div data-testid="status">{JSON.stringify({ historical: config.historical, source: config.rpcDatasourceUrl })}</div>;
}

function mount(value: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => value })));
  render(<ConfigProvider><Status /></ConfigProvider>);
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('uses explicit metadata and never a current-tip datasource for historical mode', async () => {
  vi.stubEnv('NEXT_PUBLIC_RPC_DATASOURCE_URL', 'https://example.invalid/tip');
  mount({ ...normal, rpc_datasource_url: null, historical: { after: '413023260' } });
  expect(await screen.findByTestId('status')).toHaveTextContent('"historical":true');
  expect(screen.getByTestId('status')).toHaveTextContent('"source":null');
});

it('keeps legacy normal servers working without a historical field', async () => {
  mount(normal);
  expect(await screen.findByTestId('status')).toHaveTextContent('"historical":false');
  expect(screen.getByTestId('status')).toHaveTextContent(normal.rpc_datasource_url);
});

it('does not infer mode from a backend vendor name in a URL', async () => {
  mount({ ...normal, rpc_datasource_url: 'svm-replay://not-mode-metadata' });
  expect(await screen.findByTestId('status')).toHaveTextContent('"historical":false');
});

it.each([false, 3, [], {}, { after: 123 }, { after: '' }, { after: '  ' }].map(historical => ({ historical })))(
  'refuses malformed historical metadata without rendering connecting children: $historical',
  async ({ historical }) => {
    mount({ ...normal, historical });
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid historical Surfpool configuration');
    expect(screen.queryByTestId('status')).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  },
);

it('accepts an explicit null historical field as normal mode', async () => {
  mount({ ...normal, historical: null });
  expect(await screen.findByTestId('status')).toHaveTextContent('"historical":false');
});

for (const outcome of ['valid', 'invalid', 'unavailable', 'http-error', 'timeout']) {
  it(`keeps connecting consumers gated during configuration retry (${outcome})`, async () => {
    let finish!: (response: unknown) => void;
    let fail!: (error: Error) => void;
    const pending = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    const invalid = { ...normal, historical: { after: '' } };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => invalid })
      .mockImplementationOnce((_url: unknown, options?: RequestInit) => {
        options?.signal?.addEventListener('abort', () => fail(new DOMException('Aborted', 'AbortError')));
        return pending;
      })
      .mockResolvedValue({ ok: false, status: 503 }));
    const mounted: string[] = [];
    function Consumer() {
      const { rpcUrl, historical, rpcDatasourceUrl } = useAppConfig();
      useEffect(() => { mounted.push(rpcUrl); }, []);
      return <span data-testid="consumer">{JSON.stringify({ rpcUrl, historical, source: rpcDatasourceUrl })}</span>;
    }
    render(<ConfigProvider><Consumer /></ConfigProvider>);
    await screen.findByRole('alert');
    if (outcome === 'timeout') vi.useFakeTimers();
    fireEvent.click(screen.getByText('Retry configuration'));
    const mountedDuringRetry = [...mounted];
    const gatedDuringRetry = screen.queryByTestId('consumer') === null;
    await act(async () => {
      if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(10_000);
      else if (outcome === 'unavailable') fail(new Error('Server unavailable'));
      else if (outcome === 'http-error') finish({ ok: false, status: 503 });
      else finish({ ok: true, json: async () => outcome === 'valid'
        ? { ...normal, historical: { after: '413023260' } } : invalid });
    });
    expect(mountedDuringRetry).toEqual([]);
    expect(gatedDuringRetry).toBe(true);
    if (outcome === 'valid') {
      expect(screen.getByTestId('consumer')).toHaveTextContent(normal.rpc_url);
      expect(screen.getByTestId('consumer')).toHaveTextContent('"historical":true');
      expect(screen.getByTestId('consumer')).toHaveTextContent('"source":null');
      expect(mounted).toEqual([normal.rpc_url]);
    } else {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mounted).toEqual([]);
    }
  });
}

it('ignores an older valid retry while newer configuration remains pending', async () => {
  let older!: (response: unknown) => void;
  let latest!: (response: unknown) => void;
  const oldReply = new Promise(resolve => { older = resolve; });
  const newReply = new Promise(resolve => { latest = resolve; });
  const response = (rpc: string) => ({ ok: true, json: async () => ({
    ...normal, rpc_url: rpc, historical: { after: '413023260' },
  }) });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...normal, historical: {} }) })
    .mockReturnValueOnce(oldReply).mockReturnValueOnce(newReply));
  render(<ConfigProvider><Status /></ConfigProvider>);
  await screen.findByRole('alert');
  try {
    fireEvent.click(screen.getByText('Retry configuration'));
    fireEvent.click(screen.getByText('Retry configuration'));
    await act(async () => { older(response('http://old.invalid')); });
    expect(screen.queryByTestId('status')).not.toBeInTheDocument();
    await act(async () => { latest(response(normal.rpc_url)); });
    expect(screen.getByTestId('status')).toHaveTextContent('"historical":true');
    expect(screen.getByTestId('status')).toHaveTextContent('"source":null');
  } finally {
    await act(async () => { older(response('http://old.invalid')); latest(response(normal.rpc_url)); });
  }
});
