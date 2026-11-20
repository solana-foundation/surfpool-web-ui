import { createTemplateScenario, fetchScenarioTemplates } from '@/lib/pmm-fair-value';
import { BISONFI_FEATURED_MARKETS } from '@/lib/pmms/bisonfi';
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
