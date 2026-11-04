import type { TokenSelectorOption } from '@/components/svm/token-selector-options';
import { BISONFI_FEATURED } from './bisonfi-markets';

export type FeaturedAccounts = {
  label: string;
  description: string;
  options: TokenSelectorOption[];
};

/** A protocol whose templates write a caller-selected account, with the accounts Studio offers for them. */
export type FeaturedProtocol = {
  protocol: string;
  templateIds: readonly string[];
  accounts: FeaturedAccounts;
  aiContext: () => string;
};

// Each protocol keeps its accounts and AI context in its own file and is registered here.
const FEATURED_PROTOCOLS: readonly FeaturedProtocol[] = [BISONFI_FEATURED];

const FEATURED_ACCOUNTS = new Map<string, FeaturedAccounts>(
  FEATURED_PROTOCOLS.flatMap(({ templateIds, accounts }) =>
    templateIds.map((templateId) => [templateId, accounts] as const)
  )
);

export const getFeaturedAccounts = (templateId: unknown) =>
  typeof templateId === 'string' ? FEATURED_ACCOUNTS.get(templateId) : undefined;

// A featured-account template saves the picked account; any other template keeps its own address.
export const resolveFeaturedAccount = (templateId: unknown, templateAddress: unknown, selectedPubkey: string) => {
  if (!getFeaturedAccounts(templateId)) return templateAddress;
  const pubkey = selectedPubkey.trim();
  return pubkey ? { pubkey } : undefined;
};

export const getProtocolAiContext = (protocolId: string): string | undefined =>
  FEATURED_PROTOCOLS.find(({ protocol }) => protocol === protocolId)?.aiContext();
