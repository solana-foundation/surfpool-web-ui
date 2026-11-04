import type { TokenSelectorOption } from '@/components/svm/token-selector-options';
import { BISONFI_FEATURED } from './pmms/bisonfi';

export type FeaturedAccountOption = TokenSelectorOption & {
  /** Inputs filled when this account is picked, keyed by property path, such as the oracle that keeps it alive. */
  inputs?: Readonly<Record<string, string>>;
};

export type FeaturedAccounts = {
  label: string;
  description: string;
  options: FeaturedAccountOption[];
};

/** A protocol whose templates write a caller-selected account, with the accounts Studio offers for each. */
export type FeaturedProtocol = {
  protocol: string;
  templates: Readonly<Record<string, FeaturedAccounts>>;
  aiContext: () => string;
};

// Each protocol keeps its accounts and AI context in its own file and is registered here.
const FEATURED_PROTOCOLS: readonly FeaturedProtocol[] = [BISONFI_FEATURED];

const FEATURED_ACCOUNTS = new Map<string, FeaturedAccounts>(
  FEATURED_PROTOCOLS.flatMap(({ templates }) => Object.entries(templates))
);

export const getFeaturedAccounts = (templateId: unknown) =>
  typeof templateId === 'string' ? FEATURED_ACCOUNTS.get(templateId) : undefined;

// A featured-account template saves the picked account; any other template keeps its own address.
export const resolveFeaturedAccount = (templateId: unknown, templateAddress: unknown, selectedPubkey: string) => {
  if (!getFeaturedAccounts(templateId)) return templateAddress;
  const pubkey = selectedPubkey.trim();
  return pubkey ? { pubkey } : undefined;
};

// The inputs a picked account fills. An input another featured account fills is cleared when the picked
// account names none, so it never keeps the value of an account picked before.
export const featuredAccountInputs = (templateId: unknown, pubkey: string): Record<string, string | undefined> => {
  const options = getFeaturedAccounts(templateId)?.options ?? [];
  const picked = options.find((option) => option.value === pubkey);
  const inputs: Record<string, string | undefined> = {};
  for (const option of options) {
    for (const path of Object.keys(option.inputs ?? {})) inputs[path] = picked?.inputs?.[path];
  }
  return inputs;
};

export const getProtocolAiContext = (protocolId: string): string | undefined =>
  FEATURED_PROTOCOLS.find(({ protocol }) => protocol === protocolId)?.aiContext();
