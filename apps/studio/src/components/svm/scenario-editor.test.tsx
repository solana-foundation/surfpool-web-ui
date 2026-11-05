import { fetchDynamicRefOptions } from '@/lib/scenarios-api';
import { comboboxResults } from '@/test-utils';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScenarioEditor from './scenario-editor';

vi.mock('@/hooks/use-app-config', () => ({
  useAppConfig: () => ({ studioUrl: 'http://studio', rpcUrl: 'http://rpc' }),
}));
vi.mock('@surfpool/ui', async () => ({
  Combobox: (await import('@/test-utils')).MockCombobox,
  ComboboxLabel: ({ children }: any) => <span>{children}</span>,
  ComboboxOption: ({ children }: any) => <div>{children}</div>,
  Dropdown: ({ children }: any) => <div>{children}</div>,
  DropdownButton: ({ children, title, disabled }: any) => (
    <button title={title} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  DropdownLabel: ({ children }: any) => <span>{children}</span>,
  DropdownDescription: ({ children }: any) => <span>{children}</span>,
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

const PAUSED_CLOCK_WARNING_TEXT =
  'Time-sensitive scenario: pausing the clock may make the program refuse transactions due to time mismatches. Running clock is recommended.';
const PAUSED_PLAY = 'Pause clock and step through slots';
const RUNNING_PLAY = 'Run clock and play all slots';

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

async function loadEditor(
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
}

async function openEditor(
  template: any = collateralTemplate,
  values: Record<string, unknown> = {},
  account: unknown = template.address
) {
  await loadEditor(template, values, account);
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
  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  fireEvent.click(await screen.findByTitle('Step forward'));

  await waitFor(() => {
    const travel = fetchMock.mock.calls
      .map(([, init]) => (typeof init?.body === 'string' ? JSON.parse(init.body) : {}))
      .find((body) => body.method === 'surfnet_timeTravel');
    expect(travel?.params).toEqual([{ absoluteSlot: 664 }]);
  });
});

const rpcCalls = () =>
  fetchMock.mock.calls.filter(([url]) => url === 'http://rpc').map(([, init]) => JSON.parse(init.body));
const rpcMethods = () => rpcCalls().map((call) => call.method);
const registrations = () => rpcCalls().filter((call) => call.method === 'surfnet_registerScenario');

const clockSensitiveTemplate = { ...collateralTemplate, tags: ['clock-sensitive'] };

const column = (id: string) => ({
  id,
  name: 'Slot',
  type: 'slot' as const,
  actions: [
    {
      protocolId: 'phoenix-eternal',
      actionId: collateralTemplate.id,
      protocol: 'Phoenix Eternal',
      action: collateralTemplate.name,
      account: collateralTemplate.address,
      overrides: { 'traderState.quoteLotCollateral': id },
    },
  ],
});

// A step marks its column as executing 100 ms later, which must not land after the test environment is gone
const stepSettled = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 150)));

const renderColumns = (template: any, ids: string[]) => {
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (url.endsWith('/templates') ? [template] : { result: { absoluteSlot: 500 } }),
  }));
  render(<ScenarioEditor scenarioId="columns" initialSteps={ids.map(column)} />);
};

it('plays with a paused clock: pauses it, registers the whole plan once, and lands one column per step', async () => {
  renderColumns(clockSensitiveTemplate, ['1', '2']);

  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  await waitFor(() =>
    expect(rpcMethods()).toEqual([
      'surfnet_pauseClock',
      'surfnet_registerScenario',
      'getEpochInfo',
      'surfnet_timeTravel',
    ])
  );
  const [, plan] = rpcCalls();
  expect(plan.params[0].name).toBe('Scenario');
  expect(plan.params[0].overrides.map((override: any) => [override.scenarioRelativeSlot, override.values])).toEqual([
    [0, { 'traderState.quoteLotCollateral': '1' }],
    [1, { 'traderState.quoteLotCollateral': '2' }],
  ]);

  fireEvent.click(await screen.findByTitle('Step forward'));
  await waitFor(() => expect(rpcMethods().slice(4)).toEqual(['getEpochInfo', 'surfnet_timeTravel']));
  expect(rpcCalls().at(-1).params).toEqual([{ absoluteSlot: 501 }]);
  expect(registrations()).toHaveLength(1);
  expect(await screen.findByTitle('Complete - back to read mode')).toBeInTheDocument();
  await stepSettled();
});

it('resumes the clock and stays in read mode when the plan is rejected', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = url === 'http://rpc' ? JSON.parse(`${init?.body}`).method : undefined;
    const rejected = { error: { code: -32602, message: 'base slot 500 plus relative slot 1 overflows' } };
    return {
      ok: true,
      json: async () =>
        url.endsWith('/templates')
          ? [clockSensitiveTemplate]
          : method === 'surfnet_registerScenario'
            ? rejected
            : { result: { absoluteSlot: 500 } },
    };
  });
  render(<ScenarioEditor scenarioId="rejected" initialSteps={[column('1')]} />);

  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  await waitFor(() =>
    expect(rpcMethods()).toEqual(['surfnet_pauseClock', 'surfnet_registerScenario', 'surfnet_resumeClock'])
  );
  expect(screen.getByTitle('Play scenario')).toBeInTheDocument();
});

it('retries a step whose time travel failed', async () => {
  let failNextTimeTravel = false;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = url === 'http://rpc' ? JSON.parse(`${init?.body}`).method : undefined;
    if (method === 'surfnet_timeTravel' && failNextTimeTravel) {
      failNextTimeTravel = false;
      return { ok: true, json: async () => ({ error: { code: -32603, message: 'Failed to confirm clock update' } }) };
    }
    return {
      ok: true,
      json: async () => (url.endsWith('/templates') ? [clockSensitiveTemplate] : { result: { absoluteSlot: 500 } }),
    };
  });
  render(<ScenarioEditor scenarioId="retry" initialSteps={[column('1'), column('2')]} />);
  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  await waitFor(() => expect(rpcCalls()).toHaveLength(4));

  failNextTimeTravel = true;
  fireEvent.click(await screen.findByTitle('Step forward'));
  await waitFor(() => expect(rpcCalls()).toHaveLength(6));
  expect(await screen.findByTitle('Step forward')).toBeInTheDocument();

  fireEvent.click(screen.getByTitle('Step forward'));
  await waitFor(() => expect(rpcCalls()).toHaveLength(8));
  expect(rpcMethods().slice(4)).toEqual(['getEpochInfo', 'surfnet_timeTravel', 'getEpochInfo', 'surfnet_timeTravel']);
  expect(registrations()).toHaveLength(1);
  await stepSettled();
});

it('plays with the running clock: resumes the clock, registers the whole plan once and offers no step', async () => {
  renderColumns(collateralTemplate, ['1', '2', '3']);

  fireEvent.click(await screen.findByText(RUNNING_PLAY));
  await waitFor(() => expect(rpcMethods()).toEqual(['surfnet_resumeClock', 'surfnet_registerScenario']));
  expect(registrations()[0].params[0].overrides.map((override: any) => override.scenarioRelativeSlot)).toEqual([
    0, 1, 2,
  ]);
  expect(await screen.findByTitle('Complete - back to read mode')).toBeInTheDocument();
  expect(screen.queryByTitle('Step forward')).not.toBeInTheDocument();

  fireEvent.click(screen.getByTitle('Complete - back to read mode'));
  expect(await screen.findByTitle('Play scenario')).toBeInTheDocument();
  expect(rpcMethods()).toEqual(['surfnet_resumeClock', 'surfnet_registerScenario']);
});

it('does not register a running Play when the clock cannot be resumed', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => ({
    ok: !(url === 'http://rpc' && JSON.parse(`${init?.body}`).method === 'surfnet_resumeClock'),
    json: async () => (url.endsWith('/templates') ? [collateralTemplate] : { result: { absoluteSlot: 500 } }),
  }));
  render(<ScenarioEditor scenarioId="resume-fails" initialSteps={[column('1')]} />);

  fireEvent.click(await screen.findByText(RUNNING_PLAY));
  expect(await screen.findByTitle('Play scenario')).toBeInTheDocument();
  expect(rpcMethods()).toEqual(['surfnet_resumeClock']);
});

it('resumes the clock when a paused playback is stopped', async () => {
  renderColumns(clockSensitiveTemplate, ['1', '2']);
  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  fireEvent.click(await screen.findByTitle('Stop scenario'));
  await waitFor(() => expect(rpcMethods().at(-1)).toBe('surfnet_resumeClock'));
});

it('resumes the clock when a paused Play cannot move it to the next slot, and registers the plan again on the next Play', async () => {
  let failTimeTravel = true;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = url === 'http://rpc' ? JSON.parse(`${init?.body}`).method : undefined;
    if (method === 'surfnet_timeTravel' && failTimeTravel) {
      return { ok: true, json: async () => ({ error: { code: -32603, message: 'Failed to confirm clock update' } }) };
    }
    return {
      ok: true,
      json: async () => (url.endsWith('/templates') ? [collateralTemplate] : { result: { absoluteSlot: 500 } }),
    };
  });
  render(<ScenarioEditor scenarioId="advance-fails" initialSteps={[column('1')]} />);

  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  await waitFor(() =>
    expect(rpcMethods()).toEqual([
      'surfnet_pauseClock',
      'surfnet_registerScenario',
      'getEpochInfo',
      'surfnet_timeTravel',
      'surfnet_resumeClock',
    ])
  );
  expect(screen.getByTitle('Play scenario')).toBeInTheDocument();

  failTimeTravel = false;
  fireEvent.click(screen.getByText(PAUSED_PLAY));
  await waitFor(() =>
    expect(rpcMethods().slice(5)).toEqual([
      'surfnet_pauseClock',
      'surfnet_registerScenario',
      'getEpochInfo',
      'surfnet_timeTravel',
    ])
  );
});

it('ignores a second Play while the first one is still registering', async () => {
  let finishRegistering!: () => void;
  const registering = new Promise<void>((resolve) => {
    finishRegistering = () => resolve();
  });
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === 'http://rpc' && JSON.parse(`${init?.body}`).method === 'surfnet_registerScenario') {
      await registering;
    }
    return {
      ok: true,
      json: async () => (url.endsWith('/templates') ? [collateralTemplate] : { result: { absoluteSlot: 500 } }),
    };
  });
  render(<ScenarioEditor scenarioId="double-play" initialSteps={[column('1')]} />);

  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  expect(await screen.findByTitle('Preparing scenario…')).toBeDisabled();
  fireEvent.click(screen.getByText(RUNNING_PLAY));
  finishRegistering();

  await waitFor(() =>
    expect(rpcMethods()).toEqual([
      'surfnet_pauseClock',
      'surfnet_registerScenario',
      'getEpochInfo',
      'surfnet_timeTravel',
    ])
  );
});

it('offers both clocks without a warning when no used template is clock-sensitive', async () => {
  await loadEditor();
  expect(await screen.findByText(PAUSED_PLAY)).toBeInTheDocument();
  expect(screen.getByText(RUNNING_PLAY)).toBeInTheDocument();
  expect(screen.queryByText(/Time-sensitive scenario/)).not.toBeInTheDocument();
});

it('offers both clocks and warns on the paused one when a used template is clock-sensitive', async () => {
  await loadEditor(clockSensitiveTemplate);
  expect(await screen.findByText(PAUSED_PLAY)).toBeInTheDocument();
  expect(screen.getByText(RUNNING_PLAY)).toBeInTheDocument();
  expect(screen.getByText(PAUSED_CLOCK_WARNING_TEXT)).toBeInTheDocument();
});

it('ignores a second Step and keeps Stop disabled while the first one is still moving the clock', async () => {
  let finishTimeTravel!: () => void;
  let holdTimeTravel = false;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = url === 'http://rpc' ? JSON.parse(`${init?.body}`).method : undefined;
    if (method === 'surfnet_timeTravel' && holdTimeTravel) {
      await new Promise<void>((resolve) => {
        finishTimeTravel = resolve;
      });
    }
    return {
      ok: true,
      json: async () => (url.endsWith('/templates') ? [collateralTemplate] : { result: { absoluteSlot: 500 } }),
    };
  });
  render(
    <ScenarioEditor
      scenarioId="double-step"
      initialSteps={[1, 2, 3].map((height) => ({
        id: `${height}`,
        name: 'Slot',
        type: 'slot',
        actions: [stepAction(collateralTemplate)],
      }))}
    />
  );
  fireEvent.click(await screen.findByText(PAUSED_PLAY));
  await waitFor(() => expect(rpcCalls()).toHaveLength(4));

  const step = await screen.findByTitle('Step forward');
  holdTimeTravel = true;
  // Both clicks land before React renders again, so only a guard outside state can stop the second
  act(() => {
    step.click();
    step.click();
  });
  expect(screen.getByTitle('Stop scenario')).toBeDisabled();
  await waitFor(() => expect(rpcCalls()).toHaveLength(6));
  holdTimeTravel = false;
  finishTimeTravel();
  await waitFor(() => expect(screen.getByTitle('Stop scenario')).toBeEnabled());
  expect(rpcCalls()).toHaveLength(6);

  fireEvent.click(await screen.findByTitle('Step forward'));
  await waitFor(() => expect(rpcCalls()).toHaveLength(8));
  expect(rpcMethods().slice(4)).toEqual(['getEpochInfo', 'surfnet_timeTravel', 'getEpochInfo', 'surfnet_timeTravel']);
  expect(registrations()).toHaveLength(1);
  await stepSettled();
});
