import type { ScenarioBentoItem } from '@/components/svm/scenarios-bento.types';
import { isSafeNumber, LosslessNumber, parse, stringify } from 'lossless-json';
import { PROTOCOLS } from './protocol-icons';
import type { Scenario } from './scenarios-data';

// Solana u64/u128 fields exceed Number.MAX_SAFE_INTEGER, which native JSON silently rounds.
const parseScenarioNumber = (value: string): number | LosslessNumber =>
  isSafeNumber(value) ? Number(value) : new LosslessNumber(value);

export function parseScenariosJson(text: string): unknown {
  return parse(text, null, parseScenarioNumber);
}

export function serializeScenarioJson(body: unknown, space?: number): string {
  return stringify(body, null, space) ?? '';
}

/**
 * Prepare a surfnet snapshot RPC response for download. `surfpool start --snapshot` expects the
 * bare account map (result.value), not the full RPC result (which also carries `context`), and
 * large u64/u128 balances must stay exact — so this extracts result.value and serializes it
 * losslessly. Returns null when the response carries no snapshot value.
 */
export function snapshotDownloadContents(rawResponse: string): string | null {
  let parsed: unknown;
  try {
    parsed = parse(rawResponse);
  } catch {
    return null;
  }
  const value = (parsed as { result?: { value?: unknown } } | null)?.result?.value;
  if (value === undefined || value === null) return null;
  return stringify(value, null, 2) ?? '';
}

export function toScenarioNumber(input: string): number | LosslessNumber {
  if (input.trim() === '' || Number.isNaN(Number(input))) return Number(input);
  return isSafeNumber(input) ? Number(input) : new LosslessNumber(input);
}

/**
 * Turn the contents of a downloaded scenario file into a POST /v1/scenarios body.
 * The id is replaced so importing never collides with the scenario it came from,
 * and lossless-json keeps i64 values exact on the way back in.
 */
export function scenarioImportPayload(
  fileContents: string,
  newId: string
): { payload: string; name: string } | { error: string } {
  let parsed: unknown;
  try {
    parsed = parse(fileContents);
  } catch {
    return { error: 'That file is not valid JSON' };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'That file does not contain a scenario' };
  }

  const scenario = parsed as Record<string, unknown>;
  if (!Array.isArray(scenario.overrides)) {
    return { error: 'That file does not contain a scenario' };
  }

  const name = typeof scenario.name === 'string' && scenario.name ? scenario.name : 'Imported scenario';

  return {
    payload:
      stringify({
        ...scenario,
        id: newId,
        name,
        description: typeof scenario.description === 'string' ? scenario.description : '',
        tags: Array.isArray(scenario.tags) ? scenario.tags : [],
      }) ?? '',
    name,
  };
}

/**
 * Pick one scenario out of a raw GET /v1/scenarios response and prepare it for
 * download. lossless-json keeps i64 fields exact, which JSON.parse would round;
 * the contents are a valid POST /v1/scenarios body.
 */
export function scenarioDownloadFile(
  scenariosJson: string,
  scenarioId: string
): { filename: string; contents: string } | null {
  let scenarios: unknown;
  try {
    scenarios = parse(scenariosJson);
  } catch {
    return null;
  }
  let scenario: Record<string, unknown> | undefined;
  if (Array.isArray(scenarios)) {
    scenario = scenarios.find((entry) => (entry as { id?: unknown })?.id === scenarioId) as
      | Record<string, unknown>
      | undefined;
  } else if (scenarios !== null && typeof scenarios === 'object') {
    const entry = Object.entries(scenarios as Record<string, unknown>).find(
      ([id, value]) => id === scenarioId || (value as { id?: unknown })?.id === scenarioId
    );
    if (entry && entry[1] !== null && typeof entry[1] === 'object' && !Array.isArray(entry[1])) {
      const value = entry[1] as Record<string, unknown>;
      scenario = typeof value.id === 'string' ? value : { ...value, id: entry[0] };
    }
  }
  if (!scenario) return null;

  const name = typeof scenario.name === 'string' ? scenario.name : '';
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    filename: `scenario-${slug || scenarioId}.json`,
    contents: stringify(scenario, null, 2) ?? '',
  };
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

  // A LosslessNumber is a scalar u64, not a nested object to recurse into.
  const isNestedObject = (value: unknown): boolean =>
    value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof LosslessNumber);

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
