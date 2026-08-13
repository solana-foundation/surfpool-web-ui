import { describe, expect, it } from 'vitest';
import { LosslessNumber } from 'lossless-json';
import {
  buildAiPrompt,
  buildUpdatePayload,
  createScenarioPayload,
  flattenOverrideValues,
  parseScenariosJson,
  scenarioDownloadFile,
  scenarioImportPayload,
  scenarioToBentoItem,
  serializeScenarioJson,
  snapshotDownloadContents,
  toScenarioNumber,
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

describe('scenarioImportPayload', () => {
  const downloaded = JSON.stringify({
    id: 'original',
    name: 'SOL Crash',
    description: 'a scenario',
    tags: ['pyth'],
    overrides: [{ id: 'ov', values: { 'price_message.price': 8500000000 } }],
  });

  it('replaces the id so an import cannot collide with its source', () => {
    const result = scenarioImportPayload(downloaded, 'fresh-id');
    expect('error' in result).toBe(false);
    const payload = JSON.parse((result as { payload: string }).payload);
    expect(payload.id).toBe('fresh-id');
    expect(payload.name).toBe('SOL Crash');
    expect(payload.overrides[0].values['price_message.price']).toBe(8500000000);
    expect(payload.tags).toEqual(['pyth']);
  });

  it('keeps integers beyond double precision exact', () => {
    const huge = '{"id":"x","name":"x","overrides":[{"values":{"price_message.price":9223372036854775807}}]}';
    const result = scenarioImportPayload(huge, 'fresh-id') as { payload: string };
    expect(result.payload).toContain('9223372036854775807');
  });

  it('defaults a missing name, description and tags', () => {
    const bare = '{"id":"x","overrides":[]}';
    const payload = JSON.parse((scenarioImportPayload(bare, 'fresh-id') as { payload: string }).payload);
    expect(payload.name).toBe('Imported scenario');
    expect(payload.description).toBe('');
    expect(payload.tags).toEqual([]);
  });

  it('rejects invalid JSON and anything that is not a scenario', () => {
    expect(scenarioImportPayload('not json', 'id')).toEqual({ error: 'That file is not valid JSON' });
    expect(scenarioImportPayload('[]', 'id')).toEqual({ error: 'That file does not contain a scenario' });
    expect(scenarioImportPayload('{"id":"x"}', 'id')).toEqual({
      error: 'That file does not contain a scenario',
    });
  });
});

describe('scenarioDownloadFile', () => {
  const response = JSON.stringify([
    { id: 'other', name: 'Other', overrides: [], tags: [] },
    {
      id: 'wanted',
      name: 'SOL Price Crash $85',
      description: 'a scenario',
      tags: ['pyth'],
      overrides: [{ id: 'ov', values: { 'price_message.price': 8500000000 } }],
    },
  ]);

  it('returns the requested scenario as a POST-shaped body', () => {
    const file = scenarioDownloadFile(response, 'wanted');
    expect(file).not.toBeNull();
    const parsed = JSON.parse(file!.contents);
    expect(parsed.id).toBe('wanted');
    expect(parsed.tags).toEqual(['pyth']);
    expect(parsed.overrides[0].values['price_message.price']).toBe(8500000000);
  });

  it('derives a filename from the scenario name', () => {
    expect(scenarioDownloadFile(response, 'wanted')!.filename).toBe('scenario-sol-price-crash-85.json');
  });

  it('falls back to the id when the name has no usable characters', () => {
    const unnamed = JSON.stringify([{ id: 'abc123', name: '///', overrides: [] }]);
    expect(scenarioDownloadFile(unnamed, 'abc123')!.filename).toBe('scenario-abc123.json');
  });

  it('keeps integers beyond double precision exact', () => {
    const huge = '[{"id":"big","name":"big","overrides":[{"values":{"price_message.price":9223372036854775807}}]}]';
    expect(scenarioDownloadFile(huge, 'big')!.contents).toContain('9223372036854775807');
  });

  it('round-trips an object-map scenario without losing a large integer', () => {
    const exact = '10103697788335729001';
    const objectMap =
      `{"wanted":{"name":"Object map","tags":["pyth"],` +
      `"overrides":[{"id":"ov","values":{"sqrt_price":${exact}}}]}}`;

    const file = scenarioDownloadFile(objectMap, 'wanted');
    expect(file).not.toBeNull();
    expect(file!.contents).toContain(`"id": "wanted"`);
    expect(file!.contents).toContain(exact);

    const imported = scenarioImportPayload(file!.contents, 'fresh-id');
    expect('error' in imported).toBe(false);
    const payload = (imported as { payload: string }).payload;
    expect(payload).toContain(exact);

    const scenario = parseScenariosJson(payload) as Record<string, unknown>;
    expect(scenario.id).toBe('fresh-id');
    expect(scenario.tags).toEqual(['pyth']);
  });

  it('returns null for an unknown id, an invalid object body, or invalid JSON', () => {
    expect(scenarioDownloadFile(response, 'missing')).toBeNull();
    expect(scenarioDownloadFile('{"id":"wanted"}', 'wanted')).toBeNull();
    expect(scenarioDownloadFile('not json', 'wanted')).toBeNull();
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

describe('u64 precision across the edit/save flow (path 2)', () => {
  // An odd u64 above Number.MAX_SAFE_INTEGER (2**53 - 1). Odd + large so any rounding
  // (which snaps to an even double) is detectable. Kept as a string so the source
  // literal is never itself rounded.
  const EXACT = '10103697788335729001';

  it('parseScenariosJson keeps an unsafe u64 exact and serializeScenarioJson round-trips it', () => {
    const getJson =
      `[{"id":"s","name":"n","overrides":[{"id":"o","templateId":"t",` +
      `"values":{"sqrt_price":${EXACT}}}]}]`;
    expect(serializeScenarioJson(parseScenariosJson(getJson))).toContain(EXACT);
  });

  it('keeps safe integers as plain numbers', () => {
    const parsed = parseScenariosJson('{"v":55555555555}') as { v: unknown };
    expect(typeof parsed.v).toBe('number');
    expect(parsed.v).toBe(55555555555);
  });

  it('toScenarioNumber returns a LosslessNumber for an unsafe value and a number for a safe one', () => {
    const big = toScenarioNumber(EXACT);
    expect(big).toBeInstanceOf(LosslessNumber);
    expect(String(big)).toBe(EXACT);
    expect(typeof toScenarioNumber('42')).toBe('number');
  });

  it('flattenOverrideValues treats a LosslessNumber as a value, not a nested object', () => {
    const flat = flattenOverrideValues({ sqrt_price: new LosslessNumber(EXACT), nested: { a: 1 } }, []);
    expect(String(flat.sqrt_price)).toBe(EXACT);
    expect(flat.nested).toBeUndefined();
  });

  it('end to end: GET -> flatten -> PATCH body keeps the exact u64', () => {
    const getJson =
      `[{"id":"s","name":"n","overrides":[{"id":"o","templateId":"t",` +
      `"values":{"sqrt_price":${EXACT}}}]}]`;
    const scenarios = parseScenariosJson(getJson) as Array<{ overrides: Array<{ values: Record<string, unknown> }> }>;
    const flat = flattenOverrideValues(scenarios[0].overrides[0].values, []);
    const patchBody = serializeScenarioJson({ id: 's', overrides: [{ values: flat }] });
    expect(patchBody).toContain(EXACT);
  });

  it('serializes a LosslessNumber as a JSON number for the register/Play RPC payload, not an object', () => {
    const body = {
      method: 'surfnet_registerScenario',
      params: [{ overrides: [{ values: { sqrt_price: new LosslessNumber(EXACT) } }] }],
    };
    const serialized = serializeScenarioJson(body);
    expect(serialized).toContain(`"sqrt_price":${EXACT}`);
    expect(serialized).not.toContain('isLosslessNumber');
    // Native JSON.stringify would corrupt the LosslessNumber into an object — the Play bug.
    expect(JSON.stringify(body)).toContain('isLosslessNumber');
  });

  it('pretty-prints a snapshot losslessly, keeping the exact u64 and indentation', () => {
    const serialized = serializeScenarioJson({ lamports: new LosslessNumber(EXACT) }, 2);
    expect(serialized).toContain(`"lamports": ${EXACT}`);
    expect(serialized).toContain('\n');
  });

  it('snapshotDownloadContents downloads only result.value (the account map), dropping the RPC envelope', () => {
    const account = 'HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ';
    // Raw RPC response: result carries both context and the account map under value.
    const raw = `{"result":{"context":{"slot":438604952,"apiVersion":"4.1.2"},"value":{"${account}":{"lamports":${EXACT},"owner":"11111111111111111111111111111111"}}}}`;
    const out = snapshotDownloadContents(raw);
    expect(out).not.toBeNull();
    // surfpool restore expects the bare account map — no context, no RPC envelope.
    expect(out).not.toContain('context');
    expect(out).not.toContain('438604952');
    expect(out).toContain(account);
    // Large balances stay exact.
    expect(out).toContain(`"lamports": ${EXACT}`);
    // Top-level keys are the accounts themselves, not result/context/value.
    const parsed = parseScenariosJson(out as string) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([account]);
  });

  it('snapshotDownloadContents returns null when there is no snapshot value or invalid JSON', () => {
    expect(snapshotDownloadContents('{"result":{"context":{"slot":1}}}')).toBeNull();
    expect(snapshotDownloadContents('not json')).toBeNull();
  });
});
