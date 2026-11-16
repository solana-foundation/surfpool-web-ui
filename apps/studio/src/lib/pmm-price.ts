import { truncateAddress } from './address-utils';
import type { PmmMarketOption } from './pmm-fair-value';

// Helpers every PMM fair-value adapter uses. They live apart from pmm-fair-value.ts, which registers the
// adapters, so an adapter importing them never imports the registry back.

export const ZERO = BigInt(0);
export const TEN = BigInt(10);
const PRICE_PATTERN = /^\d+(?:\.\d+)?$/;

export function isValidPmmPrice(price: string): boolean {
  const normalized = price.trim();
  return PRICE_PATTERN.test(normalized) && /[1-9]/.test(normalized);
}

export function parseDecimalPrice(price: string): { digits: bigint; scale: number } {
  const normalized = price.trim();
  if (!isValidPmmPrice(normalized)) throw new Error('Price must be a positive decimal number');
  const [whole, fraction = ''] = normalized.split('.');
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

export function scaleDecimal(price: string, exponent: number): bigint {
  const { digits, scale } = parseDecimalPrice(price);
  const shift = exponent - scale;
  if (shift >= 0) return digits * TEN ** BigInt(shift);
  const divisor = TEN ** BigInt(-shift);
  if (digits % divisor !== ZERO) {
    throw new Error(`Price has more decimals than this market supports, at most ${Math.max(exponent, 0)}`);
  }
  return digits / divisor;
}

export async function rpcResult<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} failed: ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message ?? `${method} failed`);
  return body.result as T;
}

export const listedSymbol = (mint: string, listed: PmmMarketOption[]) => {
  for (const { metadata } of listed) {
    const [base, quote] = String(metadata?.pair ?? '').split('/');
    if (metadata?.base_mint === mint && base) return base;
    if (metadata?.quote_mint === mint && quote) return quote;
  }
  return truncateAddress(mint);
};

export function readDecimals(market: PmmMarketOption, key: string): number {
  const value = market.metadata?.[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Market ${market.label} has no ${key} in its metadata`);
  }
  return value;
}

export function readPubkey(market: PmmMarketOption, key: string): string {
  const value = market.metadata?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Market ${market.label} has no ${key} in its metadata`);
  }
  return value;
}
