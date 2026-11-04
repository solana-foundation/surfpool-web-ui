import type { FeaturedProtocol } from './featured-accounts';

/** The BisonFi markets Studio offers as shortcuts; any other BisonFi v3 pool can be typed instead. */
export const BISONFI_FEATURED_MARKETS = [
  {
    id: 'sol-usdc-pool-2',
    label: 'SOL / USDC',
    market: '8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo',
    accountName: 'SOL-USDC-Pool2',
  },
  {
    id: 'desecz-usdc-pool-1',
    label: 'deSECZ / USDC',
    market: 'Hv8FoJFsrQhoyrR6Lcz4KFcpqNHU1Kxj2yaFDKU6vJdp',
    accountName: 'deSECZ-USDC-Pool1',
  },
  {
    id: 'cbbtc-usdc-pool-1',
    label: 'cbBTC / USDC',
    market: '2vPjbPRnz7V1SLGr56CmLLc7JspzfSfccWp3Th5KbrMJ',
    accountName: 'cbBTC-USDC-Pool1',
  },
  {
    id: 'sol-usdt-pool-2',
    label: 'SOL / USDT',
    market: 'FJnaiidSLXFweWkgbinxEHRykVHsnkzDcYbNDR3RF5LN',
    accountName: 'SOL-USDT-Pool2',
  },
] as const;

export const BISONFI_FEATURED: FeaturedProtocol = {
  protocol: 'bisonfi',
  templateIds: ['bisonfi-fair-value', 'bisonfi-depth', 'bisonfi-spread'],
  accounts: {
    label: 'BisonFi market',
    description: 'Pick a featured market or type any BisonFi v3 pool address.',
    options: BISONFI_FEATURED_MARKETS.map((market) => ({
      id: market.id,
      label: market.label,
      value: market.market,
      description: market.accountName,
    })),
  },
  aiContext: () =>
    [
      'Featured BisonFi markets available in Studio:',
      ...BISONFI_FEATURED_MARKETS.map(
        (market) => `- ${market.label}: pool ${market.market}; account name ${market.accountName}.`
      ),
    ].join('\n'),
};
