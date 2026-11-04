import { describe, expect, it } from 'vitest';
import { BISONFI_FEATURED_MARKETS } from './bisonfi-markets';
import { getFeaturedAccounts, getProtocolAiContext, resolveFeaturedAccount } from './featured-accounts';

describe('getFeaturedAccounts', () => {
  const [sol] = BISONFI_FEATURED_MARKETS;
  const values = (templateId: string) => getFeaturedAccounts(templateId)?.options.map((option) => option.value);

  it('offers every BisonFi template the featured pools it writes', () => {
    for (const templateId of ['bisonfi-fair-value', 'bisonfi-depth', 'bisonfi-spread']) {
      expect(values(templateId)).toEqual(BISONFI_FEATURED_MARKETS.map((market) => market.market));
    }
    expect(new Set(values('bisonfi-fair-value')).size).toBe(BISONFI_FEATURED_MARKETS.length);
    expect(getFeaturedAccounts('kamino-reserve-config')).toBeUndefined();
    expect(getFeaturedAccounts('constructor')).toBeUndefined();
  });

  it("saves the picked account for a featured template and keeps other templates' addresses", () => {
    const pda = { pda: { programId: 'program', seeds: [] } };
    expect(resolveFeaturedAccount('bisonfi-spread', { pubkey: '' }, ` ${sol.market} `)).toEqual({ pubkey: sol.market });
    expect(resolveFeaturedAccount('bisonfi-depth', { pubkey: '' }, '   ')).toBeUndefined();
    expect(resolveFeaturedAccount('kamino-reserve-config', pda, '')).toBe(pda);
  });
});

describe('getProtocolAiContext', () => {
  it("returns a registered protocol's context and nothing for any other protocol", () => {
    expect(getProtocolAiContext('bisonfi')).toContain(BISONFI_FEATURED_MARKETS[0].market);
    expect(getProtocolAiContext('kamino')).toBeUndefined();
  });
});
