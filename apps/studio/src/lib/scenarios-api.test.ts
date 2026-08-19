import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAiPrompt,
  buildUpdatePayload,
  createPumpGraduationScenario,
  createPumpSwapPriceShockScenario,
  createScenarioPayload,
  flattenOverrideValues,
  scenarioToBentoItem,
} from './scenarios-api';
import type { Scenario } from './scenarios-data';

const baseScenario: Scenario = {
  id: 'test-123',
  name: 'Test Scenario',
  description: 'A test scenario',
  status: 'active',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
  steps: [
    {
      id: 'step-1',
      name: 'Step 1',
      type: 'slot',
      actions: [
        { protocolId: 'pyth', actionId: 'price-update', protocol: 'Pyth', action: 'Update Price' },
        { protocolId: 'raydium', actionId: 'swap', protocol: 'Raydium', action: 'Swap' },
      ],
    },
    {
      id: 'step-2',
      name: 'Step 2',
      type: 'slot',
      actions: [{ protocolId: 'kamino', actionId: 'liquidate', protocol: 'Kamino', action: 'Liquidate' }],
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPumpGraduationScenario', () => {
  it('posts the trimmed mint to the specialized scenario endpoint', async () => {
    const payload = {
      id: 'scenario-id',
      tokenMint: 'mint',
      completingBuyAmount: 10,
      migrationReserve: 20,
      addresses: { bondingCurve: 'curve', curveVault: 'vault', canonicalPool: 'pool' },
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

    await expect(createPumpGraduationScenario('http://studio', ' mint ')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('http://studio/v1/scenarios/pump-graduation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenMint: 'mint' }),
    });
  });

  it('surfaces backend validation failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bonding curve is already complete', { status: 400 }));

    await expect(createPumpGraduationScenario('http://studio', 'mint')).rejects.toThrow(
      'Bonding curve is already complete'
    );
  });
});

describe('createPumpSwapPriceShockScenario', () => {
  it('posts trimmed inputs to the specialized scenario endpoint', async () => {
    const payload = {
      id: 'scenario-id',
      tokenMint: 'mint',
      canonicalPool: 'pool',
      virtualQuoteReserves: '15000000000000',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

    await expect(createPumpSwapPriceShockScenario('http://studio', ' mint ', ' 15000000000000 ')).resolves.toEqual(
      payload
    );
    expect(fetchMock).toHaveBeenCalledWith('http://studio/v1/scenarios/pump-swap-price-shock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenMint: 'mint', virtualQuoteReserves: '15000000000000' }),
    });
  });

  it('surfaces backend validation failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Canonical PumpSwap pool not found', { status: 400 }));

    await expect(createPumpSwapPriceShockScenario('http://studio', 'mint', '1')).rejects.toThrow(
      'Canonical PumpSwap pool not found'
    );
  });
});

describe('createScenarioPayload', () => {
  it('returns correct shape with empty overrides and tags', () => {
    const result = createScenarioPayload(baseScenario);
    expect(result).toEqual({
      id: 'test-123',
      name: 'Test Scenario',
      description: 'A test scenario',
      overrides: [],
      tags: [],
    });
  });

  it('passes through undefined description', () => {
    const result = createScenarioPayload({ ...baseScenario, description: undefined });
    expect(result.description).toBeUndefined();
  });
});

describe('buildUpdatePayload', () => {
  // Mirrors the shape produced by the scenarios page when it loads a backend
  // scenario: actionId carries the full templateId, and override data is kept
  const loadedScenario: Scenario = {
    ...baseScenario,
    tags: ['pyth', 'oracle'],
    steps: [
      {
        id: 'slot-0',
        name: 'Slot 0',
        type: 'slot',
        slotNumber: 0,
        actions: [
          {
            overrideId: 'override-sol-85',
            protocolId: 'pyth',
            actionId: 'pyth-price-feed-v2',
            protocol: 'Pyth',
            action: 'SOL/USD = $85',
            fetchBeforeUse: true,
            overrides: { 'price_message.price': 8500000000, feed_id: '0xef0d' },
            modifiedFields: ['price_message.price'],
            account: { pda: { programId: 'pyth', seeds: [] } },
          },
        ],
      },
    ],
  };

  it('converts steps and actions to overrides', () => {
    const result = buildUpdatePayload(baseScenario);
    expect(result.overrides).toHaveLength(3);
  });

  it('passes backend-only fields through untouched and keeps a loaded enabled: false', () => {
    const withOriginal: Scenario = {
      ...baseScenario,
      steps: [
        {
          id: 'slot-0',
          name: 'Slot 0',
          type: 'slot',
          slotNumber: 0,
          actions: [
            {
              overrideId: 'override-1',
              protocolId: 'pyth',
              actionId: 'pyth-price-feed-v2',
              protocol: 'Pyth',
              action: 'Disabled override',
              original: { enabled: false, futureBackendField: 'must survive' },
            },
          ],
        },
      ],
    };
    const override = buildUpdatePayload(withOriginal).overrides[0];
    expect(override.enabled).toBe(false);
    expect(override.futureBackendField).toBe('must survive');
  });

  it('defaults enabled to true for actions never saved before', () => {
    expect(buildUpdatePayload(baseScenario).overrides[0].enabled).toBe(true);
  });

  it('preserves the backend override id, values, account, and fetchBeforeUse', () => {
    const override = buildUpdatePayload(loadedScenario).overrides[0];
    expect(override.id).toBe('override-sol-85');
    expect(override.templateId).toBe('pyth-price-feed-v2');
    expect(override.values).toEqual({ 'price_message.price': 8500000000, feed_id: '0xef0d' });
    expect(override.fetchBeforeUse).toBe(true);
    expect(override.account).toEqual({ pda: { programId: 'pyth', seeds: [] } });
  });

  it('preserves the scenario tags', () => {
    expect(buildUpdatePayload(loadedScenario).tags).toEqual(['pyth', 'oracle']);
    expect(buildUpdatePayload(baseScenario).tags).toEqual([]);
  });

  it('uses the step slotNumber and keeps it 0-indexed like the editor sync', () => {
    expect(buildUpdatePayload(loadedScenario).overrides[0].scenarioRelativeSlot).toBe(0);
  });

  it('falls back to the step index for steps without slotNumber', () => {
    const result = buildUpdatePayload(baseScenario);
    expect(result.overrides[0].scenarioRelativeSlot).toBe(0);
    expect(result.overrides[1].scenarioRelativeSlot).toBe(0);
    expect(result.overrides[2].scenarioRelativeSlot).toBe(1);
  });

  it('generates an id and empty values for actions never saved before', () => {
    const override = buildUpdatePayload(baseScenario).overrides[0];
    expect(override.id).toBe('price-update_0');
    expect(override.templateId).toBe('price-update');
    expect(override.values).toEqual({});
    expect(override).not.toHaveProperty('account');
  });

  it('sets label from action name', () => {
    const result = buildUpdatePayload(baseScenario);
    expect(result.overrides[0].label).toBe('Update Price');
    expect(result.overrides[2].label).toBe('Liquidate');
  });

  it('returns empty overrides for scenario with no steps', () => {
    const result = buildUpdatePayload({ ...baseScenario, steps: [] });
    expect(result.overrides).toEqual([]);
  });

  it('returns empty overrides for steps with no actions', () => {
    const result = buildUpdatePayload({
      ...baseScenario,
      steps: [{ id: 's1', name: 'Empty', type: 'slot', actions: [] }],
    });
    expect(result.overrides).toEqual([]);
  });

  it('returns empty overrides when steps is undefined', () => {
    const result = buildUpdatePayload({ ...baseScenario, steps: undefined });
    expect(result.overrides).toEqual([]);
  });

  it('defaults description to empty string', () => {
    const result = buildUpdatePayload({ ...baseScenario, description: undefined });
    expect(result.description).toBe('');
  });
});

describe('scenarioToBentoItem', () => {
  it('maps all fields correctly', () => {
    const result = scenarioToBentoItem({ ...baseScenario, tags: ['pyth', 'oracle'] });
    expect(result.id).toBe('test-123');
    expect(result.name).toBe('Test Scenario');
    expect(result.description).toBe('A test scenario');
    expect(result.created_at).toBe('2025-01-01T00:00:00Z');
    expect(result.updated_at).toBe('2025-01-02T00:00:00Z');
    expect(result.steps).toBe(baseScenario.steps);
    expect(result.tags).toEqual(['pyth', 'oracle']);
    expect(result.metadata).toBeUndefined();
  });

  it('maps status correctly for active scenario', () => {
    const result = scenarioToBentoItem(baseScenario);
    expect(result.status).toEqual({ online: true, status: 'active' });
  });

  it('maps status correctly for running scenario', () => {
    const result = scenarioToBentoItem({ ...baseScenario, status: 'running' });
    expect(result.status).toEqual({ online: true, status: 'running' });
  });

  it('maps status correctly for inactive scenario', () => {
    const result = scenarioToBentoItem({ ...baseScenario, status: 'stopped' });
    expect(result.status).toEqual({ online: false, status: 'stopped' });
  });

  it('returns undefined status when scenario has no status', () => {
    const result = scenarioToBentoItem({ ...baseScenario, status: undefined });
    expect(result.status).toBeUndefined();
  });

  it('defaults description to "No description available"', () => {
    const result = scenarioToBentoItem({ ...baseScenario, description: undefined });
    expect(result.description).toBe('No description available');
  });
});

describe('buildAiPrompt', () => {
  it('returns trimmed prompt when no protocols selected', () => {
    const result = buildAiPrompt('  do something  ', new Set());
    expect(result).toBe('do something');
  });

  it('appends protocol names when protocols selected', () => {
    const result = buildAiPrompt('create a scenario', new Set(['pyth', 'raydium']));
    expect(result).toContain('Use only these protocols: Pyth, Raydium.');
  });

  it('preserves base prompt before protocol line', () => {
    const result = buildAiPrompt('create a scenario', new Set(['pyth']));
    expect(result.startsWith('create a scenario')).toBe(true);
  });

  it('ignores unknown protocol IDs', () => {
    const result = buildAiPrompt('test', new Set(['nonexistent']));
    expect(result).toBe('test');
  });
});

describe('flattenOverrideValues', () => {
  // The account-shaped editing state: values edited in the UI sit nested under
  // price_message, while feed_id (constant_ref) and posted_slot live at the top level.
  const editedAccountData = {
    feed_id: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    posted_slot: 111111111,
    price_message: {
      price: 5000000000,
      conf: 500000000,
      publish_time: 1700000000,
    },
  };

  it('resolves nested edited fields through their dotted paths', () => {
    const result = flattenOverrideValues(editedAccountData, [
      'posted_slot',
      'price_message.price',
      'price_message.conf',
      'price_message.publish_time',
    ]);
    expect(result).toEqual({
      feed_id: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
      posted_slot: 111111111,
      'price_message.price': 5000000000,
      'price_message.conf': 500000000,
      'price_message.publish_time': 1700000000,
    });
  });

  it('keeps top-level values that are not in modifiedFields, like constant_ref selections', () => {
    const result = flattenOverrideValues(editedAccountData, ['price_message.price']);
    expect(result.feed_id).toBe(editedAccountData.feed_id);
    expect(result.posted_slot).toBe(111111111);
  });

  it('passes through values already flat from the backend without modifiedFields', () => {
    const restored = { 'price_message.price': 123, posted_slot: 7 };
    expect(flattenOverrideValues(restored, undefined)).toEqual(restored);
  });

  it('does not duplicate a path that is already flat', () => {
    const restored = { 'price_message.price': 123 };
    expect(flattenOverrideValues(restored, ['price_message.price'])).toEqual(restored);
  });

  it('never emits nested objects', () => {
    const result = flattenOverrideValues(editedAccountData, ['price_message']);
    expect(Object.values(result).some((v) => v !== null && typeof v === 'object' && !Array.isArray(v))).toBe(false);
  });

  it('omits paths that do not resolve', () => {
    const result = flattenOverrideValues(editedAccountData, ['price_message.missing', 'nothing.here']);
    expect(result).not.toHaveProperty('price_message.missing');
    expect(result).not.toHaveProperty('nothing.here');
  });

  it('keeps arrays as values', () => {
    const result = flattenOverrideValues({ feed_id: [1, 2, 3] }, []);
    expect(result.feed_id).toEqual([1, 2, 3]);
  });

  it('returns empty object for undefined input', () => {
    expect(flattenOverrideValues(undefined, ['a.b'])).toEqual({});
  });
});
