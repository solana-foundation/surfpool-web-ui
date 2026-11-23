import { describe, expect, it } from 'vitest';
import {
  featuredAccountInputs,
  getFeaturedAccounts,
  getProtocolAiContext,
  resolveFeaturedAccount,
} from './featured-accounts';
import { BISONFI_FEATURED_MARKETS } from './pmms/bisonfi';
import { GOONFI_FEATURED_MARKETS } from './pmms/goonfi';

const [sol, hype] = GOONFI_FEATURED_MARKETS;
const [bisonSol] = BISONFI_FEATURED_MARKETS;
const values = (templateId: string) => getFeaturedAccounts(templateId)?.options.map((option) => option.value);

describe('getFeaturedAccounts', () => {
  it('offers each GoonFi template the account kind it writes', () => {
    const markets = GOONFI_FEATURED_MARKETS.map((market) => market.market);
    expect(values('goonfi-reference-band')).toEqual(markets);
    expect(values('goonfi-size-impact')).toEqual(markets);
    expect(values('goonfi-price')).toEqual(GOONFI_FEATURED_MARKETS.map((market) => market.oracle));
    expect(values('goonfi-vault-balance')).toEqual(
      GOONFI_FEATURED_MARKETS.flatMap((market) => [market.baseVault, market.quoteVault])
    );
    expect(getFeaturedAccounts('kamino-reserve-config')).toBeUndefined();
    expect(getFeaturedAccounts('constructor')).toBeUndefined();
  });

  it('offers every BisonFi template the featured pools it writes', () => {
    for (const templateId of ['bisonfi-fair-value', 'bisonfi-depth', 'bisonfi-spread']) {
      expect(values(templateId)).toEqual(BISONFI_FEATURED_MARKETS.map((market) => market.market));
    }
    expect(new Set(values('bisonfi-fair-value')).size).toBe(BISONFI_FEATURED_MARKETS.length);
  });

  it("saves the picked account for a featured template and keeps other templates' addresses", () => {
    const pda = { pda: { programId: 'program', seeds: [] } };
    expect(resolveFeaturedAccount('goonfi-price', { pubkey: '' }, ` ${sol.oracle} `)).toEqual({ pubkey: sol.oracle });
    expect(resolveFeaturedAccount('goonfi-size-impact', { pubkey: '' }, '   ')).toBeUndefined();
    expect(resolveFeaturedAccount('bisonfi-spread', { pubkey: '' }, ` ${bisonSol.market} `)).toEqual({
      pubkey: bisonSol.market,
    });
    expect(resolveFeaturedAccount('bisonfi-depth', { pubkey: '' }, '   ')).toBeUndefined();
    expect(resolveFeaturedAccount('kamino-reserve-config', pda, '')).toBe(pda);
  });
});

describe('featuredAccountInputs', () => {
  it("fills the oracle of a featured market or vault's market", () => {
    expect(featuredAccountInputs('goonfi-reference-band', hype.market)).toEqual({ oracle: hype.oracle });
    expect(featuredAccountInputs('goonfi-vault-balance', sol.baseVault)).toEqual({ oracle: sol.oracle });
  });

  it('clears the oracle for a typed account and fills nothing for the oracle template', () => {
    expect(featuredAccountInputs('goonfi-size-impact', '9NkuAWB4LgCVFV77omEkJEjXqgV5PGupwMTu3B3pBRhc')).toEqual({
      oracle: undefined,
    });
    expect(featuredAccountInputs('goonfi-price', sol.oracle)).toEqual({});
  });

  it('fills nothing, since a BisonFi pool keeps itself alive', () => {
    expect(featuredAccountInputs('bisonfi-depth', bisonSol.market)).toEqual({});
  });
});

describe('getProtocolAiContext', () => {
  it("returns a registered protocol's context and nothing for any other protocol", () => {
    expect(getProtocolAiContext('goonfi')).toContain(sol.oracle);
    expect(getProtocolAiContext('bisonfi')).toContain(bisonSol.market);
    expect(getProtocolAiContext('kamino')).toBeUndefined();
  });
});
