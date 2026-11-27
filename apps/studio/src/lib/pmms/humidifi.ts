import { PublicKey } from '@solana/web3.js';
import type { FeaturedAccounts, FeaturedProtocol } from '../featured-accounts';
import type { PmmFairValueAdapter, PmmMarketOption } from '../pmm-fair-value';
import { listedSymbol, parseDecimalPrice, readDecimals, rpcResult, TEN, ZERO } from '../pmm-price';

/**
 * The HumidiFi markets Studio offers as shortcuts: the live markets with funded vaults. Any other
 * HumidiFi account can be typed instead.
 */
export const HUMIDIFI_FEATURED_MARKETS = [
  {
    id: 'sol-usdc',
    label: 'SOL / USDC',
    market: 'FksffEqnBRixYGR791Qw2MgdU7zNCpHVFYBL4Fa4qVuH',
    baseSymbol: 'SOL',
    baseMint: 'So11111111111111111111111111111111111111112',
    baseDecimals: 9,
    baseVault: 'C3FzbX9n1YD2dow2dCmEv5uNyyf22Gb3TLAEqGBhw5fY',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
    quoteVault: '3RWFAQBRkNGq7CMGcTLK3kXDgFTe9jgMeFYqk8nHwcWh',
  },
  {
    id: 'pengu-usdc',
    label: 'PENGU / USDC',
    market: '2866MvCKPGz9LdnPcmPueoV3mA2Ac1ceEQ8Xqb9VNefu',
    baseSymbol: 'PENGU',
    baseMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
    baseDecimals: 6,
    baseVault: '8UwYWkJ78uG7Cy8bZJURzwFfDUTX4oeiAriBQVWwmY8',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
    quoteVault: '6iNgLk2CUJYA6ZVTcaTeSQiaaUfUbYgZZShWCSsTTkPn',
  },
  {
    id: 'wet-usdc',
    label: 'WET / USDC',
    market: 'Cc2oMdeNDmZ7ZD8b7igQg1EHjBEinR1Vi6nx2VHpVm6H',
    baseSymbol: 'WET',
    baseMint: 'WETZjtprkDMCcUxPi9PfWnowMRZkiGGHDb9rABuRZ2U',
    baseDecimals: 6,
    baseVault: '7gxM8fzfJ331g1yddEDUDrz4BLwEEPPPcCDV57pDQWyT',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
    quoteVault: 'F9JdjxCTiyy9xB4BjvGQAzzxetVJQWAjWzAMxzMMD23D',
  },
  {
    id: 'pump-usdc',
    label: 'PUMP / USDC',
    market: 'HyKbc1vUxNL9xJC2Q44qdGiuKC1Ey95KNdokfHivrFnZ',
    baseSymbol: 'PUMP',
    baseMint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',
    baseDecimals: 6,
    baseVault: '7CdAWd32k1c9ywpyErij2xRbBDRCLFqrZAXTUjD3ziek',
    quoteSymbol: 'USDC',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteDecimals: 6,
    quoteVault: 'Cad4XrQrtXdKEhZKtWX5YAkwumUvphZKw1cqpYXYnZDr',
  },
] as const;

const humidifiMarkets: FeaturedAccounts = {
  label: 'HumidiFi market',
  description: 'Pick a featured market or type any HumidiFi market address.',
  options: HUMIDIFI_FEATURED_MARKETS.map((market) => ({
    id: market.id,
    label: market.label,
    value: market.market,
    description: 'Market account',
  })),
};

// A vault override keeps its market quoting through its `market` input, which a featured vault fills.
const humidifiVaults: FeaturedAccounts = {
  label: 'HumidiFi vault',
  description: 'Pick a featured payout vault or type any HumidiFi vault address.',
  options: HUMIDIFI_FEATURED_MARKETS.flatMap((market) => [
    {
      id: `${market.id}-base`,
      label: `${market.label} (${market.baseSymbol} vault)`,
      value: market.baseVault,
      description: 'Base payout vault',
      inputs: { market: market.market },
    },
    {
      id: `${market.id}-quote`,
      label: `${market.label} (${market.quoteSymbol} vault)`,
      value: market.quoteVault,
      description: 'Quote payout vault',
      inputs: { market: market.market },
    },
  ]),
};

export const HUMIDIFI_FEATURED: FeaturedProtocol = {
  protocol: 'humidifi',
  templates: {
    'humidifi-price': humidifiMarkets,
    'humidifi-spread': humidifiMarkets,
    'humidifi-vault-balance': humidifiVaults,
  },
  aiContext: () =>
    [
      'Featured HumidiFi accounts available in Studio:',
      ...HUMIDIFI_FEATURED_MARKETS.map(
        (market) =>
          `- ${market.label}: market ${market.market}; ` +
          `${market.baseSymbol} vault ${market.baseVault}; ` +
          `${market.quoteSymbol} vault ${market.quoteVault}.`
      ),
    ].join('\n'),
};

const U64_MAX = BigInt('18446744073709551615');
const TWO_POW_48 = BigInt(2) ** BigInt(48);

export function humidifiFairValue(price: string, baseDecimals: number, quoteDecimals: number): bigint {
  const { digits, scale } = parseDecimalPrice(price);
  const decimalsGap = baseDecimals - quoteDecimals;
  const numerator = digits * TWO_POW_48 * TEN ** BigInt(Math.max(0, -decimalsGap));
  const denominator = TEN ** BigInt(scale + Math.max(0, decimalsGap));
  const fairValue = numerator / denominator;
  if (fairValue === ZERO) throw new Error("Price is too small for this market's decimals");
  if (fairValue > U64_MAX) throw new Error("Price is too large for this market's decimals");
  return fairValue;
}

const HUMIDIFI_PROGRAM = '9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp';
const HUMIDIFI_MARKET_SIZE = 1728;
const HUMIDIFI_MARKET_TAG = [44, 90, 19, 124, 56, 111, 47, 150];
const HUMIDIFI_SCHEMA_8 = [8, 0, 0, 0, 0, 0, 0, 0];
// HumidiFi XORs each little-endian 8-byte word of a stored pubkey with its own fixed key.
const HUMIDIFI_PUBKEY_MASK = ['fb5ce87aae443c38', '04a2178451bac3c7', '04a1178751b9c3c6', '04a0178651b8c3c5'].flatMap(
  (word) => (word.match(/../g) ?? []).reverse().map((byte) => parseInt(byte, 16))
);

const base64Bytes = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const hasBytes = (data: Uint8Array, offset: number, expected: number[]) =>
  expected.every((byte, index) => data[offset + index] === byte);

const unmaskPubkey = (data: Uint8Array, offset: number) =>
  new PublicKey(HUMIDIFI_PUBKEY_MASK.map((mask, index) => data[offset + index] ^ mask)).toBase58();

export async function readHumidifiMarket(
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
  if (
    !value ||
    !data ||
    value.owner !== HUMIDIFI_PROGRAM ||
    data.length !== HUMIDIFI_MARKET_SIZE ||
    !hasBytes(data, 8, HUMIDIFI_MARKET_TAG) ||
    !hasBytes(data, 1720, HUMIDIFI_SCHEMA_8)
  ) {
    throw new Error(`${address} is not a HumidiFi market account`);
  }
  const [base, quote] = [416, 384].map((offset) => unmaskPubkey(data, offset));
  const mints = await rpcResult<{ value: ({ data: [string, string] } | null)[] }>(rpcUrl, 'getMultipleAccounts', [
    [base, quote],
    { encoding: 'base64' },
  ]);
  const [baseDecimals, quoteDecimals] = [base, quote].map((mint, index) => {
    const account = mints.value[index];
    if (!account) throw new Error(`Mint ${mint} of HumidiFi market ${address} was not found`);
    return base64Bytes(account.data[0])[44];
  });
  const [baseSymbol, quoteSymbol] = [base, quote].map((mint) => listedSymbol(mint, listed));
  return {
    label: `${baseSymbol} / ${quoteSymbol}`,
    value: address,
    metadata: {
      pair: `${baseSymbol}/${quoteSymbol}`,
      base_mint: base,
      quote_mint: quote,
      base_decimals: baseDecimals,
      quote_decimals: quoteDecimals,
    },
  };
}

export const HUMIDIFI_FAIR_VALUE: PmmFairValueAdapter = {
  protocol: 'humidifi',
  label: 'HumidiFi',
  marketTemplateId: 'humidifi-price',
  markets: HUMIDIFI_FEATURED_MARKETS.map((market) => ({
    label: market.label,
    value: market.market,
    metadata: {
      pair: `${market.baseSymbol}/${market.quoteSymbol}`,
      base_mint: market.baseMint,
      quote_mint: market.quoteMint,
      base_decimals: market.baseDecimals,
      quote_decimals: market.quoteDecimals,
    },
  })),
  buildOverrides: (market, price) => {
    const fairValue = humidifiFairValue(
      price,
      readDecimals(market, 'base_decimals'),
      readDecimals(market, 'quote_decimals')
    );
    // Surfpool keeps the quote current from the slot the price plays, so the price is all it takes.
    return [
      {
        templateId: 'humidifi-price',
        label: 'HumidiFi fair value',
        account: { pubkey: market.value },
        values: { fair_value: fairValue },
      },
    ];
  },
  readMarket: readHumidifiMarket,
};
