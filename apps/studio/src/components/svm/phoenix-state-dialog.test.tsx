import {
  createPhoenixCollateralLiquidationScenario,
  createPhoenixMaintenanceMarginScenario,
  createPhoenixMarketMoveScenario,
  createPhoenixOraclePriceScenario,
  fetchDynamicRefOptions,
  fetchPhoenixTraderPositions,
  type DynamicRefOption,
  type PhoenixTraderPosition,
  type PhoenixTraderPositions,
} from '@/lib/scenarios-api';
import { comboboxResults } from '@/test-utils';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhoenixStateDialog from './phoenix-state-dialog';

vi.mock('@/lib/scenarios-api', () => ({
  createPhoenixCollateralLiquidationScenario: vi.fn(),
  createPhoenixMaintenanceMarginScenario: vi.fn(),
  createPhoenixMarketMoveScenario: vi.fn(),
  createPhoenixOraclePriceScenario: vi.fn(),
  fetchDynamicRefOptions: vi.fn(),
  fetchPhoenixTraderPositions: vi.fn(),
}));

vi.mock('@surfpool/ui', async () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Checkbox: ({ checked, onChange, color, ...props }: any) => {
    const handleChange = (event: any) => onChange(event.target.checked);

    return <input type="checkbox" checked={checked} onChange={handleChange} {...props} />;
  },
  CheckboxField: ({ children }: any) => <label>{children}</label>,
  CheckboxGroup: ({ children }: any) => <div>{children}</div>,
  Description: ({ children }: any) => <span>{children}</span>,
  Label: ({ children }: any) => <span>{children}</span>,
  Combobox: (await import('@/test-utils')).MockCombobox,
  ComboboxDescription: ({ children }: any) => <span>{children}</span>,
  ComboboxLabel: ({ children }: any) => <span>{children}</span>,
  ComboboxOption: ({ children }: any) => <div>{children}</div>,
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogActions: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  Listbox: ({ children, onChange, ...props }: any) => {
    const handleChange = (event: any) => onChange(event.target.value);

    return (
      <select {...props} onChange={handleChange}>
        {children}
      </select>
    );
  },
  ListboxOption: ({ children, ...props }: any) => <option {...props}>{children}</option>,
  Input: (props: any) => <input {...props} />,
}));

const createMarketMoveMock = vi.mocked(createPhoenixMarketMoveScenario);
const fetchSymbolsMock = vi.mocked(fetchDynamicRefOptions);

const markets = (...symbols: string[]): DynamicRefOption[] =>
  symbols.map((value) => ({ value, address: `${value}Orderbook1111111111111111111111111` }));

const TRADER = 'HB66UQf7Bv82q9VPhg9Hz6RcDaTMY1yJm8KVDA8VG7Gp';

const position = (symbol: string, side: 'long' | 'short', baseLots: string): PhoenixTraderPosition => ({
  symbol,
  orderbook: `${symbol}Orderbook1111111111111111111111111`,
  side,
  baseLots,
  maintenanceMarginQuoteLots: '1000000',
});

const OTHER_TRADER = 'AvPTRe4XjC1xdVhwzUiVwDDfqrqm6eVaKMAnS39raEjW';

const traderPositions = (trader: string, hot = false, liquidatable = false): PhoenixTraderPositions => ({
  trader,
  positions: [position('SOL', 'long', '100')],
  hot,
  margin: {
    collateral: '1',
    effectiveCollateral: '-7',
    maintenanceMargin: '900',
    backstopMargin: '601',
    highRiskMargin: '300',
    liquidatable,
  },
});

const afterMoves = (trader: string, effectiveCollateral: string) => ({
  marginAfterMoves: {
    ...traderPositions(trader).margin,
    effectiveCollateral,
    maintenanceMargin: '1000',
    backstopMargin: '700',
  },
});

const chooseTraders = (traders: string) => {
  fireEvent.change(screen.getByLabelText('State goal'), { target: { value: 'collateral-liquidation' } });
  fireEvent.change(screen.getByLabelText('Phoenix Trader accounts'), { target: { value: traders } });
};

const renderDialog = (onCreated = vi.fn()) =>
  render(
    <PhoenixStateDialog open studioUrl="http://studio" rpcUrl="http://rpc" onClose={vi.fn()} onCreated={onCreated} />
  );

beforeEach(() => {
  fetchSymbolsMock.mockResolvedValue(markets('BTC', 'SOL'));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PhoenixStateDialog', () => {
  it('keeps invalid exact tick inputs out of the backend', async () => {
    renderDialog();

    await screen.findByRole('button', { name: 'BTC' });
    // Not a whole number, a zero mark, and one past u32::MAX.
    for (const invalid of ['80.5', '0', '4294967296']) {
      fireEvent.change(screen.getByLabelText('Target price'), { target: { value: invalid } });
      expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
      fireEvent.submit(screen.getByRole('button', { name: 'Create scenario' }).closest('form')!);
    }
    expect(createMarketMoveMock).not.toHaveBeenCalled();
  });

  it('checks every trader address and gives each trader the collateral of the chosen depth', async () => {
    const createMock = vi.mocked(createPhoenixCollateralLiquidationScenario);
    createMock.mockResolvedValue({ id: 'collateral' });
    vi.mocked(fetchPhoenixTraderPositions).mockImplementation(async (_studio, _rpc, trader) =>
      traderPositions(trader, trader === TRADER)
    );
    renderDialog();

    await screen.findByRole('button', { name: 'BTC' });
    chooseTraders(`${TRADER}, ${TRADER}.`);
    expect(screen.queryByLabelText('Phoenix market')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(`Not a valid Solana address: ${TRADER}.`);
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
    chooseTraders(`${TRADER},${OTHER_TRADER} ${TRADER}`);
    fireEvent.change(screen.getByLabelText('Liquidation depth'), { target: { value: 'every-position' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    // (highRiskMargin + backstopMargin) / 2, rounded toward zero
    const prepared = (trader: string) => expect.objectContaining({ trader, collateral: '450' });
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('http://studio', [prepared(TRADER), prepared(OTHER_TRADER)], undefined)
    );
  });

  it('moves each market against its larger side and sets the collateral that crosses after the move', async () => {
    const createMock = vi.mocked(createPhoenixCollateralLiquidationScenario);
    createMock.mockResolvedValue({ id: 'price-move' });
    fetchSymbolsMock.mockResolvedValue([
      { value: 'BTC', markTicks: 85957 },
      { value: 'SOL', markTicks: 10000 },
    ]);
    // SOL: $300 of long margin against $500 of short, so it rises 2%; BTC holds only a long, so it drops 2%.
    const held = (symbol: string, side: 'long' | 'short', margin: string) => ({
      ...position(symbol, side, '100'),
      maintenanceMarginQuoteLots: margin,
    });
    vi.mocked(fetchPhoenixTraderPositions).mockImplementation(async (_studio, _rpc, trader, moves) => ({
      ...traderPositions(trader),
      positions:
        trader === TRADER
          ? [held('SOL', 'long', '300000000'), held('BTC', 'long', '50000000')]
          : [held('SOL', 'short', '500000000')],
      ...(moves && afterMoves(trader, '-500')),
    }));
    renderDialog();

    await screen.findByRole('button', { name: 'SOL' });
    chooseTraders(`${TRADER} ${OTHER_TRADER}`);
    fireEvent.change(screen.getByLabelText('Liquidation depth'), { target: { value: 'after-price-move' } });
    expect(screen.getByLabelText('Price move')).toHaveValue('2');
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    const moves = [
      { symbol: 'SOL', targetTicks: '10200' },
      { symbol: 'BTC', targetTicks: '84238' },
    ];
    // effectiveCollateral before the moves - after them + (backstopMargin + maintenanceMargin) / 2 after them
    const prepared = (trader: string) => expect.objectContaining({ trader, collateral: '1343' });
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('http://studio', [prepared(TRADER), prepared(OTHER_TRADER)], moves)
    );
    const loadedMoves = vi.mocked(fetchPhoenixTraderPositions).mock.calls.map((call) => call[3]);
    expect(loadedMoves).toEqual([undefined, undefined, moves, moves]);
  });

  it('explains which way the price moves and names a percent outside 0 to 100', async () => {
    renderDialog();

    await screen.findByRole('button', { name: 'SOL' });
    chooseTraders(TRADER);
    fireEvent.change(screen.getByLabelText('Liquidation depth'), { target: { value: 'after-price-move' } });
    expect(screen.getByText(/down for longs, up for shorts/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Price move'), { target: { value: '-5' } });
    expect(screen.getByText('Enter a percent above 0 and below 100.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Price move'), { target: { value: '5' } });
    expect(screen.queryByText('Enter a percent above 0 and below 100.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeEnabled();
  });

  // Collateral at the middle of the band after the move would leave the trader unhealthy before it, so the
  // collateral moves up to the middle of the part of the band that keeps the trader healthy until the move.
  it('keeps the trader healthy until the move when the middle of the band would not', async () => {
    const createMock = vi.mocked(createPhoenixCollateralLiquidationScenario);
    createMock.mockResolvedValue({ id: 'price-move' });
    fetchSymbolsMock.mockResolvedValue([{ value: 'SOL', markTicks: 10000 }]);
    vi.mocked(fetchPhoenixTraderPositions).mockImplementation(async (_studio, _rpc, trader, moves) => ({
      ...traderPositions(trader),
      ...(moves && afterMoves(trader, '0')),
    }));
    renderDialog();

    await screen.findByRole('button', { name: 'SOL' });
    chooseTraders(TRADER);
    fireEvent.change(screen.getByLabelText('Liquidation depth'), { target: { value: 'after-price-move' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    // Healthy before the move from 908 after it, liquidatable below 1000: the middle is 954, 947 before the move.
    const prepared = expect.objectContaining({ trader: TRADER, collateral: '947' });
    await waitFor(() => expect(createMock).toHaveBeenCalledWith('http://studio', [prepared], expect.any(Array)));
  });

  // A move too small to cross leaves no collateral both healthy before it and liquidatable after it; one that
  // helps the trader never crosses.
  it.each([
    ['92', `${TRADER} would not stay healthy until the move.`],
    ['400', `The move does not push ${TRADER} toward liquidation.`],
  ])('refuses a trader the move cannot cross (effective %s after it)', async (effective, message) => {
    fetchSymbolsMock.mockResolvedValue([{ value: 'SOL', markTicks: 10000 }]);
    vi.mocked(fetchPhoenixTraderPositions).mockImplementation(async (_studio, _rpc, trader, moves) => ({
      ...traderPositions(trader),
      ...(moves && afterMoves(trader, effective)),
    }));
    renderDialog();

    await screen.findByRole('button', { name: 'SOL' });
    chooseTraders(TRADER);
    fireEvent.change(screen.getByLabelText('Liquidation depth'), { target: { value: 'after-price-move' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(createPhoenixCollateralLiquidationScenario).not.toHaveBeenCalled();
  });

  it('names the traders that hold no positions or that the template refuses, and creates nothing', async () => {
    const refusal = `${OTHER_TRADER} quotes splines on 2 markets`;
    vi.mocked(fetchPhoenixTraderPositions).mockImplementation(async (_studio, _rpc, trader) =>
      trader === TRADER ? { ...traderPositions(trader), positions: [] } : { ...traderPositions(trader), refusal }
    );
    renderDialog();

    await screen.findByRole('button', { name: 'BTC' });
    chooseTraders(`${TRADER} ${OTHER_TRADER}`);
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    expect(await screen.findByText(`${TRADER} holds no open Phoenix positions; ${refusal}.`)).toBeInTheDocument();
    expect(createPhoenixCollateralLiquidationScenario).not.toHaveBeenCalled();
  });

  it('surfaces backend validation failures', async () => {
    createMarketMoveMock.mockRejectedValue(new Error('Phoenix PerpAssetMap account not found'));
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'SOL' }));
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '80000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    expect(await screen.findByText('Phoenix PerpAssetMap account not found')).toBeInTheDocument();
  });

  it('picks a listed market typed by its symbol in any case or by its orderbook address', async () => {
    const amat = 'AvPTRe4XjC1xdVhwzUiVwDDfqrqm6eVaKMAnS39raEjW';
    const unlisted = '6tgCsPZqZi4rcQWLLgoMHE1XAnRqA7mYYRByGUYxyFwB';
    fetchSymbolsMock.mockResolvedValue([
      { value: 'AMAT', address: amat },
      { value: 'AMD', address: 'ABBz13DENxvLRLh6pjHxNsxBPNNbEnfiMPPXrx8sK7qN' },
    ]);
    createMarketMoveMock.mockResolvedValue({ id: 'amat' });
    renderDialog();

    await screen.findByRole('button', { name: 'AMD' });
    const search = screen.getByLabelText('Phoenix market');
    expect(search).toHaveValue('AMAT');
    fireEvent.change(search, { target: { value: amat } });
    expect(comboboxResults('Phoenix market')).toEqual(['AMAT']);
    fireEvent.change(search, { target: { value: 'amat' } });
    expect(comboboxResults('Phoenix market')).toEqual(['AMAT']);
    fireEvent.change(search, { target: { value: unlisted } });
    expect(comboboxResults('Phoenix market')).toEqual([unlisted]);
    expect(screen.getByText('Custom symbol')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: amat } });
    fireEvent.click(screen.getByRole('button', { name: 'AMAT' }));
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '31350' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => {
      expect(createMarketMoveMock).toHaveBeenCalledWith('http://studio', 'AMAT', '31350');
    });
  });

  it('keeps a custom market when the dialog is closed and reopened', async () => {
    createMarketMoveMock.mockResolvedValue({ id: 'custom' });
    const dialog = (open: boolean) => (
      <PhoenixStateDialog
        open={open}
        studioUrl="http://studio"
        rpcUrl="http://rpc"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    const { rerender } = render(dialog(true));

    await screen.findByRole('button', { name: 'BTC' });
    fireEvent.change(screen.getByLabelText('Phoenix market'), { target: { value: 'XYZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'XYZ' }));
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '1000' } });
    rerender(dialog(false));
    rerender(dialog(true));
    await screen.findByRole('button', { name: 'BTC' });

    expect(screen.getByLabelText('Phoenix market')).toHaveValue('XYZ');
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));
    await waitFor(() => {
      expect(createMarketMoveMock).toHaveBeenCalledWith('http://studio', 'XYZ', '1000');
    });
  });

  it('creates a maintenance margin scenario and keeps invalid factors out of the backend', async () => {
    const createMock = vi.mocked(createPhoenixMaintenanceMarginScenario);
    createMock.mockResolvedValue({ id: 'maintenance' });
    const onCreated = vi.fn();
    renderDialog(onCreated);

    fireEvent.change(screen.getByLabelText('State goal'), { target: { value: 'maintenance-margin' } });
    fireEvent.click(await screen.findByRole('button', { name: 'SOL' }));
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'raw' } });
    for (const invalid of ['0', '10001', '65536', '1.5']) {
      fireEvent.change(screen.getByLabelText('Maintenance risk factor'), { target: { value: invalid } });
      expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
    }
    fireEvent.change(screen.getByLabelText('Maintenance risk factor'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith('http://studio', 'SOL', '10000');
      expect(onCreated).toHaveBeenCalledWith('maintenance');
    });
  });

  it('locks the market while the catalog loads and takes a typed symbol when it loads empty', async () => {
    let finishLoading!: (options: DynamicRefOption[]) => void;
    fetchSymbolsMock.mockReturnValue(
      new Promise((resolve) => {
        finishLoading = resolve;
      })
    );
    createMarketMoveMock.mockResolvedValue({ id: 'typed' });
    renderDialog();
    fireEvent.change(screen.getByLabelText('State goal'), { target: { value: 'market-move' } });
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '12345' } });

    expect(screen.getByLabelText('Phoenix market')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
    await act(async () => finishLoading([]));
    expect(await screen.findByRole('status')).toHaveTextContent('Markets could not be loaded');
    fireEvent.change(screen.getByLabelText('Phoenix market'), { target: { value: ' ETH ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ETH' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));
    await waitFor(() => {
      expect(createMarketMoveMock).toHaveBeenCalledWith('http://studio', 'ETH', '12345');
    });
  });

  it('clears an amount typed in a unit the newly picked market cannot take', async () => {
    fetchSymbolsMock.mockResolvedValue([
      { value: 'BTC', markTicks: 85957, tickSize: 100, baseLotDecimals: 4 },
      { value: 'NEW', address: 'NEWOrderbook1111111111111111111111111' },
    ]);
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'BTC' }));
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'NEW' }));

    expect(screen.getByLabelText('Target price')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
  });

  it('clears a USD or tick amount on a market change and keeps a % amount', async () => {
    fetchSymbolsMock.mockResolvedValue([
      { value: 'BTC', markTicks: 85957, tickSize: 100, baseLotDecimals: 4 },
      { value: 'SOL', markTicks: 11755, tickSize: 1, baseLotDecimals: 2 },
    ]);
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'SOL' }));
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'usd' } });
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'BTC' }));
    expect(screen.getByLabelText('Target price')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'raw' } });
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'SOL' }));
    expect(screen.getByLabelText('Target price')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'percent' } });
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'BTC' }));
    expect(screen.getByLabelText('Target price')).toHaveValue('-10');
  });

  it('keeps a maintenance factor at or below the market backstop factor out of the backend', async () => {
    const createMock = vi.mocked(createPhoenixMaintenanceMarginScenario);
    createMock.mockResolvedValue({ id: 'maintenance' });
    fetchSymbolsMock.mockResolvedValue([{ value: 'SOL', backstopRiskFactorBps: 2000 }]);
    renderDialog();

    fireEvent.change(screen.getByLabelText('State goal'), { target: { value: 'maintenance-margin' } });
    fireEvent.click(await screen.findByRole('button', { name: 'SOL' }));
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'raw' } });
    fireEvent.change(screen.getByLabelText('Maintenance risk factor'), { target: { value: '2000' } });
    expect(screen.getByRole('status')).toHaveTextContent('Must be above the backstop factor (2000 bps).');
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Maintenance risk factor'), { target: { value: '2001' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith('http://studio', 'SOL', '2001'));
  });

  it('keeps an amount typed while markets load in the ticks it was typed in', async () => {
    let finishLoading!: (options: DynamicRefOption[]) => void;
    fetchSymbolsMock.mockReturnValue(
      new Promise((resolve) => {
        finishLoading = resolve;
      })
    );
    createMarketMoveMock.mockResolvedValue({ id: 'typed' });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '12345' } });

    await act(async () => finishLoading([{ value: 'BTC', markTicks: 85957, tickSize: 100, baseLotDecimals: 4 }]));
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));
    await waitFor(() => expect(createMarketMoveMock).toHaveBeenCalledWith('http://studio', 'BTC', '12345'));
  });

  it('converts percent and USD inputs to the raw values the backend takes', async () => {
    const createMarginMock = vi.mocked(createPhoenixMaintenanceMarginScenario);
    createMarketMoveMock.mockResolvedValue({ id: 'mark' });
    createMarginMock.mockResolvedValue({ id: 'margin' });
    fetchSymbolsMock.mockResolvedValue([
      { value: 'BTC', markTicks: 85957, tickSize: 100, baseLotDecimals: 4 },
      { value: 'kBONK', markTicks: 1500, tickSize: 1, baseLotDecimals: -2 },
    ]);
    renderDialog();

    await screen.findByRole('button', { name: 'BTC' });
    const submit = (label: string, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));
    };
    submit('Target price', '-10');
    expect(screen.getByText('$85,957 → $77,361 (-10%), 77361 ticks')).toBeInTheDocument();
    await waitFor(() => expect(createMarketMoveMock).toHaveBeenLastCalledWith('http://studio', 'BTC', '77361'));
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'usd' } });
    submit('Target price', '85000.4');
    await waitFor(() => expect(createMarketMoveMock).toHaveBeenLastCalledWith('http://studio', 'BTC', '85000'));
    fireEvent.click(screen.getByRole('button', { name: 'kBONK' }));
    submit('Target price', '0.000015');
    await waitFor(() => expect(createMarketMoveMock).toHaveBeenLastCalledWith('http://studio', 'kBONK', '1500'));

    fireEvent.click(screen.getByRole('button', { name: 'BTC' }));
    fireEvent.change(screen.getByLabelText('State goal'), { target: { value: 'maintenance-margin' } });
    submit('Maintenance risk factor', '62.5');
    await waitFor(() => expect(createMarginMock).toHaveBeenCalledWith('http://studio', 'BTC', '6250'));
  });

  it('creates an oracle price scenario, not a market move, from a percent of the mark', async () => {
    const createOracleMock = vi.mocked(createPhoenixOraclePriceScenario);
    createOracleMock.mockResolvedValue({ id: 'oracle' });
    fetchSymbolsMock.mockResolvedValue([{ value: 'BTC', markTicks: 85957, tickSize: 100, baseLotDecimals: 4 }]);
    renderDialog();

    await screen.findByRole('button', { name: 'BTC' });
    fireEvent.change(screen.getByLabelText('State goal'), { target: { value: 'oracle-price' } });
    fireEvent.change(screen.getByLabelText('Oracle price'), { target: { value: '-5' } });
    expect(screen.getByText('$85,957 → $81,659 (-5%), 81659 ticks')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(createOracleMock).toHaveBeenCalledWith('http://studio', 'BTC', '81659'));
    expect(createMarketMoveMock).not.toHaveBeenCalled();
  });
});
