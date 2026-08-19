import { describe, expect, it } from 'vitest';
import { resolveProtocol, scenarioFromApiData } from './scenarios-data';

const templates = new Map<string, string>([
  ['pyth-price-feed-v2', 'Pyth'],
  ['pump-bonding-curve-custom', 'Pump'],
  ['pump-amm-canonical-pool', 'PumpSwap'],
  ['kamino-obligation-health', 'kamino'],
]);

describe('resolveProtocol', () => {
  it('uses the authoritative protocol name for multi-dash templateIds', () => {
    // The regression this guards: the prefix heuristic turns pump-amm-* into "pump".
    expect(resolveProtocol('pump-amm-canonical-pool', templates)).toEqual({
      protocolId: 'pumpswap',
      displayName: 'PumpSwap',
    });
  });

  it('preserves canonical casing from the templates list (kamino -> Kamino)', () => {
    expect(resolveProtocol('kamino-obligation-health', templates)).toEqual({
      protocolId: 'kamino',
      displayName: 'Kamino',
    });
  });

  it('falls back to the templateId prefix when the template is unknown', () => {
    expect(resolveProtocol('raydium-clmm-custom', new Map())).toEqual({
      protocolId: 'raydium',
      displayName: 'Raydium',
    });
  });
});

describe('scenarioFromApiData', () => {
  const scenarioData = {
    id: 's1',
    name: 'demo',
    overrides: [
      { id: 'o1', templateId: 'pump-amm-canonical-pool', scenarioRelativeSlot: 0, values: { lp_supply: 1 } },
      { id: 'o2', templateId: 'pyth-price-feed-v2', scenarioRelativeSlot: 750, values: {} },
    ],
  };

  it('groups overrides into slot steps and resolves each protocol', () => {
    const s = scenarioFromApiData(scenarioData, 's1', templates);
    expect(s.id).toBe('s1');
    expect(s.steps).toHaveLength(2);
    // Sparse slots keep their real numbers (0 and 750), not dense positions.
    expect(s.steps!.map((step) => step.slotNumber)).toEqual([0, 750]);
    expect(s.steps![0].actions![0].protocol).toBe('PumpSwap');
    expect(s.steps![0].actions![0].overrideId).toBe('o1');
  });

  it('falls back to the object key when the body omits id', () => {
    const { id, ...noId } = scenarioData;
    expect(scenarioFromApiData(noId, 'key-42', templates).id).toBe('key-42');
  });

  it('handles a scenario with no overrides', () => {
    const s = scenarioFromApiData({ id: 'empty' }, 'empty', templates);
    expect(s.steps).toBeUndefined();
  });
});
