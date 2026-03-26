import { describe, expect, it } from 'vitest';
import { buildAiPrompt, buildUpdatePayload, createScenarioPayload, scenarioToBentoItem } from './scenarios-api';
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
  it('converts steps and actions to overrides', () => {
    const result = buildUpdatePayload(baseScenario);
    expect(result.overrides).toHaveLength(3);
  });

  it('assigns correct scenarioRelativeSlot (1-indexed)', () => {
    const result = buildUpdatePayload(baseScenario);
    // Step 0 actions get slot 1
    expect(result.overrides[0].scenarioRelativeSlot).toBe(1);
    expect(result.overrides[1].scenarioRelativeSlot).toBe(1);
    // Step 1 actions get slot 2
    expect(result.overrides[2].scenarioRelativeSlot).toBe(2);
  });

  it('builds correct templateId from protocolId and actionId', () => {
    const result = buildUpdatePayload(baseScenario);
    expect(result.overrides[0].templateId).toBe('pyth_price-update');
    expect(result.overrides[0].id).toBe('pyth_price-update_0');
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
    const result = scenarioToBentoItem(baseScenario);
    expect(result.id).toBe('test-123');
    expect(result.name).toBe('Test Scenario');
    expect(result.description).toBe('A test scenario');
    expect(result.created_at).toBe('2025-01-01T00:00:00Z');
    expect(result.updated_at).toBe('2025-01-02T00:00:00Z');
    expect(result.steps).toBe(baseScenario.steps);
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
