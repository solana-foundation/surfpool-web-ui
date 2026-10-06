import { describe, expect, it } from 'vitest';
import {
  BISONFI_MARKET_OPTIONS,
  resolveBisonFiAccount,
  resolveTokenSelectorOptions,
  type TokenSelectorOption,
} from './token-selector-options';

const catalogOptions: TokenSelectorOption[] = [
  { id: 'catalog-token', label: 'Catalog token', value: 'CatalogMintpump' },
  { id: 'hex-value', label: 'Hex value', value: '0xAbCd' },
];

describe('resolveTokenSelectorOptions', () => {
  it('preserves a custom current value outside the catalog', () => {
    const result = resolveTokenSelectorOptions(catalogOptions, 'CustomMintpump');
    const reselected = resolveTokenSelectorOptions(catalogOptions, result.selectedOption?.value);

    expect(result.selectedOption).toMatchObject({
      id: 'custom-CustomMintpump',
      value: 'CustomMintpump',
    });
    expect(result.options[0]).toBe(result.selectedOption);
    expect(result.options.slice(1)).toEqual(catalogOptions);
    expect(reselected.selectedOption).toEqual(result.selectedOption);
  });

  it('reuses the catalog option for a catalog value', () => {
    const result = resolveTokenSelectorOptions(catalogOptions, 'CatalogMintpump');

    expect(result.selectedOption).toBe(catalogOptions[0]);
    expect(result.options).toBe(catalogOptions);
  });

  it('matches hex values case-insensitively', () => {
    const result = resolveTokenSelectorOptions(catalogOptions, '0xabcd');

    expect(result.selectedOption).toBe(catalogOptions[1]);
    expect(result.options).toBe(catalogOptions);
  });
});

describe('BisonFi market selection', () => {
  it('offers four distinct market accounts', () => {
    expect(BISONFI_MARKET_OPTIONS).toHaveLength(4);
    expect(new Set(BISONFI_MARKET_OPTIONS.map((option) => option.value)).size).toBe(4);
  });

  it('uses the selected account for BisonFi without changing other templates', () => {
    expect(resolveBisonFiAccount('bisonfi-spread', { pubkey: '' }, ' CustomPool111 ')).toEqual({
      pubkey: 'CustomPool111',
    });
    expect(resolveBisonFiAccount('pyth-price', { pubkey: 'PythAccount' }, 'CustomPool111')).toEqual({
      pubkey: 'PythAccount',
    });
    expect(resolveBisonFiAccount('bisonfi-depth', { pubkey: '' }, '   ')).toBeUndefined();
  });
});
