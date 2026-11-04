import { describe, expect, it } from 'vitest';
import {
  featuredAccountInputs,
  getFeaturedAccounts,
  getProtocolAiContext,
  resolveFeaturedAccount,
} from './featured-accounts';
import { SOLFI_FEATURED_MARKETS } from './solfi-markets';

const [sol, usdt] = SOLFI_FEATURED_MARKETS;
const values = (templateId: string) => getFeaturedAccounts(templateId)?.options.map((option) => option.value);

describe('getFeaturedAccounts', () => {
  it('offers each SolFi template the account kind it writes', () => {
    const markets = SOLFI_FEATURED_MARKETS.map((market) => market.market);
    expect(values('solfi-size-impact')).toEqual(markets);
    expect(values('solfi-swap-pressure')).toEqual(markets);
    expect(values('solfi-price')).toEqual(SOLFI_FEATURED_MARKETS.map((market) => market.oracle));
    expect(values('solfi-vault-balance')).toEqual(
      SOLFI_FEATURED_MARKETS.flatMap((market) => [market.baseVault, market.quoteVault])
    );
    expect(getFeaturedAccounts('kamino-reserve-config')).toBeUndefined();
    expect(getFeaturedAccounts('constructor')).toBeUndefined();
  });

  it("saves the picked account for a featured template and keeps other templates' addresses", () => {
    const pda = { pda: { programId: 'program', seeds: [] } };
    expect(resolveFeaturedAccount('solfi-price', { pubkey: '' }, ` ${sol.oracle} `)).toEqual({ pubkey: sol.oracle });
    expect(resolveFeaturedAccount('solfi-size-impact', { pubkey: '' }, '   ')).toBeUndefined();
    expect(resolveFeaturedAccount('kamino-reserve-config', pda, '')).toBe(pda);
  });
});

describe('featuredAccountInputs', () => {
  it("fills the oracle of a featured market or vault's market", () => {
    expect(featuredAccountInputs('solfi-size-impact', usdt.market)).toEqual({ oracle: usdt.oracle });
    expect(featuredAccountInputs('solfi-vault-balance', sol.quoteVault)).toEqual({ oracle: sol.oracle });
  });

  it('clears the oracle for a typed account and fills nothing for a template whose accounts name none', () => {
    expect(featuredAccountInputs('solfi-size-impact', '9NkuAWB4LgCVFV77omEkJEjXqgV5PGupwMTu3B3pBRhc')).toEqual({
      oracle: undefined,
    });
    expect(featuredAccountInputs('solfi-price', sol.oracle)).toEqual({});
    expect(featuredAccountInputs('kamino-reserve-config', sol.market)).toEqual({});
  });
});

describe('getProtocolAiContext', () => {
  it("returns a registered protocol's context and nothing for any other protocol", () => {
    expect(getProtocolAiContext('solfi')).toContain(sol.quoteVault);
    expect(getProtocolAiContext('kamino')).toBeUndefined();
  });
});
