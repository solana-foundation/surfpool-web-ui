import { describe, expect, it } from 'vitest';
import { buildPmmFairValueScenario } from '../pmm-fair-value';
import { toScenarioNumber } from '../scenarios-api';
import { HUMIDIFI_FAIR_VALUE, HUMIDIFI_FEATURED_MARKETS, humidifiFairValue } from './humidifi';

describe('buildPmmFairValueScenario', () => {
  it('assembles the HumidiFi fair value scenario for SOL/USDC at 208', () => {
    const [market] = HUMIDIFI_FAIR_VALUE.markets;
    const scenario = buildPmmFairValueScenario(HUMIDIFI_FAIR_VALUE, market, '208');
    const shared = {
      account: { pubkey: HUMIDIFI_FEATURED_MARKETS[0].market },
      scenarioRelativeSlot: 0,
      enabled: true,
      fetchBeforeUse: true,
    };

    expect(scenario).toMatchObject({
      name: 'HumidiFi SOL / USDC fair value 208',
      description: 'Set the HumidiFi SOL / USDC fair value to 208.',
      tags: ['humidifi', 'pmm', 'fair-value'],
      overrides: [
        { ...shared, templateId: 'humidifi-price', values: { fair_value: toScenarioNumber('58546795155816') } },
      ],
    });
    expect(scenario.overrides).toHaveLength(1);
  });
});

describe('humidifiFairValue', () => {
  it.each([
    ['208', 9, 6, BigInt('58546795155816')],
    ['100', 9, 6, BigInt('28147497671065')],
    ['1', 6, 6, BigInt('281474976710656')],
    ['0.5', 6, 8, BigInt('14073748835532800')],
  ])('derives the fair value for %s at %i/%i decimals', (price, base, quote, expected) => {
    expect(humidifiFairValue(price, base, quote)).toBe(expected);
  });

  it('rejects a price whose fair value leaves the u64 range', () => {
    expect(() => humidifiFairValue('0.0000000000001', 9, 6)).toThrow('too small');
    expect(() => humidifiFairValue('1000000000', 6, 6)).toThrow('too large');
  });
});
