'use client';

import ScenariosBento from '@/components/svm/scenarios-bento';
import { useAppConfig } from '@/hooks/use-app-config';
import { ApiScenario, Scenario, scenarioFromApiData } from '@/lib/scenarios-data';
import { logger } from '@surfpool/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

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

        // The templateId prefix heuristic below misfires on multi-dash protocols
        // (pump-amm-* belongs to PumpSwap, not "pump"), so resolve the protocol
        // from the templates list whenever it is reachable.
        const templateProtocols = new Map<string, string>();
        try {
          const templatesResponse = await fetch(`${studioUrl}/v1/scenarios/templates`);
          if (templatesResponse.ok) {
            const templates: Array<{ id: string; protocol?: string }> = await templatesResponse.json();
            for (const template of templates) {
              templateProtocols.set(template.id, template.protocol || '');
            }
          } else {
            logger.warn(
              'Templates request failed, protocol names fall back to templateId prefix:',
              templatesResponse.status
            );
          }
        } catch (error) {
          logger.warn('Templates request failed, protocol names fall back to templateId prefix:', error);
        }

        // Convert API response to scenarios array. The API returns either an array
        // of scenarios or an object keyed by scenario id; both shapes convert the
        // same way via scenarioFromApiData.
        const loadedScenarios: Scenario[] = Array.isArray(data)
          ? data.map((scenarioData: ApiScenario) =>
              scenarioFromApiData(scenarioData, scenarioData.id ?? '', templateProtocols)
            )
          : Object.entries(data as Record<string, ApiScenario>).map(([id, scenarioData]) =>
              scenarioFromApiData(scenarioData, id, templateProtocols)
            );

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
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="text-lg text-zinc-600 dark:text-zinc-400">Loading scenarios...</div>
        </div>
      }
    >
      <ScenariosContent />
    </Suspense>
  );
}
