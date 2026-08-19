import type { ScenarioBentoItem } from '@/components/svm/scenarios-bento.types';
import { PROTOCOLS } from './protocol-icons';
import type { Scenario } from './scenarios-data';

export type PumpGraduationScenarioResult = {
  id: string;
  tokenMint: string;
  completingBuyAmount: number;
  migrationReserve: number;
  addresses: {
    bondingCurve: string;
    curveVault: string;
    canonicalPool: string;
  };
};

export async function createPumpGraduationScenario(
  studioUrl: string,
  tokenMint: string
): Promise<PumpGraduationScenarioResult> {
  const response = await fetch(`${studioUrl}/v1/scenarios/pump-graduation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenMint: tokenMint.trim() }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Pump graduation validation failed (${response.status})`);
  }

  return response.json();
}

export type PumpSwapPriceShockScenarioResult = {
  id: string;
  tokenMint: string;
  canonicalPool: string;
  virtualQuoteReserves: string;
};

export async function createPumpSwapPriceShockScenario(
  studioUrl: string,
  tokenMint: string,
  virtualQuoteReserves: string
): Promise<PumpSwapPriceShockScenarioResult> {
  const response = await fetch(`${studioUrl}/v1/scenarios/pump-swap-price-shock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tokenMint: tokenMint.trim(),
      virtualQuoteReserves: virtualQuoteReserves.trim(),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `PumpSwap price shock validation failed (${response.status})`);
  }

  return response.json();
}

/**
 * Build the POST body for creating a new scenario.
 */
export function createScenarioPayload(scenario: Scenario) {
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    overrides: [],
    tags: [],
  };
}

/**
 * The backend override document as PATCH payloads must send it. The index
 * signature lets fields the UI does not know about (loaded via
 * `ScenarioAction.original`) pass through a full-replace PATCH unharmed.
 */
export type OverridePayload = {
  id: string;
  templateId: string;
  values: Record<string, unknown>;
  scenarioRelativeSlot: number;
  label: string;
  enabled: boolean;
  fetchBeforeUse: boolean;
  account?: unknown;
  [passthrough: string]: unknown;
};

/**
 * Convert a scenario's steps/actions into the backend "overrides" format
 * and return the full PATCH payload. Mirrors the scenario editor's sync
 * payload: everything loaded from the backend (override ids, values, account,
 * fetchBeforeUse, enabled, tags) is carried through, so a metadata-only
 * update cannot strip a scenario of its data.
 */
export function buildUpdatePayload(scenario: Scenario) {
  const overrides = (scenario.steps || []).flatMap((step, stepIndex) => {
    const slotNumber = step.slotNumber ?? stepIndex;
    return (step.actions || []).map((action) => {
      const original = (action.original ?? {}) as Partial<OverridePayload>;
      const override: OverridePayload = {
        ...original,
        id: action.overrideId || `${action.actionId}_${slotNumber}`,
        templateId: action.actionId,
        values: flattenOverrideValues(action.overrides, action.modifiedFields),
        scenarioRelativeSlot: slotNumber,
        label: action.action,
        enabled: original.enabled ?? true,
        fetchBeforeUse: action.fetchBeforeUse || false,
      };
      if (action.account) {
        override.account = action.account;
      }
      return override;
    });
  });

  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description || '',
    overrides,
    tags: scenario.tags || [],
  };
}

/**
 * Collect an action's override values into the flat dot-notation map the backend expects.
 *
 * Values arrive in two shapes: entries restored from the backend (and constant_ref selections
 * like feed_id) are already flat at the top level, while fields edited in the UI live nested
 * inside the account-shaped editing state, reachable only through their dotted paths in
 * modifiedFields. Dropping either shape loses data, so both are collected.
 */
export function flattenOverrideValues(
  overrides: Record<string, unknown> | undefined,
  modifiedFields?: string[]
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (!overrides) return flat;

  const isNestedObject = (value: unknown): boolean =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

  for (const [key, value] of Object.entries(overrides)) {
    if (!isNestedObject(value)) {
      flat[key] = value;
    }
  }

  for (const path of modifiedFields ?? []) {
    if (path in flat) continue;

    let current: unknown = overrides;
    for (const key of path.split('.')) {
      if (isNestedObject(current)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        current = undefined;
        break;
      }
    }

    if (current !== undefined && !isNestedObject(current)) {
      flat[path] = current;
    }
  }

  return flat;
}

/**
 * Map a Scenario to a ScenarioBentoItem for display in GenericBento.
 */
export function scenarioToBentoItem(scenario: Scenario): ScenarioBentoItem {
  return {
    id: String(scenario.id),
    name: String(scenario.name),
    description: String(scenario.description || 'No description available'),
    status: scenario.status
      ? {
          online: scenario.status === 'active' || scenario.status === 'running',
          status: String(scenario.status),
        }
      : undefined,
    created_at: scenario.created_at,
    updated_at: scenario.updated_at,
    steps: scenario.steps,
    tags: scenario.tags,
    metadata: scenario.metadata,
  };
}

/**
 * Augment a base prompt with selected protocol names.
 */
export function buildAiPrompt(basePrompt: string, selectedProtocolIds: Set<string>): string {
  const trimmed = basePrompt.trim();
  const selectedProtocolNames = PROTOCOLS.filter((p) => selectedProtocolIds.has(p.id)).map((p) => p.name);

  if (selectedProtocolNames.length === 0) {
    return trimmed;
  }

  return `${trimmed}\n\nUse only these protocols: ${selectedProtocolNames.join(', ')}.`;
}
