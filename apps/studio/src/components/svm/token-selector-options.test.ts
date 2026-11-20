import { describe, expect, it } from 'vitest';
import {
  resolveTokenSelectorOptions,
  shouldUseConstantCombobox,
  type TokenSelectorOption,
  typedAccountOption,
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

describe('shouldUseConstantCombobox', () => {
  it('uses the shared searchable protocol selector for account choices of any size', () => {
    expect(shouldUseConstantCombobox(2, true)).toBe(true);
  });

  it('preserves the existing threshold for ordinary constant fields', () => {
    expect(shouldUseConstantCombobox(2, false)).toBe(false);
    expect(shouldUseConstantCombobox(21, false)).toBe(true);
  });
});

describe('typedAccountOption', () => {
  it('offers only a typed address the picker does not list', () => {
    const market = 'FLckHLGMJy5gEoXWwcE68Nprde1D4araK4TGLw4pQq2n';
    const unlisted = '9NkuAWB4LgCVFV77omEkJEjXqgV5PGupwMTu3B3pBRhc';
    const listed: TokenSelectorOption[] = [{ id: market, label: 'SOL / USDC', value: market }];

    expect(typedAccountOption(unlisted, listed)).toMatchObject({ label: 'Custom address', value: unlisted });
    expect(typedAccountOption(market, listed)).toBeNull();
    expect(typedAccountOption('SOL / USDC', listed)).toBeNull();
  });
});
