import { PublicKey } from '@solana/web3.js';
import type { FeaturedAccounts, FeaturedProtocol } from '../featured-accounts';
import type { PmmFairValueAdapter, PmmMarketOption } from '../pmm-fair-value';
import { listedSymbol, parseDecimalPrice, rpcResult, TEN, ZERO } from '../pmm-price';

/** The BisonFi markets Studio offers as shortcuts; any other BisonFi v3 pool can be typed instead. */
export const BISONFI_FEATURED_MARKETS = [
  {
    id: 'sol-usdc-pool-2',
    label: 'SOL / USDC',
    market: '8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo',
    accountName: 'SOL-USDC-Pool2',
    baseSymbol: 'SOL',
    baseMint: 'So11111111111111111111111111111111111111112',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  {
    id: 'wheth-usdc-pool-1',
    label: 'whETH / USDC',
    market: 'AfaA4CE8C2DWSHANCqvU9RWrxRiXCV7KKVSw4cHi68Wn',
    accountName: 'whETH-USDC-Pool1',
    baseSymbol: 'whETH',
    baseMint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  {
    id: 'cbbtc-usdc-pool-1',
    label: 'cbBTC / USDC',
    market: '2vPjbPRnz7V1SLGr56CmLLc7JspzfSfccWp3Th5KbrMJ',
    accountName: 'cbBTC-USDC-Pool1',
    baseSymbol: 'cbBTC',
    baseMint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  {
    id: 'sol-usdt-pool-2',
    label: 'SOL / USDT',
    market: 'FJnaiidSLXFweWkgbinxEHRykVHsnkzDcYbNDR3RF5LN',
    accountName: 'SOL-USDT-Pool2',
    baseSymbol: 'SOL',
    baseMint: 'So11111111111111111111111111111111111111112',
    quoteSymbol: 'USDT',
    quoteMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
] as const;

const bisonfiMarkets: FeaturedAccounts = {
  label: 'BisonFi market',
  description: 'Pick a featured market or type any BisonFi v3 pool address.',
  options: BISONFI_FEATURED_MARKETS.map((market) => ({
    id: market.id,
    label: market.label,
    value: market.market,
    description: market.accountName,
  })),
};

export const BISONFI_FEATURED: FeaturedProtocol = {
  protocol: 'bisonfi',
  templates: {
    'bisonfi-fair-value': bisonfiMarkets,
    'bisonfi-depth': bisonfiMarkets,
    'bisonfi-spread': bisonfiMarkets,
  },
  aiContext: () =>
    [
      'Featured BisonFi markets available in Studio:',
      ...BISONFI_FEATURED_MARKETS.map(
        (market) => `- ${market.label}: pool ${market.market}; account name ${market.accountName}.`
      ),
    ].join('\n'),
};

// BisonFi's mid is the human price as a fixed-point u128 scaled by 2^88, independent of the mints' decimals.
const TWO_POW_88 = BigInt(2) ** BigInt(88);
const U128_MAX = BigInt(2) ** BigInt(128) - BigInt(1);

export function bisonfiFairValue(price: string): bigint {
  const { digits, scale } = parseDecimalPrice(price);
  const fairValue = (digits * TWO_POW_88) / TEN ** BigInt(scale);
  if (fairValue === ZERO) throw new Error('Price is too small for BisonFi');
  if (fairValue > U128_MAX) throw new Error('Price is too large for BisonFi');
  return fairValue;
}

const BISONFI_PROGRAM = 'BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi';
// A pool account starts with "POOLSTAT" and its little-endian u64 layout version, 3.
const BISONFI_POOL_TAG = [...'POOLSTAT'].map((char) => char.charCodeAt(0)).concat([3, 0, 0, 0, 0, 0, 0, 0]);

// Reads a typed pool and the mints at bytes 184..248 that name its pair.
export async function readBisonfiMarket(
  rpcUrl: string,
  address: string,
  listed: PmmMarketOption[]
): Promise<PmmMarketOption> {
  const { value } = await rpcResult<{ value: { owner: string; data: [string, string] } | null }>(
    rpcUrl,
    'getAccountInfo',
    [address, { encoding: 'base64' }]
  );
  const data = value ? Uint8Array.from(atob(value.data[0]), (char) => char.charCodeAt(0)) : null;
  const tagged = !!data && BISONFI_POOL_TAG.every((byte, index) => data[index] === byte);
  if (!value || !data || value.owner !== BISONFI_PROGRAM || data.length < 848 || !tagged) {
    throw new Error(`${address} is not a BisonFi v3 pool account`);
  }
  const [base, quote] = [184, 216].map((offset) => new PublicKey(data.slice(offset, offset + 32)).toBase58());
  const [baseSymbol, quoteSymbol] = [base, quote].map((mint) => listedSymbol(mint, listed));
  return {
    label: `${baseSymbol} / ${quoteSymbol}`,
    value: address,
    metadata: { pair: `${baseSymbol}/${quoteSymbol}`, base_mint: base, quote_mint: quote },
  };
}

export const BISONFI_FAIR_VALUE: PmmFairValueAdapter = {
  protocol: 'bisonfi',
  label: 'BisonFi',
  marketTemplateId: 'bisonfi-fair-value',
  markets: BISONFI_FEATURED_MARKETS.map((market) => ({
    label: market.label,
    value: market.market,
    metadata: {
      pair: `${market.baseSymbol}/${market.quoteSymbol}`,
      base_mint: market.baseMint,
      quote_mint: market.quoteMint,
    },
  })),
  buildOverrides: (market, price) => [
    // Surfpool republishes the pool's quote every slot, so the price is all it takes. A u128 past u64 is
    // read only from a decimal string.
    {
      templateId: 'bisonfi-fair-value',
      label: 'BisonFi fair value',
      account: { pubkey: market.value },
      values: { fair_value: bisonfiFairValue(price).toString() },
    },
  ],
  readMarket: readBisonfiMarket,
};
