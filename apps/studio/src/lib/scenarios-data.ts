export type ScenarioAction = {
  protocolId: string;
  actionId: string;
  protocol: string;
  action: string;
  overrideId?: string;
  fetchBeforeUse?: boolean;
  overrides?: Record<string, unknown>;
  modifiedFields?: string[];
  account?: any; // Account address (Pubkey or PDA)
  // The untouched backend override this action was loaded from. PATCH is a full
  // document replace, so update payloads spread this first — fields the UI does
  // not know about (enabled, future additions) survive the roundtrip
  original?: Record<string, unknown>;
};

export type ScenarioStep = {
  id: string;
  name: string;
  type: string;
  status?: string;
  slotNumber?: number;
  actions?: ScenarioAction[];
};

export type Scenario = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  steps?: ScenarioStep[];
  tags?: string[];
  metadata?: Record<string, any>;
};

// Raw shapes as they arrive from GET /v1/scenarios (fields are best-effort).
export type ApiOverride = {
  id?: string;
  templateId?: string;
  scenarioRelativeSlot?: number;
  label?: string;
  account?: unknown;
  fetchBeforeUse?: boolean;
  values?: Record<string, unknown>;
};

export type ApiScenario = {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  overrides?: ApiOverride[];
};

// The templateId prefix breaks on multi-dash protocols (pump-amm-* is PumpSwap, not
// "pump"), so the templates-list name wins; the prefix is only the fallback.
export function resolveProtocol(
  templateId: string,
  templateProtocols: Map<string, string>
): { protocolId: string; displayName: string } {
  const protocolName = templateProtocols.get(templateId) || '';
  const firstDashIndex = templateId.indexOf('-');
  const heuristicId = firstDashIndex > 0 ? templateId.substring(0, firstDashIndex) : templateId;
  const protocolId = protocolName ? protocolName.toLowerCase().replace(/\s+/g, '-') : heuristicId;
  const base = protocolName || protocolId;
  return {
    protocolId: protocolId || 'unknown',
    displayName: base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Unknown',
  };
}

// `fallbackId` is the object key used when the API body omits its own id.
export function scenarioFromApiData(
  scenarioData: ApiScenario,
  fallbackId: string,
  templateProtocols: Map<string, string>
): Scenario {
  const scenario: Scenario = {
    id: scenarioData.id || fallbackId,
    name: scenarioData.name || `Scenario ${fallbackId}`,
    description: scenarioData.description,
    status: scenarioData.status || 'active',
    created_at: scenarioData.created_at,
    updated_at: scenarioData.updated_at,
    tags: scenarioData.tags,
  };

  if (scenarioData.overrides && scenarioData.overrides.length > 0) {
    const slotMap = new Map<number, ScenarioAction[]>();

    scenarioData.overrides.forEach((override: ApiOverride) => {
      const slotNumber = override.scenarioRelativeSlot !== undefined ? override.scenarioRelativeSlot : 0;
      if (!slotMap.has(slotNumber)) {
        slotMap.set(slotNumber, []);
      }

      const templateId = override.templateId || '';
      const { protocolId, displayName } = resolveProtocol(templateId, templateProtocols);

      slotMap.get(slotNumber)!.push({
        original: override,
        overrideId: override.id,
        protocolId,
        actionId: templateId || 'unknown',
        protocol: displayName,
        action: override.label || 'Unknown Action',
        account: override.account,
        fetchBeforeUse: override.fetchBeforeUse || false,
        overrides: override.values || {},
        modifiedFields: Object.keys(override.values || {}),
      });
    });

    scenario.steps = Array.from(slotMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([slotNumber, actions]) => ({
        id: `slot-${slotNumber}`,
        name: `Slot ${slotNumber}`,
        type: 'slot',
        status: 'pending',
        slotNumber,
        actions,
      }));
  }

  return scenario;
}
