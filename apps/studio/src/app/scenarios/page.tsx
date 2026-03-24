'use client';

import { Suspense, useEffect, useState } from 'react';
import { logger } from '@surfpool/shared';
import { useSearchParams } from 'next/navigation';
import ScenariosBento from '@/components/svm/scenarios-bento';
import { Scenario } from '@/lib/scenarios-data';
import { useAppConfig } from '@/hooks/use-app-config';

function ScenariosContent() {
  const searchParams = useSearchParams();
  const { studioUrl } = useAppConfig();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDetailPaneOpen, setIsDetailPaneOpen] = useState(false);

  // Read search params reactively - these will update when URL changes
  const selectedId = searchParams?.get('id') || undefined;
  const selectedTab = searchParams?.get('tab') || undefined;

  // Debug: log when search params change
  useEffect(() => {
    logger.log('Search params changed:', { selectedId, selectedTab });
  }, [selectedId, selectedTab]);

  useEffect(() => {
    async function loadScenarios() {
      try {
        setLoading(true);

        const response = await fetch(`${studioUrl}/v1/scenarios`);

        if (!response.ok) {
          throw new Error(`Failed to fetch scenarios: ${response.status}`);
        }

        const data = await response.json();
        logger.log('Loaded scenarios from API:', data);

        // Convert API response to scenarios array
        // Handle both array response and object response
        let loadedScenarios: Scenario[];

        if (Array.isArray(data)) {
          // API returned an array of scenarios
          loadedScenarios = data.map((scenarioData: any) => {
            const scenario: Scenario = {
              id: scenarioData.id, // Use the ID from the scenario object itself
              name: scenarioData.name || `Scenario ${scenarioData.id}`,
              description: scenarioData.description,
              status: scenarioData.status || 'active',
              created_at: scenarioData.created_at,
              updated_at: scenarioData.updated_at,
            };

            // Convert overrides to steps/slots for UI
            if (scenarioData.overrides && scenarioData.overrides.length > 0) {
              // Group overrides by scenarioRelativeSlot
              const slotMap = new Map<number, any[]>();

              scenarioData.overrides.forEach((override: any) => {
                const slotNumber = override.scenarioRelativeSlot !== undefined ? override.scenarioRelativeSlot : 0;
                if (!slotMap.has(slotNumber)) {
                  slotMap.set(slotNumber, []);
                }

                // Extract protocol from templateId (everything before first dash is usually the protocol)
                const templateId = override.templateId || '';
                const firstDashIndex = templateId.indexOf('-');
                const protocolId = firstDashIndex > 0 ? templateId.substring(0, firstDashIndex) : templateId;

                slotMap.get(slotNumber)!.push({
                  overrideId: override.id, // Preserve the override ID from backend
                  protocolId: protocolId || 'unknown',
                  actionId: templateId || 'unknown', // Use full templateId as actionId
                  protocol: protocolId.charAt(0).toUpperCase() + protocolId.slice(1), // Capitalize protocol name
                  action: override.label || 'Unknown Action',
                  account: override.account, // Preserve account data
                  fetchBeforeUse: override.fetchBeforeUse || false,
                  overrides: override.values || {}, // Preserve the values from backend
                  modifiedFields: Object.keys(override.values || {}), // Track which fields were modified
                });
              });

              // Convert map to array of steps
              scenario.steps = Array.from(slotMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([slotNumber, actions]) => ({
                  id: `slot-${slotNumber}`,
                  name: `Slot ${slotNumber}`,
                  type: 'slot',
                  status: 'pending',
                  actions: actions,
                }));
            }

            return scenario;
          });
        } else {
          // API returned an object with scenario IDs as keys
          loadedScenarios = Object.entries(data).map(([id, scenarioData]: [string, any]) => {
            const scenario: Scenario = {
              id: scenarioData.id || id, // Prefer scenario.id, fallback to key
              name: scenarioData.name || `Scenario ${id}`,
              description: scenarioData.description,
              status: scenarioData.status || 'active',
              created_at: scenarioData.created_at,
              updated_at: scenarioData.updated_at,
            };

            // Convert overrides to steps/slots for UI
            if (scenarioData.overrides && scenarioData.overrides.length > 0) {
              // Group overrides by scenarioRelativeSlot
              const slotMap = new Map<number, any[]>();

              scenarioData.overrides.forEach((override: any) => {
                const slotNumber = override.scenarioRelativeSlot !== undefined ? override.scenarioRelativeSlot : 0;
                if (!slotMap.has(slotNumber)) {
                  slotMap.set(slotNumber, []);
                }

                // Extract protocol from templateId (everything before first dash is usually the protocol)
                const templateId = override.templateId || '';
                const firstDashIndex = templateId.indexOf('-');
                const protocolId = firstDashIndex > 0 ? templateId.substring(0, firstDashIndex) : templateId;

                slotMap.get(slotNumber)!.push({
                  overrideId: override.id, // Preserve the override ID from backend
                  protocolId: protocolId || 'unknown',
                  actionId: templateId || 'unknown', // Use full templateId as actionId
                  protocol: protocolId.charAt(0).toUpperCase() + protocolId.slice(1), // Capitalize protocol name
                  action: override.label || 'Unknown Action',
                  account: override.account, // Preserve account data
                  fetchBeforeUse: override.fetchBeforeUse || false,
                  overrides: override.values || {}, // Preserve the values from backend
                  modifiedFields: Object.keys(override.values || {}), // Track which fields were modified
                });
              });

              // Convert map to array of steps
              scenario.steps = Array.from(slotMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([slotNumber, actions]) => ({
                  id: `slot-${slotNumber}`,
                  name: `Slot ${slotNumber}`,
                  type: 'slot',
                  status: 'pending',
                  actions: actions,
                }));
            }

            return scenario;
          });
        }

        setScenarios(loadedScenarios);
      } catch (error) {
        console.error('Error loading scenarios:', error);
        setScenarios([]);
      } finally {
        setLoading(false);
      }
    }

    loadScenarios();
  }, [refreshKey, studioUrl]);

  // Listen for scenario updates (but not when detail pane is open to avoid refresh loops)
  useEffect(() => {
    const handleScenarioUpdate = () => {
      // Only refresh if detail pane is closed
      if (!isDetailPaneOpen) {
        logger.log('Scenario updated event received, refreshing scenarios');
        setRefreshKey((prev) => prev + 1);
      } else {
        logger.log('Scenario updated event received, but detail pane is open - skipping refresh');
      }
    };

    window.addEventListener('scenarioUpdated', handleScenarioUpdate);
    return () => window.removeEventListener('scenarioUpdated', handleScenarioUpdate);
  }, [isDetailPaneOpen]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-zinc-600 dark:text-zinc-400">Loading scenarios...</div>
      </div>
    );
  }

  return (
    <ScenariosBento
      scenarios={scenarios}
      onRefresh={handleRefresh}
      onDetailPaneChange={setIsDetailPaneOpen}
      initialSelectedId={selectedId}
      initialTab={selectedTab}
    />
  );
}

export default function Scenarios() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-zinc-600 dark:text-zinc-400">Loading scenarios...</div>
      </div>
    }>
      <ScenariosContent />
    </Suspense>
  );
}
