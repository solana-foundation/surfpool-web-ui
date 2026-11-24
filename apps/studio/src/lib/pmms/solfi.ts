import { PublicKey } from '@solana/web3.js';
import type { FeaturedAccounts, FeaturedProtocol } from '../featured-accounts';
import type { PmmFairValueAdapter, PmmMarketOption } from '../pmm-fair-value';
import { listedSymbol, readDecimals, readPubkey, rpcResult, scaleDecimal } from '../pmm-price';

/** The SolFi markets Studio offers as shortcuts; any other SolFi account can be typed instead. */
export const SOLFI_FEATURED_MARKETS = [
  {
    id: 'sol-usdc',
    label: 'SOL / USDC',
    market: '65ZHSArs5XxPseKQbB1B4r16vDxMWnCxHMzogDAqiDUc',
    oracle: '2ny7eGyZCoeEVTkNLf5HcnJFBKkyA4p4gcrtb3b8y8ou',
    baseSymbol: 'SOL',
    baseMint: 'So11111111111111111111111111111111111111112',
    baseDecimals: 9,
    baseVault: 'CRo8DBwrmd97DJfAnvCv96tZPL5Mktf2NZy2ZnhDer1A',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
    quoteVault: 'GhFfLFSprPpfoRaWakPMmJTMJBHuz6C694jYwxy2dAic',
  },
  {
    id: 'usdt-usdc',
    label: 'USDT / USDC',
    market: 'FkEB6uvyzuoaGpgs4yRtFtxC4WJxhejNFbUkj5R6wR32',
    oracle: 'CyCUgmaCYUZxbux3J2svDzxSryVFMtZNPrnMKS41nc4G',
    baseSymbol: 'USDT',
    baseMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    baseDecimals: 6,
    baseVault: '5bHD9xdEzJdkVuhs54mGPC9BZgUshqgMg4tqmTwhWggc',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
    quoteVault: 'ARWaajRJyF6PKQryJ4HLzLBfTWM2qmVQUQVtBjk6PgPc',
  },
  {
    id: 'hype-usdc',
    label: 'HYPE / USDC',
    market: '2e25gRiddjn968aXrLt1oZw3BZ4fYD5D8mCv7uKxu1yL',
    oracle: '9WDWUT9tx9Z2DKgiuzSsPS3dEBTRnPrzpuWrMHaRgACU',
    baseSymbol: 'HYPE',
    baseMint: '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g',
    baseDecimals: 9,
    baseVault: '7DEGUxRtaphAUcdwvZTjVUM2yUM7r3EVWu16FxRZrYjP',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
    quoteVault: '7RhQGDQgSx3YrQHBjG2BVdZpm8c54o6uSW9p6ckyb8uQ',
  },
  {
    id: 'pump-usdc',
    label: 'PUMP / USDC',
    market: '2kfQuYG2FVZL2RqqKEttcdadbPWP4c7b6AFQztNcBWyV',
    oracle: '5VTjvi4XhRCXUSitDGJXVp5iZpU2sypNAT5EvEvaXR6j',
    baseSymbol: 'PUMP',
    baseMint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',
    baseDecimals: 6,
    baseVault: '8PbjFCfVNHH5PwP7xJj4JnGom397ybK3mLzw9164nZ4K',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
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

// SolFi prices from its oracle: human price = coefficient * 10^exponent * 10^(base_decimals - quote_decimals).
// The preset always writes exponent -10, as the template's examples do, so a price takes up to 10 decimals
// adjusted by the market's decimals gap.
const SOLFI_PRICE_EXPONENT = -10;
const U64_MAX = BigInt('18446744073709551615');

export function solfiPriceCoefficient(price: string, baseDecimals: number, quoteDecimals: number): bigint {
  const coefficient = scaleDecimal(price, -SOLFI_PRICE_EXPONENT - (baseDecimals - quoteDecimals));
  if (coefficient > U64_MAX) throw new Error("Price is too large for this market's decimals");
  return coefficient;
}

const SOLFI_PROGRAM = 'SV2EYYJyRz2YhfXwXnhNAevDEui5Q6yrfyo13WtupPF';
const SOLFI_ORACLE_PROGRAM = 'E2uCGJ4TtYyKPGaK57UMfbs9sgaumwDEZF1aAY6fF3mS';
const SOLFI_ORACLE_SIZE = 168;

type RpcAccount = {
  owner: string;
  data: [string, string] | { parsed?: { info?: { mint?: string; decimals?: number } } };
} | null;

const base64Bytes = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const parsedInfo = (account: RpcAccount) => (Array.isArray(account?.data) ? undefined : account?.data.parsed?.info);

// Reads a typed market: its oracle at bytes 24..56, and the mints and decimals behind its vaults at 120..184.
export async function readSolfiMarket(
  rpcUrl: string,
  address: string,
  listed: PmmMarketOption[]
): Promise<PmmMarketOption> {
  const { value } = await rpcResult<{ value: { owner: string; data: [string, string] } | null }>(
    rpcUrl,
    'getAccountInfo',
    [address, { encoding: 'base64' }]
  );
  const data = value ? base64Bytes(value.data[0]) : null;
  if (!value || !data || value.owner !== SOLFI_PROGRAM || data.length < 184) {
    throw new Error(`${address} is not a SolFi market account`);
  }
  const [oracle, baseVault, quoteVault] = [24, 120, 152].map((offset) =>
    new PublicKey(data.slice(offset, offset + 32)).toBase58()
  );

  const accounts = await rpcResult<{ value: RpcAccount[] }>(rpcUrl, 'getMultipleAccounts', [
    [oracle, baseVault, quoteVault],
    { encoding: 'jsonParsed' },
  ]);
  const [oracleAccount, ...vaults] = accounts.value;
  const oracleData = oracleAccount && Array.isArray(oracleAccount.data) ? base64Bytes(oracleAccount.data[0]) : null;
  if (oracleAccount?.owner !== SOLFI_ORACLE_PROGRAM || oracleData?.length !== SOLFI_ORACLE_SIZE) {
    throw new Error(`The oracle ${oracle} of ${address} is not a SolFi oracle`);
  }
  const [base, quote] = vaults.map((vault) => parsedInfo(vault)?.mint);
  if (!base || !quote) throw new Error(`The vaults of ${address} were not found on this surfnet`);

  const mints = await rpcResult<{ value: RpcAccount[] }>(rpcUrl, 'getMultipleAccounts', [
    [base, quote],
    { encoding: 'jsonParsed' },
  ]);
  const [baseDecimals, quoteDecimals] = mints.value.map((mint) => parsedInfo(mint)?.decimals);
  if (baseDecimals === undefined || quoteDecimals === undefined) {
    throw new Error(`The mints of ${address} have no decimals on this surfnet`);
  }
  const [baseSymbol, quoteSymbol] = [base, quote].map((mint) => listedSymbol(mint, listed));
  return {
    label: `${baseSymbol} / ${quoteSymbol}`,
    value: address,
    metadata: {
      oracle,
      pair: `${baseSymbol}/${quoteSymbol}`,
      base_mint: base,
      quote_mint: quote,
      base_decimals: baseDecimals,
      quote_decimals: quoteDecimals,
    },
  };
}

export const SOLFI_FAIR_VALUE: PmmFairValueAdapter = {
  protocol: 'solfi',
  label: 'SolFi',
  marketTemplateId: 'solfi-price',
  markets: SOLFI_FEATURED_MARKETS.map((market) => ({
    label: market.label,
    value: market.market,
    metadata: {
      oracle: market.oracle,
      pair: `${market.baseSymbol}/${market.quoteSymbol}`,
      base_mint: market.baseMint,
      quote_mint: market.quoteMint,
      base_decimals: market.baseDecimals,
      quote_decimals: market.quoteDecimals,
    },
  })),
  buildOverrides: (market, price) => {
    const coefficient = solfiPriceCoefficient(
      price,
      readDecimals(market, 'base_decimals'),
      readDecimals(market, 'quote_decimals')
    );
    // The price lives on the market's oracle, which Surfpool republishes every slot, so the price is all it takes.
    return [
      {
        templateId: 'solfi-price',
        label: 'SolFi fair value',
        account: { pubkey: readPubkey(market, 'oracle') },
        values: { price_exponent: BigInt(SOLFI_PRICE_EXPONENT), price_coefficient: coefficient },
      },
    ];
  },
  readMarket: readSolfiMarket,
};
