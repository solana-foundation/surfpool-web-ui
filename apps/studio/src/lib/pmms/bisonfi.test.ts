import { describe, expect, it } from 'vitest';
import { buildPmmFairValueScenario } from '../pmm-fair-value';
import { BISONFI_FAIR_VALUE, BISONFI_FEATURED_MARKETS, bisonfiFairValue } from './bisonfi';

describe('bisonfiFairValue', () => {
  // The template's "SOL is worth $50" example, and exact maths where its $75.45 example is float-rounded.
  it.each([
    ['50', BigInt('15474250491067253436239052800')],
    ['75.45', BigInt('23350643991020485435284730675')],
    ['1.5', BigInt('464227514732017603087171584')],
  ])('scales %s by 2^88', (price, expected) => {
    expect(bisonfiFairValue(price)).toBe(expected);
  });

  it('rejects a price beyond u128 and one that truncates to zero', () => {
    expect(bisonfiFairValue('1099511627775')).toBe(BigInt(2) ** BigInt(128) - BigInt(2) ** BigInt(88));
    expect(() => bisonfiFairValue('1099511627776')).toThrow('too large');
    expect(() => bisonfiFairValue('0.000000000000000000000000001')).toThrow('too small');
  });
});

describe('buildPmmFairValueScenario', () => {
  it('writes the SOL/USDC pool fair value as a decimal string', () => {
    const [market] = BISONFI_FAIR_VALUE.markets;
    const scenario = buildPmmFairValueScenario(BISONFI_FAIR_VALUE, market, '50');

    expect(scenario).toMatchObject({
      name: 'BisonFi SOL / USDC fair value 50',
      tags: ['bisonfi', 'pmm', 'fair-value'],
      overrides: [
        {
          templateId: 'bisonfi-fair-value',
          account: { pubkey: BISONFI_FEATURED_MARKETS[0].market },
          values: { fair_value: '15474250491067253436239052800' },
          fetchBeforeUse: true,
        },
      ],
    });
    expect(scenario.overrides).toHaveLength(1);
  });
});
