import { useAppConfig } from '@/hooks/use-app-config';
import { cleanup, render, screen } from '@testing-library/react';
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

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
