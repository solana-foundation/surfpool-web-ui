import { SOLFI_FAIR_VALUE } from './pmms/solfi';
import { serializeScenarioJson, toScenarioNumber } from './scenarios-api';

export { isValidPmmPrice } from './pmm-price';

export type PmmProtocol = string;

export type PmmMarketOption = {
  label: string;
  value: string;
  metadata?: Record<string, unknown>;
};

export type PmmFairValueOverride = {
  templateId: string;
  label: string;
  account: { pubkey: string };
  values: Record<string, unknown>;
};

export type PmmFairValueAdapter = {
  protocol: PmmProtocol;
  label: string;
  /** Template the surfnet must serve for this adapter to be offered. */
  marketTemplateId: string;
  /** Markets the preset offers; any other market is typed as an address and read by `readMarket`. */
  markets: PmmMarketOption[];
  buildOverrides: (market: PmmMarketOption, price: string) => PmmFairValueOverride[];
  /** Reads a typed market address the featured list does not offer, with the metadata its overrides need. */
  readMarket: (rpcUrl: string, address: string, listed: PmmMarketOption[]) => Promise<PmmMarketOption>;
};

export type ServedTemplate = { id: string };

export async function fetchScenarioTemplates(studioUrl: string): Promise<ServedTemplate[]> {
  const response = await fetch(`${studioUrl}/v1/scenarios/templates`);
  if (!response.ok) throw new Error(`Failed to load scenario templates: ${response.status}`);
  return (await response.json()) as ServedTemplate[];
}

export async function createTemplateScenario(
  studioUrl: string,
  scenario: Record<string, unknown>
): Promise<{ id: string }> {
  const response = await fetch(`${studioUrl}/v1/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serializeScenarioJson(scenario),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to create scenario: ${response.status}`);
  }
  const result = (await response.json()) as { id?: string };
  if (!result.id) throw new Error('Surfpool returned no scenario id');
  return { id: result.id };
}

export function marketPairLabel(market: PmmMarketOption | undefined): string {
  const pair = typeof market?.metadata?.pair === 'string' ? market.metadata.pair : market?.label;
  const [base, quote] = (pair ?? '').split('/').map((part) => part.trim());
  return base && quote ? `Price of ${base} in ${quote}` : 'Price in quote tokens';
}

export function buildPmmFairValueScenario(adapter: PmmFairValueAdapter, market: PmmMarketOption, price: string) {
  const normalizedPrice = price.trim();
  const marketName =
    typeof market.metadata?.pair === 'string' ? market.metadata.pair.replace('/', ' / ') : market.label;
  const overrides = adapter.buildOverrides(market, normalizedPrice).map((override) => ({
    id: crypto.randomUUID(),
    ...override,
    // An adapter gives integers as bigint; the scenario keeps them exact as numbers.
    values: Object.fromEntries(
      Object.entries(override.values).map(([path, value]) => [
        path,
        typeof value === 'bigint' ? toScenarioNumber(value.toString()) : value,
      ])
    ),
    scenarioRelativeSlot: 0,
    enabled: true,
    fetchBeforeUse: true,
  }));

  return {
    id: crypto.randomUUID(),
    name: `${adapter.label} ${marketName} fair value ${normalizedPrice}`,
    description: `Set the ${adapter.label} ${marketName} fair value to ${normalizedPrice}.`,
    overrides,
    tags: [adapter.protocol, 'pmm', 'fair-value'],
  };
}

// Each PMM keeps its fair-value adapter in lib/pmms and is registered here.
export const PMM_FAIR_VALUE_ADAPTERS: Record<PmmProtocol, PmmFairValueAdapter> = {
  [SOLFI_FAIR_VALUE.protocol]: SOLFI_FAIR_VALUE,
};
