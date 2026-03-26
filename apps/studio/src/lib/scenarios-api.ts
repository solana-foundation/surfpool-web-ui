import type { ScenarioBentoItem } from '@/components/svm/scenarios-bento.types';
import { PROTOCOLS } from './protocol-icons';
import type { Scenario } from './scenarios-data';

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
 * Convert a scenario's steps/actions into the backend "overrides" format
 * and return the full PATCH payload.
 */
export function buildUpdatePayload(scenario: Scenario) {
  const overrides = (scenario.steps || []).flatMap((step, slotIndex) =>
    (step.actions || []).map((action) => ({
      id: `${action.protocolId}_${action.actionId}_${slotIndex}`,
      templateId: `${action.protocolId}_${action.actionId}`,
      values: {},
      scenarioRelativeSlot: slotIndex + 1,
      label: action.action,
      enabled: true,
      fetchBeforeUse: false,
      account: { pubkey: '11111111111111111111111111111111' },
    }))
  );

  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description || '',
    overrides,
    tags: [],
  };
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
