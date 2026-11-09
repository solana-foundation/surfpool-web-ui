import { describe, expect, it } from 'vitest';
import { buildPmmFairValueScenario } from '../pmm-fair-value';
import { toScenarioNumber } from '../scenarios-api';
import { SOLFI_FAIR_VALUE, SOLFI_FEATURED_MARKETS, solfiPriceCoefficient } from './solfi';

describe('solfiPriceCoefficient', () => {
  // The template's worked examples at exponent -10, and the live SOL/USDC quote decoded from mainnet.
  it.each([
    ['50', 9, 6, BigInt('500000000')],
    ['1', 6, 6, BigInt('10000000000')],
    ['93.6976354', 9, 6, BigInt('936976354')],
    ['0.0025', 6, 6, BigInt('25000000')],
  ])('derives the coefficient for %s at %i/%i decimals', (price, base, quote, expected) => {
    expect(solfiPriceCoefficient(price, base, quote)).toBe(expected);
  });

  it('rejects more decimals than exponent -10 holds and a coefficient beyond u64', () => {
    expect(() => solfiPriceCoefficient('1.00000000001', 6, 6)).toThrow('at most 10');
    expect(() => solfiPriceCoefficient('1844674408', 6, 6)).toThrow('too large');
  });
});

describe('buildPmmFairValueScenario', () => {
  it("writes both price fields to the SolFi SOL/USDC market's oracle", () => {
    const [market] = SOLFI_FAIR_VALUE.markets;
    const scenario = buildPmmFairValueScenario(SOLFI_FAIR_VALUE, market, '50');

    expect(scenario).toMatchObject({
      name: 'SolFi SOL / USDC fair value 50',
      tags: ['solfi', 'pmm', 'fair-value'],
      overrides: [
        {
          templateId: 'solfi-price',
          account: { pubkey: SOLFI_FEATURED_MARKETS[0].oracle },
          values: { price_exponent: -10, price_coefficient: toScenarioNumber('500000000') },
          fetchBeforeUse: true,
        },
      ],
    });
    expect(scenario.overrides).toHaveLength(1);
  });
});
