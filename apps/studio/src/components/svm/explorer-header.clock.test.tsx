import { EventEmitter } from 'events';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ service: null as any, refetch: vi.fn() }));
vi.mock('@/hooks/use-app-config', () => ({ useAppConfig: () => ({
  rpcUrl: 'http://fork.invalid', wsUrl: 'ws://fork.invalid', historical: true,
  rpcDatasourceUrl: null, loading: false, error: null, refetch: state.refetch,
}) }));
vi.mock('@/lib/solana-websocket-service', () => ({
  solanaWebSocketService: new Proxy({}, { get: (_target, key) => state.service[key].bind(state.service) }),
}));
vi.mock('@/components/svm/transaction-inspector', () => ({ default: () => null }));
vi.mock('./labeled-link', () => ({ LabeledLink: () => null }));
vi.mock('@surfpool/svm', async (original) => ({ ...await original<object>(), Faucet: () => null }));
vi.mock('@moneymq/react', () => ({ CheckoutModal: () => null, MoneyMQProvider: () => null }));
vi.mock('@surfpool/ui', () => ({ Dialog: () => null, DialogActions: () => null, DialogBody: () => null,
  DialogTitle: () => null, Listbox: () => null, ListboxOption: () => null, Switch: () => null }));
import ExplorerHeader from './explorer-header';

const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const reply = (result: unknown) => ({ ok: true, json: async () => ({ result }) }) as Response;
let paused: boolean;
let methods: string[];
let statusRead: (() => Promise<Response>) | undefined;

beforeEach(() => {
  state.service = new EventEmitter(); state.service.isConnected = () => true;
  paused = false; methods = []; statusRead = undefined;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const { method } = JSON.parse(init.body as string); methods.push(method);
    if (method === 'surfnet_getClockState') return statusRead ? statusRead() : reply({ paused });
    if (method === 'getEpochInfo') return reply({ epoch: 10, slotIndex: 20, slotsInEpoch: 1000 });
    if (method === 'surfnet_pauseClock' || method === 'surfnet_resumeClock') {
      paused = method === 'surfnet_pauseClock'; return reply({ epoch: 10 });
    }
    throw new Error(`Unexpected RPC ${method}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('historical clock controls', () => {
  it('reloads an already-running clock and pauses rather than resumes it', async () => {
    render(<ExplorerHeader />); await act(flush);
    expect(methods).toContain('surfnet_getClockState');
    expect(methods).not.toContain('surfnet_pauseClock');
    fireEvent.click(screen.getAllByTitle('Pause clock')[0]); await act(flush);
    expect(methods).toContain('surfnet_pauseClock');
    expect(methods).not.toContain('surfnet_resumeClock');
    expect(screen.getAllByTitle('Resume clock')).toHaveLength(2);
  });

  it('reads a frozen clock without changing it', async () => {
    paused = true; render(<ExplorerHeader />); await act(flush);
    expect(methods).toContain('surfnet_getClockState');
    expect(methods.filter(method => method.endsWith('Clock'))).toEqual([]);
    expect(screen.getAllByTitle('Resume clock')).toHaveLength(2);
  });

  it('rechecks actual pause state after reconnecting to a restarted fork', async () => {
    paused = true; render(<ExplorerHeader />); await act(flush);
    paused = false;
    await act(async () => { state.service.emit('disconnected'); state.service.emit('connected'); await flush(); });
    expect(screen.getAllByTitle('Pause clock')).toHaveLength(2);
  });

  it('does not guess or mutate the clock while its status is unknown', async () => {
    statusRead = () => new Promise(() => {});
    const view = render(<ExplorerHeader />); await act(flush);
    const button = view.container.querySelector('button[title*="clock state"]') as HTMLButtonElement;
    expect(button).not.toBeNull(); expect(button).toBeDisabled();
    fireEvent.click(button); await act(flush);
    expect(methods.filter(method => method.endsWith('Clock'))).toEqual([]);
  });

  it('rejects a late pre-reconnect pause reply', async () => {
    let release!: (response: Response) => void;
    statusRead = () => new Promise(resolve => { release = resolve; });
    render(<ExplorerHeader />); await act(flush);
    statusRead = undefined; paused = false;
    await act(async () => { state.service.emit('disconnected'); state.service.emit('connected'); await flush(); });
    await act(async () => { release(reply({ paused: true })); await flush(); });
    expect(screen.getAllByTitle('Pause clock')).toHaveLength(2);
  });
});
