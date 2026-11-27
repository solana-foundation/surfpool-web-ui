import { describe, expect, it } from 'vitest';
import { goonfiPriceX1e6 } from './goonfi';

describe('goonfiPriceX1e6', () => {
  it.each([
    ['99.74', BigInt('99740000')],
    ['1.0001', BigInt('1000100')],
    ['150', BigInt('150000000')],
  ])('scales %s to quote per base times 10^6', (price, expected) => {
    expect(goonfiPriceX1e6(price)).toBe(expected);
  });

  it('accepts up to u64 max with 6 decimals and rejects anything beyond', () => {
    expect(goonfiPriceX1e6('18446744073709.551615')).toBe(BigInt('18446744073709551615'));
    expect(() => goonfiPriceX1e6('18446744073710')).toThrow('too large');
    expect(() => goonfiPriceX1e6('1.0000001')).toThrow('at most 6');
  });
});
