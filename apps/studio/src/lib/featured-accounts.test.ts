import { describe, expect, it } from 'vitest';
import {
  featuredAccountInputs,
  getFeaturedAccounts,
  getProtocolAiContext,
  resolveFeaturedAccount,
} from './featured-accounts';
import { BISONFI_FEATURED_MARKETS } from './pmms/bisonfi';
import { HUMIDIFI_FEATURED_MARKETS } from './pmms/humidifi';

const [sol] = HUMIDIFI_FEATURED_MARKETS;
const [bisonSol] = BISONFI_FEATURED_MARKETS;
const values = (templateId: string) => getFeaturedAccounts(templateId)?.options.map((option) => option.value);

describe('getFeaturedAccounts', () => {
  it('offers each HumidiFi template the account it writes', () => {
    expect(values('humidifi-price')?.[0]).toBe(sol.market);
    expect(values('humidifi-spread')?.[0]).toBe(sol.market);
    expect(values('humidifi-vault-balance')?.slice(0, 2)).toEqual([sol.baseVault, sol.quoteVault]);
    expect(values('humidifi-vault-balance')).toHaveLength(2 * HUMIDIFI_FEATURED_MARKETS.length);
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
    expect(resolveFeaturedAccount('humidifi-price', { pubkey: '' }, ` ${sol.market} `)).toEqual({ pubkey: sol.market });
    expect(resolveFeaturedAccount('humidifi-price', { pubkey: '' }, '   ')).toBeUndefined();
    expect(resolveFeaturedAccount('bisonfi-spread', { pubkey: '' }, ` ${bisonSol.market} `)).toEqual({
      pubkey: bisonSol.market,
    });
    expect(resolveFeaturedAccount('bisonfi-depth', { pubkey: '' }, '   ')).toBeUndefined();
    expect(resolveFeaturedAccount('kamino-reserve-config', pda, '')).toBe(pda);
  });
});

describe('featuredAccountInputs', () => {
  it('fills the market a featured HumidiFi vault belongs to', () => {
    expect(featuredAccountInputs('humidifi-vault-balance', sol.baseVault)).toEqual({ market: sol.market });
    expect(featuredAccountInputs('humidifi-vault-balance', sol.quoteVault)).toEqual({ market: sol.market });
  });

  it('clears the market for a typed vault and fills nothing for a market template', () => {
    expect(featuredAccountInputs('humidifi-vault-balance', '9NkuAWB4LgCVFV77omEkJEjXqgV5PGupwMTu3B3pBRhc')).toEqual({
      market: undefined,
    });
    expect(featuredAccountInputs('humidifi-price', sol.market)).toEqual({});
  });

  it('fills nothing, since a BisonFi pool keeps itself alive', () => {
    expect(featuredAccountInputs('bisonfi-depth', bisonSol.market)).toEqual({});
  });
});

describe('getProtocolAiContext', () => {
  it("returns a registered protocol's context and nothing for any other protocol", () => {
    expect(getProtocolAiContext('humidifi')).toContain(sol.quoteVault);
    expect(getProtocolAiContext('bisonfi')).toContain(bisonSol.market);
    expect(getProtocolAiContext('kamino')).toBeUndefined();
  });
});
