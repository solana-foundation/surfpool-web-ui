import { createTemplateScenario, fetchScenarioTemplates } from '@/lib/pmm-fair-value';
import { HUMIDIFI_FEATURED_MARKETS } from '@/lib/pmms/humidifi';
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
const WET_USDC = HUMIDIFI_FEATURED_MARKETS[2];
const FEATURED = ['SOL / USDC', 'PENGU / USDC', 'WET / USDC', 'PUMP / USDC'];

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
  fetchTemplatesMock.mockResolvedValue([{ id: 'humidifi-price' }]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const HUMIDIFI_PROGRAM = '9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp';
// A live WETH/USDC market that Studio does not feature, with its masked quote and base mint words.
const UNLISTED_MARKET = 'iAMtZieUtpLwB3dzWw8Fo3H3FPkMFy3ej52URusseR1';
const MASKED_QUOTE_MINT = 'fec63e5dc433f1c1faa6493b2fded63577785d9355e141e0b965ba52c338fd65';
const MASKED_BASE_MINT = '5ed95c2469e0fd205775694ebbaa6888fb31dedd06057ed9f8da940bbad3f7ac';

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const mintAccount = (decimals: number) => {
  const data = new Uint8Array(82);
  data[44] = decimals;
  return { data: [base64(data), 'base64'] };
};

// A surfnet that serves one schema-8 market for getAccountInfo and its two mints for getMultipleAccounts.
const stubSurfnet = (owner: string) => {
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

describe('PmmFairValueDialog', () => {
  it('lists the PMM protocols and the featured markets of the adapter', async () => {
    renderDialog();

    expect(await screen.findByLabelText('Price of SOL in USDC')).toHaveValue('100');
    expect(fetchTemplatesMock).toHaveBeenCalledTimes(1);
    expect(fetchTemplatesMock).toHaveBeenCalledWith('http://studio');
    expect(optionNames('PMM protocol')).toEqual(['HumidiFi']);
    expect(marketNames()).toEqual(FEATURED);
  });

  it('searches the markets by pair, ignoring spaces and case, and by address', async () => {
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    const search = screen.getByLabelText('PMM market');

    fireEvent.change(search, { target: { value: 'pengu/usdc' } });
    expect(marketNames()).toEqual(['PENGU / USDC']);

    fireEvent.change(search, { target: { value: 'Fksff' } });
    expect(marketNames()).toEqual(['SOL / USDC']);

    fireEvent.change(search, { target: { value: 'usdc' } });
    expect(marketNames()).toEqual(FEATURED);

    fireEvent.change(search, { target: { value: 'bonk' } });
    expect(marketNames()).toEqual([]);
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
    const [studioUrl, scenario] = createScenarioMock.mock.calls[0] as [string, { overrides: any[]; tags: string[] }];
    const [price] = scenario.overrides;
    expect(studioUrl).toBe('http://studio');
    expect(scenario.tags).toEqual(['humidifi', 'pmm', 'fair-value']);
    expect(scenario.overrides).toHaveLength(1);
    expect(price).toMatchObject({
      templateId: 'humidifi-price',
      account: { pubkey: WET_USDC.market },
      fetchBeforeUse: true,
    });
    expect(String(price.values.fair_value)).toBe('98516241848729');
  });

  it('reads a typed market address the featured list does not offer, unmasking its mints', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    const fetchMock = stubSurfnet(HUMIDIFI_PROGRAM);
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));
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
    expect(scenario.overrides[0]).toMatchObject({ templateId: 'humidifi-price', account: { pubkey: UNLISTED_MARKET } });
    expect(String(scenario.overrides[0].values.fair_value)).toBe('281474976710656');
    expect(scenario.overrides).toHaveLength(1);
  });

  it('offers a read typed market once, not again as a custom address', async () => {
    stubSurfnet(HUMIDIFI_PROGRAM);
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));
    await screen.findByLabelText('Price of 7vfCXTUX⋯b963voxs in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });

    expect(marketNames()).toEqual([`Custom · ${UNLISTED_MARKET}`]);
  });

  it('refuses a typed address that is not a HumidiFi market', async () => {
    stubSurfnet('11111111111111111111111111111111');
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));

    expect(await screen.findByText(`${UNLISTED_MARKET} is not a HumidiFi market account`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
  });

  it('ignores a market read that resolves after a newer selection', async () => {
    const secondMarket = 'H3chk8rgniKXnToGTdPUFieuHGLQQfBMXVbGp6bR1uMD';
    const fetchMock = stubSurfnet(HUMIDIFI_PROGRAM);
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
    await screen.findByLabelText('Price of 7vfCXTUX⋯b963voxs in USDC');
    releaseFirstRead();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
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

    fireEvent.change(price, { target: { value: '0.0000000000001' } });
    fireEvent.click(createButton);
    expect(await screen.findByText("Price is too small for this market's decimals")).toBeInTheDocument();
    expect(createScenarioMock).not.toHaveBeenCalled();
  });
});
