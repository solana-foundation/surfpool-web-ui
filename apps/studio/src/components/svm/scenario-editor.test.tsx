import { fetchDynamicRefOptions } from '@/lib/scenarios-api';
import { comboboxResults } from '@/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScenarioEditor from './scenario-editor';

vi.mock('@/hooks/use-app-config', () => ({
  useAppConfig: () => ({ studioUrl: 'http://studio', rpcUrl: 'http://rpc' }),
}));
vi.mock('@surfpool/ui', async () => ({
  Combobox: (await import('@/test-utils')).MockCombobox,
  ComboboxLabel: ({ children }: any) => <span>{children}</span>,
  ComboboxOption: ({ children }: any) => <div>{children}</div>,
  Select: ({ children, ...props }: any) => <select {...props}>{children}</select>,
  Switch: ({ checked, onChange }: any) => <input type="checkbox" checked={checked} onChange={onChange} />,
}));
vi.mock('./transaction-inspector', () => ({ default: () => null }));
vi.mock('@/lib/scenarios-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scenarios-api')>()),
  fetchDynamicRefOptions: vi.fn().mockResolvedValue([]),
}));

const collateralTemplate = {
  id: 'trader-collateral-field',
  name: 'Collateral field',
  protocol: 'Phoenix Eternal',
  description: 'Set collateral',
  accountType: 'Trader',
  address: { pubkey: 'trader' },
  properties: [{ path: 'traderState.quoteLotCollateral' }],
  idl: {
    types: [
      {
        name: 'Trader',
        type: { kind: 'struct', fields: [{ name: 'traderState', type: { defined: { name: 'TraderState' } } }] },
      },
      { name: 'TraderState', type: { kind: 'struct', fields: [{ name: 'quoteLotCollateral', type: 'i64' }] } },
    ],
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(fetchDynamicRefOptions).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const stepAction = (template: any, account: unknown = template.address, overrides: Record<string, unknown> = {}) => ({
  protocolId: 'phoenix-eternal',
  actionId: template.id,
  protocol: 'Phoenix Eternal',
  action: template.name,
  account,
  overrides,
});

const renderEditor = (...actions: ReturnType<typeof stepAction>[]) =>
  render(
    <ScenarioEditor scenarioId="editor-test" initialSteps={[{ id: 'slot', name: 'Slot', type: 'slot', actions }]} />
  );

async function openEditor(
  template: any = collateralTemplate,
  values: Record<string, unknown> = {},
  account: unknown = template.address
) {
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (url.endsWith('/templates') ? [template] : { result: { value: null } }),
  }));
  renderEditor(stepAction(template, account, values));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  fireEvent.click(await screen.findByTitle(`Phoenix Eternal: ${template.name}`));
  fireEvent.click(await screen.findByText(template.name));
}

const savedOverride = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Update Action' }));
  const patch = await waitFor(() => {
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(call).toBeDefined();
    return call!;
  });
  return JSON.parse(patch[1].body).overrides[0];
};

const pda = { pda: { programId: 'pool-program', seeds: [{ string: 'pool' }, { propertyRef: 'mint' }] } };
const mints = [
  { id: 'old', label: 'Old', value: 'OldMint' },
  { id: 'new', label: 'New', value: 'NewMint' },
];
const mintTemplate = {
  ...collateralTemplate,
  id: 'pump-bonding-curve-custom',
  address: pda,
  properties: [{ path: 'mint', type: 'constant_ref', constant: 'mints' }],
  constants: { mints: { label: 'Mint', options: mints } },
};

it('re-derives the address of a PDA template after a seed edit, even over a saved pubkey', async () => {
  await openEditor(mintTemplate, { mint: 'OldMint' }, { pubkey: 'OldPool' });
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'NewMint' } });
  expect(await savedOverride()).toMatchObject({ account: pda, values: { mint: 'NewMint' } });
});

it('reads a saved PDA action from the account it was saved with', async () => {
  await openEditor(mintTemplate, { mint: 'OldMint' }, { pubkey: 'OldPool' });
  await waitFor(() => {
    const read = fetchMock.mock.calls.find(
      ([, init]) => typeof init?.body === 'string' && JSON.parse(init.body).method === 'getAccountInfo'
    );
    expect(read && JSON.parse(read[1].body).params[0]).toBe('OldPool');
  });
});

it('selects a saved value a small static catalog lacks as its custom option, showing the value', async () => {
  await openEditor(mintTemplate, { mint: 'CustomMint' });
  const select = await screen.findByRole('combobox');
  expect(select).toHaveValue('CustomMint');
  expect(select).toHaveDisplayValue('Custom · CustomMint');
});

const marketTemplates = [
  {
    name: 'Market move',
    id: 'phoenix-market-move',
    prices: ['target_ticks'],
  },
  {
    name: 'Risk factors',
    id: 'phoenix-market-risk-factors',
    prices: ['maintenanceRiskFactor'],
  },
];

const marketTemplate = (market: (typeof marketTemplates)[number]) => ({
  ...collateralTemplate,
  ...market,
  accountType: 'PerpAssetMap',
  address: { pubkey: 'template-map' },
  properties: [
    { path: 'symbol', type: 'dynamic_ref', source: 'list_phoenix_markets' },
    ...market.prices.map((path) => ({ path, type: 'input', value_type: 'string' })),
  ],
  idl: {
    types: [
      {
        name: 'PerpAssetMap',
        type: {
          kind: 'struct',
          fields: [{ name: 'discriminator', type: { array: ['u8', 8] } }],
        },
      },
    ],
  },
});

it.each(marketTemplates)('edits and saves $name using input template fields', async (market) => {
  const template = marketTemplate(market);
  const values: Record<string, string> = { symbol: 'SOL' };
  for (const name of market.prices) values[name] = '1';
  await openEditor(template, values, { pubkey: 'saved-map' });
  const target = '18446744073709551615';
  for (const name of market.prices) {
    const input = await screen.findByPlaceholderText(`Enter ${name}...`);
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.change(input, { target: { value: target } });
    values[name] = target;
  }
  expect(await screen.findByLabelText('symbol')).toHaveValue('Custom · SOL');
  const override = await savedOverride();
  expect(override.templateId).toBe(market.id);
  expect(override.account).toEqual({ pubkey: 'template-map' });
  expect(override.values).toEqual(values);
});

const rpcParams = () =>
  fetchMock.mock.calls.filter(([url]) => url === 'http://rpc').map(([, init]) => JSON.parse(init.body).params);

it('reads the own account of a fixed-address template with IDL fields as parsed JSON', async () => {
  await openEditor(collateralTemplate, {}, { pubkey: 'saved-trader' });
  await waitFor(() => expect(rpcParams()).toEqual([['trader', { commitment: 'confirmed', encoding: 'jsonParsed' }]]));
});

it('keeps the trader of a dialog-created collateral override when it is saved from the editor', async () => {
  const trader = 'HB66UQf7Bv82q9VPhg9Hz6RcDaTMY1yJm8KVDA8VG7Gp';
  const template = {
    ...collateralTemplate,
    id: 'phoenix-trader-collateral',
    name: 'Phoenix Trader Collateral',
    address: { pubkey: '' },
    properties: [{ path: 'effective_collateral_usdc', type: 'input', value_type: 'string' }],
  };
  await openEditor(template, { effective_collateral_usdc: '1000' }, { pubkey: trader });
  await waitFor(() =>
    expect(rpcParams()).toEqual([
      [trader, { commitment: 'confirmed', encoding: 'base64', dataSlice: { offset: 0, length: 0 } }],
    ])
  );
  fireEvent.change(await screen.findByPlaceholderText('Enter effective_collateral_usdc...'), {
    target: { value: '2000' },
  });
  expect(await savedOverride()).toMatchObject({
    account: { pubkey: trader },
    values: { effective_collateral_usdc: '2000' },
  });
});

it.each(marketTemplates)('sends only the inputs of a newly selected $name action', async (market) => {
  const template = marketTemplate(market);
  vi.mocked(fetchDynamicRefOptions).mockResolvedValue([{ value: 'SOL', address: 'solOrderbook' }]);
  await openEditor(template);
  // As on a surfnet with the Phoenix IDL: jsonParsed decodes the map, base64 returns its bytes.
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const config = url === 'http://rpc' ? JSON.parse(`${init?.body}`).params[1] : undefined;
    const data =
      config?.encoding === 'jsonParsed' ? { parsed: { numAssets: 90, padding0: [0, 0, 0, 0, 0, 0] } } : ['', 'base64'];
    return { ok: true, json: async () => ({ result: { value: { data } } }) };
  });

  fireEvent.click(await screen.findByRole('heading', { name: template.name }));
  fireEvent.click(await screen.findByRole('button', { name: 'SOL' }));
  const values: Record<string, string> = { symbol: 'SOL' };
  for (const name of market.prices) {
    fireEvent.change(await screen.findByPlaceholderText(`Enter ${name}...`), { target: { value: '1' } });
    values[name] = '1';
  }

  expect((await savedOverride()).values).toEqual(values);
  expect(rpcParams().at(-1)).toEqual([
    'template-map',
    { commitment: 'confirmed', encoding: 'base64', dataSlice: { offset: 0, length: 0 } },
  ]);
});

it('picks the listed market a template field is given by symbol in any case or by orderbook address', async () => {
  const amat = 'AvPTRe4XjC1xdVhwzUiVwDDfqrqm6eVaKMAnS39raEjW';
  vi.mocked(fetchDynamicRefOptions).mockResolvedValue([
    { value: 'AMAT', address: amat },
    { value: 'AMD', address: 'ABBz13DENxvLRLh6pjHxNsxBPNNbEnfiMPPXrx8sK7qN' },
  ]);
  await openEditor(marketTemplate(marketTemplates[0]), { symbol: 'AMD', target_ticks: '1' }, { pubkey: 'saved-map' });
  const field = await screen.findByLabelText('symbol');
  await waitFor(() => expect(field).toHaveValue('AMD'));

  fireEvent.change(field, { target: { value: 'amat' } });
  expect(comboboxResults('symbol')).toEqual(['AMAT']);
  fireEvent.change(field, { target: { value: amat } });
  expect(comboboxResults('symbol')).toEqual(['AMAT']);
  fireEvent.click(screen.getByRole('button', { name: 'AMAT' }));

  expect((await savedOverride()).values.symbol).toBe('AMAT');
});

it('keeps a value a template field has no option for as a custom value', async () => {
  const unlisted = '6tgCsPZqZi4rcQWLLgoMHE1XAnRqA7mYYRByGUYxyFwB';
  vi.mocked(fetchDynamicRefOptions).mockResolvedValue([
    { value: 'AMAT', address: 'AvPTRe4XjC1xdVhwzUiVwDDfqrqm6eVaKMAnS39raEjW' },
  ]);
  await openEditor(marketTemplate(marketTemplates[0]), { symbol: 'AMAT', target_ticks: '1' }, { pubkey: 'saved-map' });
  const field = await screen.findByLabelText('symbol');
  await waitFor(() => expect(field).toHaveValue('AMAT'));

  fireEvent.change(field, { target: { value: unlisted } });
  expect(comboboxResults('symbol')).toEqual([`Custom · ${unlisted}`]);
  fireEvent.click(screen.getByRole('button', { name: `Custom · ${unlisted}` }));

  expect((await savedOverride()).values.symbol).toBe(unlisted);
});

it('ignores an older account response that resolves after a newer selection', async () => {
  const other = { ...collateralTemplate, id: 'other-collateral', name: 'Other collateral', address: { pubkey: 'b' } };
  const pending: Array<{ account: string; resolve: (collateral: number) => void }> = [];
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/templates')) return Promise.resolve({ ok: true, json: async () => [collateralTemplate, other] });
    if (url !== 'http://rpc') return Promise.resolve({ ok: true, json: async () => ({}) });
    return new Promise((resolve) => {
      pending.push({
        account: JSON.parse(`${init?.body}`).params[0],
        resolve: (collateral) =>
          resolve({
            ok: true,
            json: async () => ({
              result: { value: { data: { parsed: { traderState: { quoteLotCollateral: collateral } } } } },
            }),
          }),
      });
    });
  });
  renderEditor(stepAction(collateralTemplate));
  fireEvent.click(await screen.findByTitle(`Phoenix Eternal: ${collateralTemplate.name}`));
  fireEvent.click(await screen.findByText(collateralTemplate.name));
  await waitFor(() => expect(pending).toHaveLength(1));
  pending[0].resolve(1);

  fireEvent.click(await screen.findByRole('heading', { name: 'Other collateral' }));
  await waitFor(() => expect(pending).toHaveLength(2));
  fireEvent.click(screen.getByRole('heading', { name: collateralTemplate.name }));
  await waitFor(() => expect(pending).toHaveLength(3));
  expect(pending.map(({ account }) => account)).toEqual(['trader', 'b', 'trader']);

  pending[2].resolve(3);
  const collateral = () => (screen.getByPlaceholderText('Enter quoteLotCollateral...') as HTMLInputElement).value;
  await waitFor(() => expect(collateral()).toBe('3'));
  pending[1].resolve(2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(collateral()).toBe('3');
});

it('keeps the later of two saved overrides reopened before the first one loaded', async () => {
  // Only a template without an address reads the account each saved override was created for.
  const traderTemplate = { ...collateralTemplate, address: { pubkey: '' } };
  let releaseFirst = () => {};
  const firstLoaded = new Promise<void>((resolve) => (releaseFirst = resolve));
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(init?.body).includes('first-trader')) await firstLoaded;
    return {
      ok: true,
      json: async () => (url.endsWith('/templates') ? [traderTemplate] : { result: { value: null } }),
    };
  });
  const saved = (pubkey: string, collateral: string) =>
    stepAction(traderTemplate, { pubkey }, { 'traderState.quoteLotCollateral': collateral });
  renderEditor(saved('first-trader', '1'), saved('second-trader', '2'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const savedAction = async (index: number) => (await screen.findAllByText(collateralTemplate.name))[index];
  // The first click selects the slot, the next ones reopen a saved override.
  fireEvent.click(await savedAction(0));
  fireEvent.click(await savedAction(0));
  await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[1]?.body)).toContain('first-trader'));
  fireEvent.click(await savedAction(1));
  const input = await screen.findByPlaceholderText('Enter quoteLotCollateral...');
  await waitFor(() => expect(input).toHaveValue(2));

  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByPlaceholderText('Enter quoteLotCollateral...')).toHaveValue(2);
});

it('steps forward to the slot after the processed one, which surfnet reads ahead of the finalized default', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (body.method === 'getEpochInfo') {
      const absoluteSlot = body.params?.[0]?.commitment === 'processed' ? 663 : 632;
      return { ok: true, json: async () => ({ result: { absoluteSlot } }) };
    }
    return {
      ok: true,
      json: async () => (url.endsWith('/templates') ? [collateralTemplate] : { result: { value: null } }),
    };
  });
  render(
    <ScenarioEditor
      scenarioId="editor-test"
      initialSteps={[0, 1].map((height) => ({
        id: `slot-${height}`,
        name: `Slot ${height}`,
        type: 'slot',
        actions: [stepAction(collateralTemplate)],
      }))}
    />
  );
  fireEvent.click(await screen.findByTitle('Play scenario'));
  fireEvent.click(await screen.findByTitle('Step forward'));

  await waitFor(() => {
    const travel = fetchMock.mock.calls
      .map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : {}))
      .find((body) => body.method === 'surfnet_timeTravel');
    expect(travel?.params).toEqual([{ absoluteSlot: 664 }]);
  });
});
