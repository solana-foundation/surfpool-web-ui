import { createTemplateScenario, fetchScenarioTemplates } from '@/lib/pmm-fair-value';
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
const HYPE_USDC = SOLFI_FEATURED_MARKETS[2];
const FEATURED = ['SOL / USDC', 'USDT / USDC', 'HYPE / USDC', 'PUMP / USDC'];

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
  fetchTemplatesMock.mockResolvedValue([{ id: 'solfi-price' }]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const SOLFI_PROGRAM = 'SV2EYYJyRz2YhfXwXnhNAevDEui5Q6yrfyo13WtupPF';
const SOLFI_ORACLE_PROGRAM = 'E2uCGJ4TtYyKPGaK57UMfbs9sgaumwDEZF1aAY6fF3mS';
// A live SolFi market Studio does not feature, with its oracle and the mint behind its base vault.
const UNLISTED_MARKET = '2Q6S8p9iZNzMvpTemiC56HqCJ3F3szNoyRkvqEKfCanY';
const UNLISTED_ORACLE = '6RwCEKk7rR1ph5XNUMUqght4eHYpFhcaURWJrXb4FE3E';
const UNLISTED_BASE_MINT = 'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2';
const BASE_VAULT = '11111111111111111111111111111112';
const QUOTE_VAULT = '11111111111111111111111111111113';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const parsed = (info: Record<string, unknown>) => ({ owner: 'token', data: { parsed: { info } } });

// A surfnet serving one SolFi market, its oracle and vaults, and the vaults' mints.
const stubSurfnet = (owner: string) => {
  const market = new Uint8Array(1728);
  market.set(new PublicKey(UNLISTED_ORACLE).toBytes(), 24);
  market.set(new PublicKey(BASE_VAULT).toBytes(), 120);
  market.set(new PublicKey(QUOTE_VAULT).toBytes(), 152);
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body);
    const result =
      method === 'getAccountInfo'
        ? { value: { owner, data: [base64(market), 'base64'] } }
        : params[0][0] === UNLISTED_ORACLE
          ? {
              value: [
                { owner: SOLFI_ORACLE_PROGRAM, data: [base64(new Uint8Array(168)), 'base64'] },
                parsed({ mint: UNLISTED_BASE_MINT }),
                parsed({ mint: USDC }),
              ],
            }
          : { value: [parsed({ decimals: 8 }), parsed({ decimals: 6 })] };
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
    expect(optionNames('PMM protocol')).toEqual(['SolFi']);
    expect(marketNames()).toEqual(FEATURED);
  });

  it('searches the markets by pair, ignoring spaces and case, and by address', async () => {
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    const search = screen.getByLabelText('PMM market');

    fireEvent.change(search, { target: { value: 'hype/usdc' } });
    expect(marketNames()).toEqual(['HYPE / USDC']);

    fireEvent.change(search, { target: { value: '65ZH' } });
    expect(marketNames()).toEqual(['SOL / USDC']);

    fireEvent.change(search, { target: { value: 'usdc' } });
    expect(marketNames()).toEqual(FEATURED);

    fireEvent.change(search, { target: { value: 'bonk' } });
    expect(marketNames()).toEqual([]);
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
    const [studioUrl, scenario] = createScenarioMock.mock.calls[0] as [string, { overrides: any[]; tags: string[] }];
    const [price] = scenario.overrides;
    expect(studioUrl).toBe('http://studio');
    expect(scenario.tags).toEqual(['solfi', 'pmm', 'fair-value']);
    expect(scenario.overrides).toHaveLength(1);
    expect(price).toMatchObject({
      templateId: 'solfi-price',
      account: { pubkey: HYPE_USDC.oracle },
      fetchBeforeUse: true,
    });
    expect(price.values.price_exponent).toBe(-10);
    expect(String(price.values.price_coefficient)).toBe('225500000');
  });

  it('reads a typed market address the featured list does not offer, with its oracle and decimals', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({ id: 'scenario-id' });
    const fetchMock = stubSurfnet(SOLFI_PROGRAM);
    renderDialog(onCreated);

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));
    await screen.findByLabelText('Price of CrAr4RRJ⋯8e7FreP2 in USDC');
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('scenario-id'));
    expect(fetchMock.mock.calls[0][0]).toBe('http://rpc');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).params[0]).toEqual([UNLISTED_ORACLE, BASE_VAULT, QUOTE_VAULT]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).params[0]).toEqual([UNLISTED_BASE_MINT, USDC]);
    const [, scenario] = createScenarioMock.mock.calls[0] as [string, { name: string; overrides: any[] }];
    expect(scenario.name).toBe('SolFi CrAr4RRJ⋯8e7FreP2 / USDC fair value 100');
    expect(scenario.overrides[0]).toMatchObject({ templateId: 'solfi-price', account: { pubkey: UNLISTED_ORACLE } });
    expect(String(scenario.overrides[0].values.price_coefficient)).toBe('10000000000');
    expect(scenario.overrides).toHaveLength(1);
  });

  it('offers a read typed market once, not again as a custom address', async () => {
    stubSurfnet(SOLFI_PROGRAM);
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));
    await screen.findByLabelText('Price of CrAr4RRJ⋯8e7FreP2 in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });

    expect(marketNames()).toEqual([`Custom · ${UNLISTED_MARKET}`]);
  });

  it('refuses a typed address that is not a SolFi market', async () => {
    stubSurfnet('11111111111111111111111111111111');
    renderDialog();

    await screen.findByLabelText('Price of SOL in USDC');
    fireEvent.change(screen.getByLabelText('PMM market'), { target: { value: UNLISTED_MARKET } });
    fireEvent.click(screen.getByRole('button', { name: `Custom · ${UNLISTED_MARKET}` }));

    expect(await screen.findByText(`${UNLISTED_MARKET} is not a SolFi market account`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
  });

  it('ignores a market read that resolves after a newer selection', async () => {
    const secondMarket = 'H3chk8rgniKXnToGTdPUFieuHGLQQfBMXVbGp6bR1uMD';
    const fetchMock = stubSurfnet(SOLFI_PROGRAM);
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
    await screen.findByLabelText('Price of CrAr4RRJ⋯8e7FreP2 in USDC');
    releaseFirstRead();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
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

    fireEvent.change(price, { target: { value: '0.00000000001' } });
    fireEvent.click(createButton);
    expect(await screen.findByText('Price has more decimals than this market supports, at most 7')).toBeInTheDocument();
    expect(createScenarioMock).not.toHaveBeenCalled();
  });
});
