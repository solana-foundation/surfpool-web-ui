import { createTemplateScenario, fetchScenarioTemplates } from '@/lib/pmm-fair-value';
import { BISONFI_FEATURED_MARKETS } from '@/lib/pmms/bisonfi';
import { HUMIDIFI_FEATURED_MARKETS } from '@/lib/pmms/humidifi';
import { SOLFI_FEATURED_MARKETS } from '@/lib/pmms/solfi';
import { PublicKey } from '@solana/web3.js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PmmFairValueDialog from './pmm-fair-value-dialog';

vi.mock('@/lib/pmm-fair-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pmm-fair-value')>()),
  createTemplateScenario: vi.fn(),
  fetchScenarioTemplates: vi.fn(),
}));

vi.mock('@surfpool/ui', async () => {
  const { useState } = await import('react');

  // Runs the dialog's own filter and displayValue, so the search itself is under test.
  const Combobox = ({
    'aria-label': ariaLabel,
    options,
    displayValue,
    filter,
    customOption,
    onChange,
    disabled,
  }: any) => {
    const [query, setQuery] = useState('');
    const handleQueryChange = (event: any) => setQuery(event.target.value);
    const filtered = query === '' ? options : options.filter((option: any) => filter(option, query));
    const typed = customOption && query !== '' ? customOption(query) : null;
    const matches = typed ? [...filtered, typed] : filtered;

    return (
      <div>
        <input aria-label={ariaLabel} value={query} onChange={handleQueryChange} disabled={disabled} />
        <ul aria-label={`${ariaLabel} results`}>
          {matches.map((option: any) => (
            <li key={option.value}>
              <button type="button" onClick={() => onChange(option)}>
                {displayValue(option)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return {
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Combobox,
    ComboboxDescription: ({ children }: any) => <span>{children}</span>,
    ComboboxLabel: ({ children }: any) => <span>{children}</span>,
    ComboboxOption: ({ children }: any) => <div>{children}</div>,
    Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
    DialogActions: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    Input: (props: any) => <input {...props} />,
    Listbox: ({ children, onChange, placeholder, ...props }: any) => {
      const handleChange = (event: any) => onChange(event.target.value);

      return (
        <select {...props} onChange={handleChange}>
          {children}
        </select>
      );
    },
    ListboxOption: ({ children, ...props }: any) => <option {...props}>{children}</option>,
  };
});

const createScenarioMock = vi.mocked(createTemplateScenario);
const fetchTemplatesMock = vi.mocked(fetchScenarioTemplates);

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const CBBTC_USDC = BISONFI_FEATURED_MARKETS[2];
const FEATURED = ['SOL / USDC', 'whETH / USDC', 'cbBTC / USDC', 'SOL / USDT'];

const optionNames = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((option) => option.textContent);

const marketNames = () =>
  within(screen.getByLabelText('PMM market results'))
    .queryAllByRole('button')
    .map((option) => option.textContent);

const renderDialog = (onCreated = vi.fn()) =>
  render(
    <PmmFairValueDialog open studioUrl="http://studio" rpcUrl="http://rpc" onClose={vi.fn()} onCreated={onCreated} />
  );

beforeEach(() => {
  fetchTemplatesMock.mockResolvedValue([{ id: 'bisonfi-fair-value' }]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const BISONFI_PROGRAM = 'BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi';
// A live HYPE/USDC pool Studio does not feature, and the mint at its base side.
const UNLISTED_MARKET = 'DSzgmzz1Ms4qshdeCpE2uWenXXyNbkikw3bzfJRAv7JF';
const UNLISTED_BASE_MINT = '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// A surfnet serving one version-3 BisonFi pool with its mints.
const stubSurfnet = (owner: string) => {
  const pool = new Uint8Array(2048);
  pool.set([...'POOLSTAT'].map((char) => char.charCodeAt(0)).concat([3]), 0);
  pool.set(new PublicKey(UNLISTED_BASE_MINT).toBytes(), 184);
  pool.set(new PublicKey(USDC).toBytes(), 216);
  const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
    ok: true,
    json: async () => ({ result: { value: { owner, data: [base64(pool), 'base64'] } } }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('PmmFairValueDialog', () => {
  it('lists the PMM protocols and the featured markets of the adapter', async () => {
    renderDialog();

    expect(await screen.findByLabelText('Price of SOL in USDC')).toHaveValue('100');
    expect(fetchTemplatesMock).toHaveBeenCalledTimes(1);
    expect(fetchTemplatesMock).toHaveBeenCalledWith('http://studio');
    expect(optionNames('PMM protocol')).toEqual(['BisonFi']);
    expect(marketNames()).toEqual(FEATURED);
  });

  it('searches the markets by pair, ignoring spaces and case, and by address', async () => {
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    const search = screen.getByLabelText('PMM market');

    fireEvent.change(search, { target: { value: 'cbbtc/usdc' } });
    expect(marketNames()).toEqual(['cbBTC / USDC']);

    fireEvent.change(search, { target: { value: '8FnX' } });
    expect(marketNames()).toEqual(['SOL / USDC']);

    fireEvent.change(search, { target: { value: 'sol' } });
    expect(marketNames()).toEqual(['SOL / USDC', 'SOL / USDT']);

    fireEvent.change(search, { target: { value: 'bonk' } });
    expect(marketNames()).toEqual([]);
  });

  it('posts the fair value of the selected pool as a decimal string', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: 'cbbtc' } });
    fireEvent.click(screen.getByRole('button', { name: 'cbBTC / USDC' }));
    fireEvent.change(screen.getByLabelText('Price of cbBTC in USDC'), { target: { value: '78467.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('scenario-id'));
    const [studioUrl, scenario] = createScenarioMock.mock.calls[0] as [string, { overrides: any[]; tags: string[] }];
    const [price] = scenario.overrides;
    expect(studioUrl).toBe('http://studio');
    expect(scenario.tags).toEqual(['bisonfi', 'pmm', 'fair-value']);
    expect(scenario.overrides).toHaveLength(1);
    expect(price).toMatchObject({
      templateId: 'bisonfi-fair-value',
      account: { pubkey: CBBTC_USDC.market },
      fetchBeforeUse: true,
    });
    expect(price.values.fair_value).toBe('24284437636903938843894576316416');
  });

  it('reads a typed pool address the featured list does not offer, with its mints', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    const fetchMock = stubSurfnet(BISONFI_PROGRAM);
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));
    await screen.findByLabelText('Price of 98sMhvDw⋯MXFNMh5g in USDC');
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('scenario-id'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://rpc');
    const [, scenario] = createScenarioMock.mock.calls[0] as [string, { name: string; overrides: any[] }];
    expect(scenario.name).toBe('BisonFi 98sMhvDw⋯MXFNMh5g / USDC fair value 100');
    expect(scenario.overrides[0]).toMatchObject({
      templateId: 'bisonfi-fair-value',
      account: { pubkey: UNLISTED_MARKET },
      values: { fair_value: '30948500982134506872478105600' },
    });
    expect(scenario.overrides).toHaveLength(1);
  });

  it('offers a read typed market once, not again as a custom address', async () => {
    stubSurfnet(BISONFI_PROGRAM);
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));
    await screen.findByLabelText('Price of 98sMhvDw⋯MXFNMh5g in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });

    expect(marketNames()).toEqual([`Custom · ${UNLISTED_MARKET}`]);
  });

  it('refuses a typed address that is not a BisonFi pool', async () => {
    stubSurfnet('11111111111111111111111111111111');
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));

    expect(await screen.findByText(`${UNLISTED_MARKET} is not a BisonFi v3 pool account`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
  });

  it('ignores a market read that resolves after a newer selection', async () => {
    const secondMarket = 'H3chk8rgniKXnToGTdPUFieuHGLQQfBMXVbGp6bR1uMD';
    const fetchMock = stubSurfnet(BISONFI_PROGRAM);
    const respond = fetchMock.getMockImplementation()!;
    let releaseFirstRead = () => {};
    fetchMock.mockImplementationOnce(
      (url, init) => new Promise((resolve) => (releaseFirstRead = () => resolve(respond(url, init))))
    );
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    for (const address of [UNLISTED_MARKET, secondMarket]) {
      fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: address } });
      fireEvent.click(screen.getByRole('button', { name: `Custom · ${address}` }));
    }
    await screen.findByLabelText('Price of 98sMhvDw⋯MXFNMh5g in USDC');
    releaseFirstRead();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeEnabled();
  });

  it('shows an error and disables Create when the surfnet serves no PMM template', async () => {
    fetchTemplatesMock.mockResolvedValue([{ id: 'pump-amm-canonical-pool' }]);
    renderDialog();

    expect(await screen.findByText('This surfnet serves no PMM fair value templates')).toBeInTheDocument();
    expect(within(screen.getByLabelText('PMM protocol')).queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
  });

  it('refuses a malformed price and shows an out-of-range one without posting', async () => {
    renderDialog();

    const price = await screen.findByLabelText('Price of SOL in USDC');
    const createButton = screen.getByRole('button', { name: 'Create scenario' });
    fireEvent.change(price, { target: { value: '1e3' } });
    expect(createButton).toBeDisabled();

    fireEvent.change(price, { target: { value: '0.000000000000000000000000001' } });
    fireEvent.click(createButton);
    expect(await screen.findByText('Price is too small for BisonFi')).toBeInTheDocument();
    expect(createScenarioMock).not.toHaveBeenCalled();
  });
});

const HUMIDIFI_PROGRAM = '9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp';
// A live WETH/USDC market that Studio does not feature, with its masked quote and base mint words.
const HUMIDIFI_UNLISTED_MARKET = 'iAMtZieUtpLwB3dzWw8Fo3H3FPkMFy3ej52URusseR1';
const MASKED_QUOTE_MINT = 'fec63e5dc433f1c1faa6493b2fded63577785d9355e141e0b965ba52c338fd65';
const MASKED_BASE_MINT = '5ed95c2469e0fd205775694ebbaa6888fb31dedd06057ed9f8da940bbad3f7ac';

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
const mintAccount = (decimals: number) => {
  const data = new Uint8Array(82);
  data[44] = decimals;
  return { data: [base64(data), 'base64'] };
};

// A surfnet that serves one schema-8 HumidiFi market for getAccountInfo and its two mints for getMultipleAccounts.
const stubHumidifiSurfnet = (owner: string) => {
  const market = new Uint8Array(1728);
  market.set([44, 90, 19, 124, 56, 111, 47, 150], 8);
  market.set(hexBytes(MASKED_QUOTE_MINT), 384);
  market.set(hexBytes(MASKED_BASE_MINT), 416);
  market.set([8], 1720);
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const { method } = JSON.parse(init.body);
    const result =
      method === 'getMultipleAccounts'
        ? { value: [mintAccount(8), mintAccount(6)] }
        : { value: { owner, data: [base64(market), 'base64'] } };
    return { ok: true, json: async () => ({ result }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('PmmFairValueDialog with HumidiFi', () => {
  beforeEach(() => {
    fetchTemplatesMock.mockResolvedValue([{ id: 'humidifi-price' }]);
  });

  it('lists HumidiFi and its featured markets', async () => {
    renderDialog();

    expect(await screen.findByLabelText('Price of SOL in USDC')).toHaveValue('100');
    expect(optionNames('PMM protocol')).toEqual(['HumidiFi']);
    expect(marketNames()).toEqual(['SOL / USDC', 'PENGU / USDC', 'WET / USDC', 'PUMP / USDC']);
  });

  it('posts the fair value for the selected market', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: 'wet' } });
    fireEvent.click(screen.getByRole('button', { name: 'WET / USDC' }));
    fireEvent.change(screen.getByLabelText('Price of WET in USDC'), { target: { value: '0.35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('scenario-id'));
    const [, scenario] = createScenarioMock.mock.calls[0] as [string, { overrides: any[]; tags: string[] }];
    const [price] = scenario.overrides;
    expect(scenario.tags).toEqual(['humidifi', 'pmm', 'fair-value']);
    expect(scenario.overrides).toHaveLength(1);
    expect(price).toMatchObject({
      templateId: 'humidifi-price',
      account: { pubkey: HUMIDIFI_FEATURED_MARKETS[2].market },
      fetchBeforeUse: true,
    });
    expect(String(price.values.fair_value)).toBe('98516241848729');
  });

  it('reads a typed market address the featured list does not offer, unmasking its mints', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    const fetchMock = stubHumidifiSurfnet(HUMIDIFI_PROGRAM);
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: HUMIDIFI_UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${HUMIDIFI_UNLISTED_MARKET}` }));
    await screen.findByLabelText('Price of 7vfCXTUX⋯b963voxs in USDC');
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('scenario-id'));
    expect(fetchMock.mock.calls[0][0]).toBe('http://rpc');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).params[0]).toEqual([
      '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
      USDC,
    ]);
    const [, scenario] = createScenarioMock.mock.calls[0] as [string, { name: string; overrides: any[] }];
    expect(scenario.name).toBe('HumidiFi 7vfCXTUX⋯b963voxs / USDC fair value 100');
    expect(scenario.overrides[0]).toMatchObject({
      templateId: 'humidifi-price',
      account: { pubkey: HUMIDIFI_UNLISTED_MARKET },
    });
    expect(String(scenario.overrides[0].values.fair_value)).toBe('281474976710656');
    expect(scenario.overrides).toHaveLength(1);
  });

  it('refuses a typed address that is not a HumidiFi market', async () => {
    stubHumidifiSurfnet('11111111111111111111111111111111');
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: HUMIDIFI_UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${HUMIDIFI_UNLISTED_MARKET}` }));

    expect(await screen.findByText(`${HUMIDIFI_UNLISTED_MARKET} is not a HumidiFi market account`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
  });

  it("refuses a price too small for the market's decimals", async () => {
    renderDialog();

    const price = await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(price, { target: { value: '0.0000000000001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    expect(await screen.findByText("Price is too small for this market's decimals")).toBeInTheDocument();
    expect(createScenarioMock).not.toHaveBeenCalled();
  });
});

const SOLFI_PROGRAM = 'SV2EYYJyRz2YhfXwXnhNAevDEui5Q6yrfyo13WtupPF';
const SOLFI_ORACLE_PROGRAM = 'E2uCGJ4TtYyKPGaK57UMfbs9sgaumwDEZF1aAY6fF3mS';
// A live SolFi market Studio does not feature, with its oracle and the mint behind its base vault.
const SOLFI_UNLISTED_MARKET = '2Q6S8p9iZNzMvpTemiC56HqCJ3F3szNoyRkvqEKfCanY';
const SOLFI_UNLISTED_ORACLE = '6RwCEKk7rR1ph5XNUMUqght4eHYpFhcaURWJrXb4FE3E';
const SOLFI_UNLISTED_BASE_MINT = 'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2';
const BASE_VAULT = '11111111111111111111111111111112';
const QUOTE_VAULT = '11111111111111111111111111111113';

const parsed = (info: Record<string, unknown>) => ({ owner: 'token', data: { parsed: { info } } });

// A surfnet serving one SolFi market, its oracle and vaults, and the vaults' mints.
const stubSolfiSurfnet = (owner: string) => {
  const market = new Uint8Array(1728);
  market.set(new PublicKey(SOLFI_UNLISTED_ORACLE).toBytes(), 24);
  market.set(new PublicKey(BASE_VAULT).toBytes(), 120);
  market.set(new PublicKey(QUOTE_VAULT).toBytes(), 152);
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body);
    const result =
      method === 'getAccountInfo'
        ? { value: { owner, data: [base64(market), 'base64'] } }
        : params[0][0] === SOLFI_UNLISTED_ORACLE
          ? {
              value: [
                { owner: SOLFI_ORACLE_PROGRAM, data: [base64(new Uint8Array(168)), 'base64'] },
                parsed({ mint: SOLFI_UNLISTED_BASE_MINT }),
                parsed({ mint: USDC }),
              ],
            }
          : { value: [parsed({ decimals: 8 }), parsed({ decimals: 6 })] };
    return { ok: true, json: async () => ({ result }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('PmmFairValueDialog with SolFi', () => {
  beforeEach(() => {
    fetchTemplatesMock.mockResolvedValue([{ id: 'solfi-price' }]);
  });

  it('lists SolFi and its featured markets', async () => {
    renderDialog();

    expect(await screen.findByLabelText('Price of SOL in USDC')).toHaveValue('100');
    expect(optionNames('PMM protocol')).toEqual(['SolFi']);
    expect(marketNames()).toEqual(['SOL / USDC', 'USDT / USDC', 'HYPE / USDC', 'PUMP / USDC']);
  });

  it("posts both price fields to the selected market's oracle", async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: 'hype' } });
    fireEvent.click(screen.getByRole('button', { name: 'HYPE / USDC' }));
    fireEvent.change(screen.getByLabelText('Price of HYPE in USDC'), { target: { value: '22.55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('scenario-id'));
    const [, scenario] = createScenarioMock.mock.calls[0] as [string, { overrides: any[]; tags: string[] }];
    const [price] = scenario.overrides;
    expect(scenario.tags).toEqual(['solfi', 'pmm', 'fair-value']);
    expect(scenario.overrides).toHaveLength(1);
    expect(price).toMatchObject({
      templateId: 'solfi-price',
      account: { pubkey: SOLFI_FEATURED_MARKETS[2].oracle },
      fetchBeforeUse: true,
    });
    expect(price.values.price_exponent).toBe(-10);
    expect(String(price.values.price_coefficient)).toBe('225500000');
  });

  it('reads a typed market address the featured list does not offer, with its oracle and decimals', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    const fetchMock = stubSolfiSurfnet(SOLFI_PROGRAM);
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: SOLFI_UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${SOLFI_UNLISTED_MARKET}` }));
    await screen.findByLabelText('Price of CrAr4RRJ⋯8e7FreP2 in USDC');
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('scenario-id'));
    expect(fetchMock.mock.calls[0][0]).toBe('http://rpc');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).params[0]).toEqual([
      SOLFI_UNLISTED_ORACLE,
      BASE_VAULT,
      QUOTE_VAULT,
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).params[0]).toEqual([SOLFI_UNLISTED_BASE_MINT, USDC]);
    const [, scenario] = createScenarioMock.mock.calls[0] as [string, { name: string; overrides: any[] }];
    expect(scenario.name).toBe('SolFi CrAr4RRJ⋯8e7FreP2 / USDC fair value 100');
    expect(scenario.overrides[0]).toMatchObject({
      templateId: 'solfi-price',
      account: { pubkey: SOLFI_UNLISTED_ORACLE },
    });
    expect(String(scenario.overrides[0].values.price_coefficient)).toBe('10000000000');
    expect(scenario.overrides).toHaveLength(1);
  });

  it('refuses a typed address that is not a SolFi market', async () => {
    stubSolfiSurfnet('11111111111111111111111111111111');
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: SOLFI_UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${SOLFI_UNLISTED_MARKET}` }));

    expect(await screen.findByText(`${SOLFI_UNLISTED_MARKET} is not a SolFi market account`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
  });

  it('refuses a price with more decimals than the market supports', async () => {
    renderDialog();

    const price = await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(price, { target: { value: '0.00000000001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    expect(await screen.findByText('Price has more decimals than this market supports, at most 7')).toBeInTheDocument();
    expect(createScenarioMock).not.toHaveBeenCalled();
  });
});
