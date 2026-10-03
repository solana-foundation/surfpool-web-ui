import type { ScenarioBentoItem } from '@/components/svm/scenarios-bento.types';
import { isSafeNumber, LosslessNumber, parse, stringify } from 'lossless-json';
import { callMCPTool, fetchMCPTools } from './ai-client';
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

export type PumpGraduationScenarioResult = {
  id: string;
  tokenMint?: string;
  completingBuyAmount?: number;
  migrationReserve?: number;
  addresses?: {
    bondingCurve: string;
    curveVault: string;
    canonicalPool: string;
  };
};

export async function createPumpGraduationScenario(
  studioUrl: string,
  tokenMint: string
): Promise<PumpGraduationScenarioResult> {
  return createScenarioWithMcp(studioUrl, 'create_pump_graduation_scenario', {
    tokenMint: tokenMint.trim(),
  });
}

export type PumpSwapPriceShockScenarioResult = {
  id: string;
  tokenMint?: string;
  canonicalPool?: string;
  virtualQuoteReserves?: string;
};

type ScenarioTemplate = {
  id: string;
  address: unknown;
};

function findScenarioTemplate(templates: ScenarioTemplate[], templateId: string): ScenarioTemplate | undefined {
  for (const template of templates) {
    if (template.id === templateId) return template;
  }
  return undefined;
}

export async function createPumpSwapPriceShockScenario(
  studioUrl: string,
  tokenMint: string,
  virtualQuoteReserves: string
): Promise<PumpSwapPriceShockScenarioResult> {
  const templatesResponse = await fetch(`${studioUrl}/v1/scenarios/templates`);
  if (!templatesResponse.ok) {
    throw new Error(`Failed to load scenario templates: ${templatesResponse.status}`);
  }

  const templates = (await templatesResponse.json()) as ScenarioTemplate[];
  const template = findScenarioTemplate(templates, 'pump-amm-canonical-pool');
  if (!template) throw new Error('PumpSwap canonical pool template is unavailable');

  const scenarioId = crypto.randomUUID();
  const normalizedMint = tokenMint.trim();
  const normalizedReserves = virtualQuoteReserves.trim();
  const scenario = {
    id: scenarioId,
    name: 'PumpSwap Price Shock',
    description: 'Shift a canonical PumpSwap pool price through its virtual quote reserves.',
    overrides: [
      {
        id: crypto.randomUUID(),
        templateId: template.id,
        values: {
          base_mint: normalizedMint,
          virtual_quote_reserves: new LosslessNumber(normalizedReserves),
        },
        scenarioRelativeSlot: 1,
        label: 'PumpSwap virtual quote reserve shock',
        enabled: true,
        fetchBeforeUse: true,
        account: template.address,
      },
    ],
    tags: ['pumpswap', 'price-shock'],
  };
  const body = stringify(scenario);
  if (!body) throw new Error('Failed to serialize PumpSwap price shock scenario');

  const response = await fetch(`${studioUrl}/v1/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to create PumpSwap price shock scenario: ${response.status}`);
  }

  const result = (await response.json()) as { id?: string };
  if (!result.id) throw new Error('Surfpool returned no scenario id');
  return { id: result.id };
}

async function callMcpToolJson<T>(
  studioUrl: string,
  toolName: string,
  args: Record<string, string>
): Promise<T | undefined> {
  const { sessionId } = await fetchMCPTools(studioUrl);
  const result = (await callMCPTool(studioUrl, toolName, args, sessionId)) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  let text: string | undefined;
  for (const content of result.content ?? []) {
    if (content.type === 'text' && content.text) {
      text = content.text;
      break;
    }
  }
  return text ? (JSON.parse(text) as T) : undefined;
}

async function createScenarioWithMcp(
  studioUrl: string,
  toolName: string,
  args: Record<string, string>
): Promise<{ id: string }> {
  const payload = await callMcpToolJson<{ error?: string | null; url?: string | null }>(studioUrl, toolName, args);
  if (!payload) throw new Error(`Surfpool MCP tool ${toolName} returned no result`);
  if (payload.error) throw new Error(payload.error);
  if (!payload.url) throw new Error(`Surfpool MCP tool ${toolName} returned no scenario URL`);

  const scenarioId = new URL(payload.url).searchParams.get('id');
  if (!scenarioId) throw new Error(`Surfpool MCP tool ${toolName} returned an invalid scenario URL`);
  return { id: scenarioId };
}

export type PhoenixScenarioResult = {
  id: string;
};

export async function createPhoenixCollateralScenario(
  studioUrl: string,
  trader: string,
  targetQuoteLots: string
): Promise<PhoenixScenarioResult> {
  return createScenarioWithMcp(studioUrl, 'create_phoenix_collateral_scenario', {
    trader: trader.trim(),
    targetQuoteLots: targetQuoteLots.trim(),
  });
}

async function phoenixMarketTemplate(studioUrl: string, templateId: string): Promise<ScenarioTemplate> {
  const response = await fetch(`${studioUrl}/v1/scenarios/templates`);
  if (!response.ok) {
    throw new Error(`Failed to load scenario templates: ${response.status}`);
  }

  const templates = (await response.json()) as ScenarioTemplate[];
  const template = findScenarioTemplate(templates, templateId);
  if (!template) throw new Error(`Phoenix template ${templateId} is unavailable`);

  return template;
}

export interface DynamicRefOption {
  value: string;
  address?: string;
  markTicks?: number;
  tickSize?: number;
  baseLotDecimals?: number;
}

interface DynamicRefPayload {
  error?: string | null;
  symbols?: string[];
  markets?: ({ symbol: string; orderbook?: string } & Omit<DynamicRefOption, 'value' | 'address'>)[];
}

/** Options for a `dynamic_ref` property, read live from the MCP tool named in its `source`. */
export async function fetchDynamicRefOptions(studioUrl: string, source: string): Promise<DynamicRefOption[]> {
  try {
    const payload = await callMcpToolJson<DynamicRefPayload>(studioUrl, source, {});
    if (!payload || payload.error) return [];
    if (payload.markets) {
      return payload.markets.map(({ symbol, orderbook, ...market }) => ({
        value: symbol,
        address: orderbook,
        ...market,
      }));
    }
    return (payload.symbols ?? []).map((value) => ({ value }));
  } catch {
    return [];
  }
}

/**
 * The market templates carry the perp asset map address, so these scenarios are built here and
 * posted to the generic API; only collateral stress needs a tool, for its vault-backing check.
 */
async function createPhoenixMarketScenario(
  studioUrl: string,
  templateId: string,
  name: string,
  description: string,
  label: string,
  tags: string[],
  values: Record<string, string>
): Promise<PhoenixScenarioResult> {
  const template = await phoenixMarketTemplate(studioUrl, templateId);
  const scenario = {
    id: crypto.randomUUID(),
    name,
    description,
    overrides: [
      {
        id: crypto.randomUUID(),
        templateId: template.id,
        values,
        scenarioRelativeSlot: 0,
        label,
        enabled: true,
        // A stale map fails Phoenix's mark staleness check, so fork the live one first.
        fetchBeforeUse: true,
        account: template.address,
      },
    ],
    tags,
  };
  const body = stringify(scenario);
  if (!body) throw new Error('Failed to serialize Phoenix scenario');

  const response = await fetch(`${studioUrl}/v1/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to create Phoenix scenario: ${response.status}`);
  }

  const result = (await response.json()) as { id?: string };
  if (!result.id) throw new Error('Surfpool returned no scenario id');

  return { id: result.id };
}

export async function createPhoenixDirectMarkScenario(
  studioUrl: string,
  symbol: string,
  targetTicks: string
): Promise<PhoenixScenarioResult> {
  return createPhoenixMarketScenario(
    studioUrl,
    'phoenix-direct-mark-risk-shock',
    `Phoenix ${symbol.trim()} Direct Mark Risk Shock`,
    'Set exact mark-price ticks in validated Phoenix Eternal risk state.',
    `Phoenix ${symbol.trim()} direct mark risk shock`,
    ['phoenix-eternal', 'direct-mark', 'risk'],
    { symbol: symbol.trim(), target_ticks: targetTicks.trim() }
  );
}

export async function createPhoenixMaintenanceMarginScenario(
  studioUrl: string,
  symbol: string,
  riskFactor: string
): Promise<PhoenixScenarioResult> {
  return createPhoenixMarketScenario(
    studioUrl,
    'phoenix-maintenance-margin-stress',
    `Phoenix ${symbol.trim()} Maintenance Margin Stress`,
    'Set the maintenance margin risk factor for one Phoenix Eternal market.',
    `Phoenix ${symbol.trim()} maintenance margin stress`,
    ['phoenix-eternal', 'maintenance-margin', 'risk'],
    { symbol: symbol.trim(), maintenance_risk_factor_bps: riskFactor.trim() }
  );
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
