'use client';

import { useAppConfig } from '@/hooks/use-app-config';
import {
  buildUpdatePayload,
  createScenarioPayload,
  scenarioImportPayload,
  scenarioToBentoItem,
  serializeScenarioJson,
} from '@/lib/scenarios-api';
import type { Scenario } from '@/lib/scenarios-data';
import { PencilIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/solid';
import { logger } from '@surfpool/shared';
import {
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '@surfpool/ui';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import AIHeader from './ai-header';
import DraftField from './draft-field';
import GenericBento from './generic-bento';
import ScenarioCard from './scenario-card';
import ScenarioDetailOverview from './scenario-detail-overview';
import type { ScenarioBentoItem, ScenariosBentoProps } from './scenarios-bento.types';

const ScenarioEditor = dynamic(() => import('./scenario-editor').then((mod) => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-lg text-zinc-600 dark:text-zinc-400">Loading editor...</div>
    </div>
  ),
});

export default function ScenariosBento({
  scenarios: initialScenarios,
  onRefresh,
  onDetailPaneChange,
  initialSelectedId,
  initialTab,
}: ScenariosBentoProps) {
  const router = useRouter();
  const { studioUrl } = useAppConfig();
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [isDetailPaneOpen, setIsDetailPaneOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<{ id: string; onClose?: () => void } | null>(null);

  // Sync scenarios when initialScenarios changes
  useEffect(() => {
    logger.log(
      'ScenariosBento: scenarios updated, count:',
      initialScenarios.length,
      'IDs:',
      initialScenarios.map((s) => s.id)
    );
    setScenarios(initialScenarios);
  }, [initialScenarios]);

  // Notify parent when detail pane state changes
  useEffect(() => {
    onDetailPaneChange?.(isDetailPaneOpen);
  }, [isDetailPaneOpen, onDetailPaneChange]);

  // Handle item clicks - update URL when scenario is selected
  const handleItemClick = (item: ScenarioBentoItem, tab: string) => {
    logger.log('Scenario clicked:', item.id, 'tab:', tab);
    router.replace(`/scenarios?id=${item.id}&tab=${tab}`, { scroll: false });
  };

  // Handle tab changes - update URL to reflect current state
  const handleTabChange = (tabId: string) => {
    if (initialSelectedId) {
      logger.log('Tab changed to:', tabId, 'for scenario:', initialSelectedId);
      router.replace(`/scenarios?id=${initialSelectedId}&tab=${tabId}`, { scroll: false });
    }
  };

  // Import scenario from a downloaded file
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportScenario = async (file: File) => {
    setImportError(null);
    const result = scenarioImportPayload(await file.text(), crypto.randomUUID());

    if ('error' in result) {
      setImportError(result.error);
      return;
    }

    try {
      const response = await fetch(`${studioUrl}/v1/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: result.payload,
      });

      if (!response.ok) {
        setImportError(`Import failed — the surfnet returned HTTP ${response.status}`);
        return;
      }

      logger.log('Scenario imported:', result.name);
      onRefresh?.();
    } catch (error) {
      logger.log('Scenario import failed:', error);
      setImportError('Import failed — is the surfnet running?');
    }
  };

  // Create new scenario
  const handleCreateScenario = async () => {
    const newScenario: Scenario = {
      id: crypto.randomUUID(),
      name: 'New Scenario',
      description: 'Add a description...',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: [],
    };

    try {
      const response = await fetch(`${studioUrl}/v1/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeScenarioJson(createScenarioPayload(newScenario)),
      });

      if (!response.ok) {
        throw new Error(`Failed to create scenario: ${response.status}`);
      }

      logger.log('Scenario created successfully:', newScenario.id);
      setScenarios((prev) => [...prev, newScenario]);
      onRefresh?.();
      router.push(`/scenarios?id=${newScenario.id}&tab=overview`);

      return newScenario.id;
    } catch (error) {
      console.error('Error creating scenario:', error);
      return null;
    }
  };

  // Update scenario
  const handleUpdateScenario = async (id: string, updates: Partial<Scenario>) => {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;

    const updatedScenario = { ...scenario, ...updates, updated_at: new Date().toISOString() };

    // Optimistic update
    setScenarios(scenarios.map((s) => (s.id === id ? updatedScenario : s)));

    try {
      const response = await fetch(`${studioUrl}/v1/scenarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: serializeScenarioJson(buildUpdatePayload(updatedScenario)),
      });

      if (!response.ok) {
        throw new Error(`Failed to update scenario: ${response.status}`);
      }

      logger.log('Scenario updated successfully:', id);

      if (!isDetailPaneOpen && onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error updating scenario:', error);
      // Revert optimistic update
      setScenarios(scenarios.map((s) => (s.id === id ? scenario : s)));
    }
  };

  // Delete scenario
  const handleDeleteScenario = async (id: string) => {
    try {
      const response = await fetch(`${studioUrl}/v1/scenarios/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete scenario: ${response.status}`);
      }

      logger.log('Scenario deleted successfully:', id);
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting scenario:', error);
    }
  };

  // Transform scenarios to BentoItems
  const bentoItems: ScenarioBentoItem[] = useMemo(() => scenarios.map(scenarioToBentoItem), [scenarios]);

  // Debug logging
  useEffect(() => {
    logger.log(
      'ScenariosBento: bentoItems ready, count:',
      bentoItems.length,
      'IDs:',
      bentoItems.map((i) => i.id)
    );
    logger.log('ScenariosBento: initialSelectedId:', initialSelectedId, 'initialTab:', initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bentoItems.length, initialSelectedId, initialTab]);

  const renderDetailHeader = (item: ScenarioBentoItem, onClose?: () => void) => (
    <div className="flex-1">
      {editingTitle === item.id ? (
        <DraftField
          initialValue={item.name}
          onCommit={(name) => handleUpdateScenario(item.id, { name })}
          onDone={() => setEditingTitle(null)}
          className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-1 text-base font-semibold text-zinc-950 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:text-zinc-50"
        />
      ) : (
        <h2
          className="group flex cursor-pointer items-center gap-2 truncate text-base font-semibold text-zinc-950 dark:text-zinc-50"
          onClick={() => setEditingTitle(item.id)}
        >
          {item.name}
          <PencilIcon className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
        </h2>
      )}
    </div>
  );

  const renderDetailActions = (item: ScenarioBentoItem, onClose?: () => void) => (
    <button
      onClick={() => {
        setScenarioToDelete({ id: item.id, onClose });
        setDeleteDialogOpen(true);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-500 transition-all hover:bg-red-500/20"
      title="Delete scenario"
    >
      <TrashIcon className="h-5 w-5" />
    </button>
  );

  const renderDetailContent = (item: ScenarioBentoItem, activeTab: string) => {
    switch (activeTab) {
      case 'overview':
        return (
          <ScenarioDetailOverview
            item={item}
            editingDescription={editingDescription}
            onEditDescription={setEditingDescription}
            onUpdateScenario={handleUpdateScenario}
          />
        );
      case 'editor':
        return (
          <div className="h-[calc(100vh-300px)]">
            <ScenarioEditor
              scenarioId={item.id}
              scenarioName={item.name}
              scenarioDescription={item.description}
              scenarioTags={item.tags}
              initialSteps={item.steps}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: null },
    { id: 'editor', label: 'Scenario', icon: null },
  ];

  return (
    <div className="relative h-full">
      {/* AI Header - always visible when detail pane is closed */}
      {!isDetailPaneOpen && (
        <AIHeader
          onRefresh={onRefresh}
          onScenarioNavigate={(scenarioId) => router.push(`/scenarios?id=${scenarioId}&tab=editor`)}
        />
      )}

      <GenericBento
        items={bentoItems}
        searchPlaceholder="Search scenarios..."
        emptyMessage="No scenarios found"
        emptyState={
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <SparklesIcon className="mb-4 h-12 w-12 text-zinc-600" />
            <p className="mb-4 text-zinc-400">No scenarios yet</p>
            <p className="max-w-md text-sm text-zinc-500">
              Use the AI prompt above to generate a scenario, or click the + button to create one manually.
            </p>
          </div>
        }
        renderItem={(item: ScenarioBentoItem, isSelected: boolean) => (
          <ScenarioCard item={item} isSelected={isSelected} />
        )}
        renderDetailHeader={renderDetailHeader}
        renderDetailContent={renderDetailContent}
        renderDetailActions={renderDetailActions}
        tabs={tabs}
        defaultTab="overview"
        onSelectionChange={(item) => setIsDetailPaneOpen(item !== null)}
        onItemClick={handleItemClick}
        onTabChange={handleTabChange}
        onClose={() => router.replace('/scenarios', { scroll: false })}
        initialSelectedId={initialSelectedId}
        initialTab={initialTab}
      />

      {/* Add New Scenario Button */}
      {!isDetailPaneOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
          {!!importError && (
            <div className="rounded-lg bg-zinc-900/90 px-3 py-2 text-sm text-red-400 shadow-lg">{importError}</div>
          )}
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportScenario(file);
              e.target.value = '';
            }}
          />
          <Dropdown>
            <DropdownButton
              as="button"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg transition-all duration-200 hover:scale-110 hover:bg-pink-400 hover:shadow-xl"
              title="Add a scenario"
            >
              <PlusIcon className="h-7 w-7" />
            </DropdownButton>
            <DropdownMenu anchor="top end">
              <DropdownItem onClick={handleCreateScenario}>New scenario</DropdownItem>
              <DropdownItem onClick={() => importInputRef.current?.click()}>Import from file…</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={setDeleteDialogOpen} size="xl">
        <DialogTitle>Delete Scenario?</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this scenario? This action cannot be undone.
        </DialogDescription>
        <DialogActions>
          <Button color="dark" onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              if (scenarioToDelete) {
                handleDeleteScenario(scenarioToDelete.id);
                scenarioToDelete.onClose?.();
              }
              setDeleteDialogOpen(false);
              setScenarioToDelete(null);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
