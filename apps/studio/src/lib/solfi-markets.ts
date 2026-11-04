import type { FeaturedAccounts, FeaturedProtocol } from './featured-accounts';

/** The SolFi markets Studio offers as shortcuts; any other SolFi account can be typed instead. */
export const SOLFI_FEATURED_MARKETS = [
  {
    id: 'sol-usdc',
    label: 'SOL / USDC',
    market: '65ZHSArs5XxPseKQbB1B4r16vDxMWnCxHMzogDAqiDUc',
    oracle: '2ny7eGyZCoeEVTkNLf5HcnJFBKkyA4p4gcrtb3b8y8ou',
    baseSymbol: 'SOL',
    baseVault: 'CRo8DBwrmd97DJfAnvCv96tZPL5Mktf2NZy2ZnhDer1A',
    quoteSymbol: 'USDC',
    quoteVault: 'GhFfLFSprPpfoRaWakPMmJTMJBHuz6C694jYwxy2dAic',
  },
  {
    id: 'usdt-usdc',
    label: 'USDT / USDC',
    market: 'FkEB6uvyzuoaGpgs4yRtFtxC4WJxhejNFbUkj5R6wR32',
    oracle: 'CyCUgmaCYUZxbux3J2svDzxSryVFMtZNPrnMKS41nc4G',
    baseSymbol: 'USDT',
    baseVault: '5bHD9xdEzJdkVuhs54mGPC9BZgUshqgMg4tqmTwhWggc',
    quoteSymbol: 'USDC',
    quoteVault: 'ARWaajRJyF6PKQryJ4HLzLBfTWM2qmVQUQVtBjk6PgPc',
  },
  {
    id: 'hype-usdc',
    label: 'HYPE / USDC',
    market: '2e25gRiddjn968aXrLt1oZw3BZ4fYD5D8mCv7uKxu1yL',
    oracle: '9WDWUT9tx9Z2DKgiuzSsPS3dEBTRnPrzpuWrMHaRgACU',
    baseSymbol: 'HYPE',
    baseVault: '7DEGUxRtaphAUcdwvZTjVUM2yUM7r3EVWu16FxRZrYjP',
    quoteSymbol: 'USDC',
    quoteVault: '7RhQGDQgSx3YrQHBjG2BVdZpm8c54o6uSW9p6ckyb8uQ',
  },
  {
    id: 'pump-usdc',
    label: 'PUMP / USDC',
    market: '2kfQuYG2FVZL2RqqKEttcdadbPWP4c7b6AFQztNcBWyV',
    oracle: '5VTjvi4XhRCXUSitDGJXVp5iZpU2sypNAT5EvEvaXR6j',
    baseSymbol: 'PUMP',
    baseVault: '8PbjFCfVNHH5PwP7xJj4JnGom397ybK3mLzw9164nZ4K',
    quoteSymbol: 'USDC',
    quoteVault: 'CMghWj6TEDfGTN5CSzo9p27kPMb73fsDPM22LqTe2C9y',
  },
] as const;

const solfiMarkets: FeaturedAccounts = {
  label: 'SolFi market',
  description: 'Pick a featured market or type any SolFi market address.',
  options: SOLFI_FEATURED_MARKETS.map((market) => ({
    id: market.id,
    label: market.label,
    value: market.market,
    description: 'Market account',
    inputs: { oracle: market.oracle },
  })),
};

const solfiOracles: FeaturedAccounts = {
  label: 'SolFi oracle',
  description: 'Pick a featured oracle or type any SolFi oracle address.',
  options: SOLFI_FEATURED_MARKETS.map((market) => ({
    id: market.id,
    label: market.label,
    value: market.oracle,
    description: 'Oracle account',
  })),
};

const solfiVaults: FeaturedAccounts = {
  label: 'SolFi vault',
  description: 'Pick a featured payout vault or type any SolFi vault address.',
  options: SOLFI_FEATURED_MARKETS.flatMap((market) => [
    {
      id: `${market.id}-base`,
      label: `${market.label} (${market.baseSymbol} vault)`,
      value: market.baseVault,
      description: 'Base payout vault',
      inputs: { oracle: market.oracle },
    },
    {
      id: `${market.id}-quote`,
      label: `${market.label} (${market.quoteSymbol} vault)`,
      value: market.quoteVault,
      description: 'Quote payout vault',
      inputs: { oracle: market.oracle },
    },
  ]),
};

export const SOLFI_FEATURED: FeaturedProtocol = {
  protocol: 'solfi',
  templates: {
    'solfi-price': solfiOracles,
    'solfi-size-impact': solfiMarkets,
    'solfi-swap-pressure': solfiMarkets,
    'solfi-vault-balance': solfiVaults,
  },
  aiContext: () =>
    [
      'Featured SolFi accounts available in Studio:',
      ...SOLFI_FEATURED_MARKETS.map(
        (market) =>
          `- ${market.label}: market ${market.market}; oracle ${market.oracle}; ` +
          `${market.baseSymbol} vault ${market.baseVault}; ` +
          `${market.quoteSymbol} vault ${market.quoteVault}.`
      ),
    ].join('\n'),
};
