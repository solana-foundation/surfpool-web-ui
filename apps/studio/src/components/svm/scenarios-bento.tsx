'use client';

import React, { useState, useEffect } from 'react';
import { logger } from '@surfpool/shared';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/solid';
import GenericBento, { BentoItem } from './generic-bento';
import { Button, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle, Dropdown, DropdownItem, DropdownLabel, DropdownMenu, DropdownDescription, DropdownDivider, Input, Field, Label } from '@surfpool/ui';
import * as Headless from '@headlessui/react';
import { useAppConfig } from '@/hooks/use-app-config';
import { SparklesIcon, ArrowRightIcon, StopIcon, DocumentTextIcon } from '@heroicons/react/24/solid';
import { streamAIResponse, getApiKey, setApiKey, AI_PROVIDERS, DEFAULT_MODEL_ID, getModelById, getProviderById, fetchOllamaStatus, type AIProvider, type OllamaStatus } from '@/lib/ai-client';
import { getProtocolIcon, PROTOCOLS } from '@/lib/protocol-icons';

const ScenarioEditor = dynamic(() => import('./scenario-editor').then((mod) => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-lg text-zinc-600 dark:text-zinc-400">Loading editor...</div>
    </div>
  ),
});

interface Scenario {
  id: string;
  name: string;
  description?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  steps?: Array<{
    id: string;
    name: string;
    type: string;
    status?: string;
    actions?: Array<{
      protocolId: string;
      actionId: string;
      protocol: string;
      action: string;
    }>;
  }>;
  metadata?: Record<string, any>;
}

interface ScenariosBentoProps {
  scenarios: Scenario[];
  onRefresh?: () => void;
  onDetailPaneChange?: (isOpen: boolean) => void;
  initialSelectedId?: string;
  initialTab?: string;
}

// Generation log for viewing LLM interaction history
interface GenerationLog {
  timestamp: string;
  prompt: string;
  modelId: string;
  modelName: string;
  providerName: string;
  protocols: string[];
  response: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

// Extend Scenario to match BentoItem interface
interface ScenarioBentoItem extends BentoItem {
  created_at?: string;
  updated_at?: string;
  steps?: Array<{
    id: string;
    name: string;
    type: string;
    status?: string;
    actions?: Array<{
      protocolId: string;
      actionId: string;
      protocol: string;
      action: string;
    }>;
  }>;
}

export default function ScenariosBento({ scenarios: initialScenarios, onRefresh, onDetailPaneChange, initialSelectedId, initialTab }: ScenariosBentoProps) {
  const router = useRouter();
  const { studioUrl, mcpUrl } = useAppConfig();
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [isDetailPaneOpen, setIsDetailPaneOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<{ id: string; onClose?: () => void } | null>(null);

  // AI Prompt state
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_MODEL_ID;
    const lastModel = localStorage.getItem('surfpool:last-model');
    if (lastModel && getModelById(lastModel)) {
      return lastModel;
    }
    return DEFAULT_MODEL_ID;
  });
  const [selectedProtocols, setSelectedProtocols] = useState<Set<string>>(new Set());
  const [streamedResponse, setStreamedResponse] = useState<string>('');
  const [apiKeys, setApiKeys] = useState({ groq: '', claude: '', openai: '', gemini: '', ollama: '' });
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [lastGenerationLog, setLastGenerationLog] = useState<GenerationLog | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('surfpool:last-generation-log');
    return stored ? JSON.parse(stored) : null;
  });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ available: false, models: [] });
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const currentPromptRef = React.useRef<string>('');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const responseRef = React.useRef<HTMLDivElement>(null);

  // Load API keys and check Ollama status on mount
  React.useEffect(() => {
    setApiKeys({
      groq: getApiKey('groq') || '',
      claude: getApiKey('claude') || '',
      openai: getApiKey('openai') || '',
      gemini: getApiKey('gemini') || '',
      ollama: getApiKey('ollama') || 'http://localhost:11434',
    });
    // Check Ollama availability
    fetchOllamaStatus().then(setOllamaStatus);
  }, []);

  // Save selected model to localStorage
  React.useEffect(() => {
    localStorage.setItem('surfpool:last-model', selectedModelId);
  }, [selectedModelId]);

  // Find selected model - check both static providers and dynamic Ollama models
  const selectedModel = getModelById(selectedModelId)
    || ollamaStatus.models.find(m => m.id === selectedModelId)
    || AI_PROVIDERS[0].models[0];
  const selectedProvider = getProviderById(selectedModel.provider) || AI_PROVIDERS[0];
  const hasApiKey = (provider: AIProvider) => {
    const providerConfig = getProviderById(provider);
    if (!providerConfig?.requiresKey) return true;
    return !!getApiKey(provider);
  };

  const exampleScenarios = [
    { label: 'Market Crash', prompt: 'SOL crashes from $145 to $85 in 10s, then rebounds to $110', icon: '📉', protocols: ['pyth'] },
    { label: 'DEX Arbitrage', prompt: 'JTO is 1% cheaper on Raydium AMM than on Raydium CLMM, enabling a SOL → JTO → SOL arbitrage', icon: '🔺', protocols: ['raydium'] },
    { label: 'Liquidation Arbitrage', prompt: 'A Kamino obligation worth ~$300k became unhealthy. Whirlpool and Raydium AMM pools are set up to create a profitable liquidation arbitrage path', icon: '💰', protocols: ['kamino', 'whirlpool', 'raydium'] },
    { label: 'Triangular Arbitrage', prompt: 'Create a triangular arbitrage opportunity across BTC/USD, ETH/USD, and ETH/BTC price feeds that yields a profitable trading cycle', icon: '🔄', protocols: ['pyth'] },
  ];

  const handleAiSubmit = async (promptText?: string) => {
    const basePrompt = promptText || aiPrompt;
    if (!basePrompt.trim() || isAiProcessing) return;

    // Check for API key
    if (!hasApiKey(selectedModel.provider)) {
      setAiError('Please configure your API key in the LLM selector first');
      return;
    }

    // Augment prompt with selected protocols
    const selectedProtocolNames = PROTOCOLS
      .filter(p => selectedProtocols.has(p.id))
      .map(p => p.name);

    let finalPrompt = basePrompt.trim();
    if (selectedProtocolNames.length > 0) {
      finalPrompt += `\n\nUse only these protocols: ${selectedProtocolNames.join(', ')}.`;
    }

    // Store prompt for log
    currentPromptRef.current = basePrompt.trim();

    setIsAiProcessing(true);
    setAiError(null);
    setStreamedResponse('');

    abortControllerRef.current = new AbortController();

    // Track response for logging (since state updates are async)
    let accumulatedResponse = '';
    let generationError: string | null = null;

    try {
      const stream = streamAIResponse(
        selectedModelId,
        finalPrompt,
        mcpUrl,
        abortControllerRef.current.signal
      );

      for await (const event of stream) {
        // Auto-scroll response
        if (responseRef.current) {
          responseRef.current.scrollTop = responseRef.current.scrollHeight;
        }

        switch (event.type) {
          case 'info':
            const infoLine = `[info] ${event.content}\n`;
            accumulatedResponse += infoLine;
            setStreamedResponse(prev => prev + infoLine);
            break;
          case 'text':
            accumulatedResponse += event.content;
            setStreamedResponse(prev => prev + event.content);
            break;
          case 'tool_use':
            const toolLine = `\n[tool] Calling ${event.content.name}...\n`;
            const inputLine = `  Input: ${JSON.stringify(event.content.input, null, 2)}\n`;
            accumulatedResponse += toolLine + inputLine;
            setStreamedResponse(prev => prev + toolLine);
            setStreamedResponse(prev => prev + inputLine);
            break;
          case 'tool_result':
            if (event.content.error) {
              const errorLine = `  Error: ${event.content.error}\n`;
              accumulatedResponse += errorLine;
              setStreamedResponse(prev => prev + errorLine);
            } else {
              const resultLine = `  Result: ${JSON.stringify(event.content.result, null, 2)}\n`;
              accumulatedResponse += resultLine;
              setStreamedResponse(prev => prev + resultLine);
              // Check if we got a scenario ID
              const result = event.content.result;
              if (result?.scenarioId || result?.scenario_id || result?.id) {
                const scenarioId = result.scenarioId || result.scenario_id || result.id;
                onRefresh?.();
                setTimeout(() => {
                  router.push(`/scenarios?id=${scenarioId}&tab=editor`);
                }, 500);
              }
            }
            break;
          case 'error':
            generationError = event.content;
            setAiError(event.content);
            break;
          case 'done':
            // Reload scenarios when LLM completes successfully
            onRefresh?.();
            break;
        }
      }

      setAiPrompt('');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        generationError = err.message || 'Failed to process request';
        setAiError(generationError);
      }
    } finally {
      setIsAiProcessing(false);

      // Save generation log to localStorage
      const log: GenerationLog = {
        timestamp: new Date().toISOString(),
        prompt: currentPromptRef.current,
        modelId: selectedModelId,
        modelName: selectedModel.name,
        providerName: selectedProvider.name,
        protocols: selectedProtocolNames,
        response: accumulatedResponse,
        status: generationError ? 'error' : 'success',
        errorMessage: generationError || undefined,
      };
      localStorage.setItem('surfpool:last-generation-log', JSON.stringify(log));
      setLastGenerationLog(log);
    }
  };

  const handleAiCancel = () => {
    abortControllerRef.current?.abort();
    setIsAiProcessing(false);
  };

  // Sync scenarios when initialScenarios changes
  useEffect(() => {
    logger.log('ScenariosBento: scenarios updated, count:', initialScenarios.length, 'IDs:', initialScenarios.map(s => s.id));
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
      // Use replace instead of push to avoid navigation issues
      router.replace(`/scenarios?id=${initialSelectedId}&tab=${tabId}`, { scroll: false });
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
      // POST to backend API
      const response = await fetch(`${studioUrl}/v1/scenarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: newScenario.id,
          name: newScenario.name,
          description: newScenario.description,
          overrides: [], // Backend expects "overrides" not "steps"
          tags: [],
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create scenario: ${response.status}`);
      }

      logger.log('Scenario created successfully:', newScenario.id);

      // Refresh from server to get the latest data first
      if (onRefresh) {
        onRefresh();
      }

      // Then navigate to the new scenario with detail pane open
      // Use a small delay to ensure refresh completes
      setTimeout(() => {
        logger.log('Navigating to new scenario:', newScenario.id);
        router.push(`/scenarios?id=${newScenario.id}&tab=overview`);
      }, 100);

      return newScenario.id;
    } catch (error) {
      console.error('Error creating scenario:', error);
      // Optionally show an error message to the user
      return null;
    }
  };

  // Update scenario
  const handleUpdateScenario = async (id: string, updates: Partial<Scenario>) => {
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return;

    const updatedScenario = { ...scenario, ...updates, updated_at: new Date().toISOString() };

    // Update local state immediately (optimistic update)
    setScenarios(scenarios.map(s =>
      s.id === id ? updatedScenario : s
    ));

    try {
      // Convert steps back to overrides format for backend
      const overrides = (updatedScenario.steps || []).flatMap((step, slotIndex) =>
        (step.actions || []).map((action) => ({
          id: `${action.protocolId}_${action.actionId}_${slotIndex}`,
          templateId: `${action.protocolId}_${action.actionId}`,
          values: {}, // Empty values for now, can be populated later if needed
          scenarioRelativeSlot: slotIndex + 1,
          label: action.action,
          enabled: true,
          fetchBeforeUse: false,
          account: { pubkey: '11111111111111111111111111111111' },
        }))
      );

      // PATCH to backend API
      const response = await fetch(`${studioUrl}/v1/scenarios/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: updatedScenario.id,
          name: updatedScenario.name,
          description: updatedScenario.description || '',
          overrides: overrides,
          tags: [],
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update scenario: ${response.status}`);
      }

      logger.log('Scenario updated successfully:', id);

      // Only refresh if detail pane is closed
      if (!isDetailPaneOpen && onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error updating scenario:', error);
      // Revert the optimistic update on error
      setScenarios(scenarios.map(s =>
        s.id === id ? scenario : s
      ));
    }
  };

  // Delete scenario
  const handleDeleteScenario = async (id: string) => {
    try {
      // DELETE from backend API
      const response = await fetch(`${studioUrl}/v1/scenarios/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete scenario: ${response.status}`);
      }

      logger.log('Scenario deleted successfully:', id);

      // Refresh from server to get the latest data
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error deleting scenario:', error);
    }
  };

  // Transform scenarios to match BentoItem interface - memoized to prevent infinite loops
  const bentoItems: ScenarioBentoItem[] = React.useMemo(() => scenarios.map((scenario) => ({
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
  })), [scenarios]);

  // Debug: log bentoItems before passing to GenericBento
  useEffect(() => {
    logger.log('ScenariosBento: bentoItems ready, count:', bentoItems.length, 'IDs:', bentoItems.map(i => i.id));
    logger.log('ScenariosBento: initialSelectedId:', initialSelectedId, 'initialTab:', initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bentoItems.length, initialSelectedId, initialTab]);

  const renderItem = (item: ScenarioBentoItem, isSelected: boolean) => {
    // Get actual slots from scenario data
    const slots = item.steps || [];

    return (
      <>
        <div
          className={`absolute inset-0 rounded-2xl transition-colors duration-200 ${
            isSelected
              ? 'bg-zinc-300 dark:bg-zinc-800'
              : 'bg-zinc-50 group-hover:bg-zinc-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800'
          }`}
        />
        <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(theme(borderRadius.2xl)+1px)] border border-zinc-200/40 transition-colors duration-200 group-hover:border-zinc-300/60 dark:border-zinc-700/30 dark:group-hover:border-zinc-600/50">
          {/* Header Section */}
          <div className="flex items-start justify-between p-6 pb-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-md truncate font-semibold text-zinc-950 dark:text-zinc-50">{item.name}</h3>
              {item.description && item.description !== 'null' && item.description !== 'No description available' && item.description !== 'Add a description...' && (
                <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
              )}
            </div>
          </div>

          {/* Footer Section with Timeline */}
          <div
            className="relative mt-auto border-t border-zinc-200/40 bg-zinc-100/50 py-4 dark:border-zinc-700/30 dark:bg-zinc-950/50"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(161, 161, 170, 0.15) 1px, transparent 1px)`,
              backgroundSize: '16px 16px',
            }}
          >
            {/* Timeline ruler line - at the very top, full width */}
            <div className="pointer-events-none absolute top-0 right-0 left-0 h-px bg-zinc-300 dark:bg-zinc-700" />

            {/* Timeline ticks - aligned with slot centers */}
            <div className="pointer-events-none absolute top-0 right-6 left-6 flex items-start gap-2">
              {slots.map((slot, slotIndex) => (
                <div
                  key={`tick-${slot.id}`}
                  className="flex flex-shrink-0 items-center justify-center"
                  style={{ width: '47px' }}
                >
                  <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-700" />
                </div>
              ))}
            </div>

            {/* Timeline slots */}
            <div className="relative px-6 pt-1">
              <div className="flex items-start gap-2 overflow-x-auto">
                {slots.map((slot, slotIndex) => {
                  const actions = slot.actions || [];
                  const maxVisible = 3;
                  const visibleActions = actions.slice(0, maxVisible);
                  const remaining = actions.length - maxVisible;

                  return (
                    <div
                      key={slot.id}
                      className="flex flex-shrink-0 flex-col items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <div className="flex flex-col gap-1">
                        {actions.length === 0 ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded">
                            <div className="h-4 w-4 rounded border border-dashed border-zinc-400 dark:border-zinc-600" />
                          </div>
                        ) : (
                          visibleActions.map((action, iconIndex) => {
                            const isLast = iconIndex === visibleActions.length - 1 && remaining > 0;
                            return (
                              <div
                                key={`${slot.id}-${action.actionId}-${iconIndex}`}
                                className="relative flex h-7 w-7 items-center justify-center rounded"
                                title={`${action.protocol}: ${action.action}`}
                              >
                                {isLast ? (
                                  <div className="flex h-full w-full items-center justify-center rounded bg-zinc-200 dark:bg-zinc-700">
                                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                                      +{remaining}
                                    </span>
                                  </div>
                                ) : (
                                  <img
                                    src={getProtocolIcon(action.protocolId)}
                                    alt={action.protocol}
                                    className="h-5 w-5"
                                  />
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-lg ring-1 shadow-zinc-950/[0.03] ring-zinc-950/5 transition-shadow duration-200 group-hover:shadow-xl group-hover:shadow-zinc-950/[0.05] dark:shadow-zinc-950/50 dark:ring-zinc-50/10 dark:group-hover:shadow-zinc-950/70" />
      </>
    );
  };

  const renderDetailHeader = (item: ScenarioBentoItem, onClose?: () => void) => (
    <div className="flex-1">
      {editingTitle === item.id ? (
        <input
          type="text"
          value={item.name}
          onChange={(e) => handleUpdateScenario(item.id, { name: e.target.value })}
          onBlur={() => setEditingTitle(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setEditingTitle(null);
          }}
          autoFocus
          className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-1 text-base font-semibold text-zinc-950 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:text-zinc-50"
        />
      ) : (
        <h2
          className="group flex items-center gap-2 truncate text-base font-semibold text-zinc-950 dark:text-zinc-50 cursor-pointer"
          onClick={() => setEditingTitle(item.id)}
        >
          {item.name}
          <PencilIcon className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
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
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 p-8 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                    Description
                  </h3>
                  {editingDescription === item.id ? (
                    <textarea
                      value={item.description === 'No description available' || item.description === 'Add a description...' ? '' : item.description}
                      onChange={(e) => handleUpdateScenario(item.id, { description: e.target.value })}
                      onBlur={() => setEditingDescription(null)}
                      autoFocus
                      rows={3}
                      className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-950 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:text-zinc-50"
                    />
                  ) : (
                    <p
                      className="group cursor-pointer text-sm text-zinc-950 dark:text-zinc-50 hover:text-zinc-700 dark:hover:text-zinc-300"
                      onClick={() => setEditingDescription(item.id)}
                    >
                      {item.description && item.description !== 'null' && item.description !== 'No description available' && item.description !== 'Add a description...'
                        ? item.description
                        : 'Click to add description...'}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                    Total Steps
                  </h3>
                  <p className="text-sm text-zinc-950 dark:text-zinc-50">{item.steps?.length || 0}</p>
                </div>
                {item.created_at && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                      Created At
                    </h3>
                    <p className="text-sm text-zinc-950 dark:text-zinc-50">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                {item.updated_at && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                      Last Updated
                    </h3>
                    <p className="text-sm text-zinc-950 dark:text-zinc-50">
                      {new Date(item.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'editor':
        return (
          <div className="h-[calc(100vh-300px)]">
            <ScenarioEditor
              scenarioId={item.id}
              scenarioName={item.name}
              scenarioDescription={item.description}
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

  // AI Header Component - v0 style
  const renderAIHeader = () => (
    <div className="mb-8 pt-8">
      <div className="mx-auto max-w-2xl">
        {/* v0-style input box */}
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-zinc-700/60 bg-gradient-to-b from-zinc-900 to-zinc-900/95 p-4 shadow-xl shadow-black/20">
          {/* Subtle top glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-600/20 to-transparent" />

          {/* Textarea-style input */}
          <textarea
            ref={inputRef}
            placeholder="Describe a scenario to simulate..."
            value={aiPrompt}
            onChange={(e) => {
              setAiPrompt(e.target.value);
              // Auto-resize textarea
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAiSubmit();
              }
            }}
            disabled={isAiProcessing}
            rows={1}
            className="block w-full resize-none bg-transparent text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
            style={{ minHeight: '28px', maxHeight: '200px' }}
          />

          {/* Bottom bar with agent selector and submit */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headless.Popover className="relative">
                <Headless.PopoverButton
                  className={`flex h-[42px] items-center gap-2 rounded-lg border border-transparent px-3 text-sm transition-all data-[hover]:border-zinc-700 data-[hover]:bg-zinc-800/50 ${
                    hasApiKey(selectedModel.provider)
                      ? 'text-zinc-300'
                      : 'border-amber-600/50 bg-amber-500/10 text-amber-400'
                  }`}
                  aria-label="Select AI model"
                >
                  <img
                    src={selectedProvider.icon}
                    alt=""
                    className="size-6"
                    style={{ filter: 'invert(1)' }}
                  />
                  <span className="block text-left">
                    <span className="block text-sm font-medium">{selectedProvider.name}</span>
                    <span className="block text-xs text-zinc-500">{selectedModel.name}</span>
                  </span>
                                    {selectedProvider.requiresKey && !hasApiKey(selectedModel.provider) && <span className="text-[10px] text-amber-400">(no key)</span>}
                  <svg className="ml-1 size-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </Headless.PopoverButton>
                <Headless.PopoverPanel
                  anchor="bottom start"
                  className="z-50 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl [--anchor-gap:8px]"
                >
                  {({ close }) => (
                    <>
                  <div className="mb-3 text-xs font-medium text-zinc-400">Select a model</div>
                  <div className="flex gap-2">
                    {/* Ollama first */}
                    {[AI_PROVIDERS.find(p => p.id === 'ollama')!].map(provider => {
                      const providerHasKey = hasApiKey(provider.id);
                      const noKey = provider.requiresKey && !providerHasKey;
                      const models = ollamaStatus.models;
                      const hasSelectedModel = models.some(m => m.id === selectedModelId);
                      const isOllamaUnavailable = !ollamaStatus.available;
                      return (
                        <div
                          key={provider.id}
                          className={`group flex w-24 flex-col items-center rounded-lg border p-2 transition-all ${
                            hasSelectedModel
                              ? 'border-zinc-600 bg-zinc-800/50'
                              : 'border-transparent hover:border-zinc-700 hover:bg-zinc-800/30'
                          }`}
                        >
                          <img src={provider.icon} alt="" className="size-8 dark:invert" />
                          <span className="mt-1 text-[10px] font-medium text-zinc-400">{provider.name}</span>
                          {!isOllamaUnavailable && (
                            <span className="mt-0.5 rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-medium text-emerald-400">Running</span>
                          )}
                          {isOllamaUnavailable && (
                            <span className="mt-0.5 text-[8px] text-zinc-500">not running</span>
                          )}
                          <div className="mt-2 flex w-full flex-col gap-1">
                            {models.length === 0 && (
                              <div className="px-2 py-1.5 text-center text-[10px] text-zinc-500">
                                {ollamaStatus.available ? 'No models' : 'Unavailable'}
                              </div>
                            )}
                            {models.map(model => {
                              const isSelected = selectedModelId === model.id;
                              return (
                                <button
                                  key={model.id}
                                  onClick={() => {
                                    setSelectedModelId(model.id);
                                    close();
                                  }}
                                  className={`flex flex-col items-center rounded px-2 py-1.5 text-center transition-all ${
                                    isSelected ? 'bg-zinc-700' : 'hover:bg-zinc-700/50'
                                  }`}
                                >
                                  <span className="text-xs font-medium text-zinc-200">{model.name}</span>
                                  <span className="text-[10px] text-zinc-500">{model.description}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Separator */}
                    <div className="w-px self-stretch bg-zinc-700" />

                    {/* Other providers alphabetically */}
                    {[...AI_PROVIDERS].filter(p => p.id !== 'ollama').sort((a, b) => a.name.localeCompare(b.name)).map(provider => {
                      const providerHasKey = hasApiKey(provider.id);
                      const noKey = provider.requiresKey && !providerHasKey;
                      const models = provider.models;
                      const hasSelectedModel = models.some(m => m.id === selectedModelId);
                      return (
                        <div
                          key={provider.id}
                          className={`group flex w-24 flex-col items-center rounded-lg border p-2 transition-all ${
                            hasSelectedModel
                              ? 'border-zinc-600 bg-zinc-800/50'
                              : 'border-transparent hover:border-zinc-700 hover:bg-zinc-800/30'
                          }`}
                        >
                          {/* Provider header - icon and name centered */}
                          <img src={provider.icon} alt="" className="size-8 dark:invert" />
                          <span className="mt-1 text-[10px] font-medium text-zinc-400">{provider.name}</span>
                          {providerHasKey && (
                            <span className="mt-0.5 rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-medium text-emerald-400">✓ Connected</span>
                          )}
                          {noKey && (
                            <span className="mt-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-[8px] font-medium text-amber-400">API key required</span>
                          )}

                          {/* Models */}
                          <div className="mt-2 flex w-full flex-col gap-1">
                            {models.map(model => {
                              const isSelected = selectedModelId === model.id;
                              return (
                                <button
                                  key={model.id}
                                  onClick={() => {
                                    setSelectedModelId(model.id);
                                    // Auto-close if no key is needed or key already exists
                                    if (!provider.requiresKey || providerHasKey) {
                                      close();
                                    }
                                  }}
                                  className={`flex flex-col items-center rounded px-2 py-1.5 text-center transition-all ${
                                    isSelected
                                      ? 'bg-zinc-700'
                                      : noKey
                                        ? 'opacity-50 hover:bg-zinc-700/50 hover:opacity-75'
                                        : 'hover:bg-zinc-700/50'
                                  }`}
                                >
                                  <span className="text-xs font-medium text-zinc-200">{model.name}</span>
                                  <span className="text-[10px] text-zinc-500">{model.description}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Inline API key input when selected provider needs a key */}
                  {selectedProvider.requiresKey && !hasApiKey(selectedModel.provider) && (
                    <div className="mt-3 border-t border-zinc-800 pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <img src={selectedProvider.icon} alt="" className="size-4 dark:invert" />
                        <span className="text-xs font-medium text-zinc-300">{selectedProvider.name} API Key</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder={selectedModel.provider === 'groq' ? 'gsk_...' : selectedModel.provider === 'claude' ? 'sk-ant-...' : selectedModel.provider === 'openai' ? 'sk-...' : 'AIza...'}
                          value={apiKeys[selectedModel.provider as keyof typeof apiKeys] || ''}
                          onChange={(e) => setApiKeys(prev => ({ ...prev, [selectedModel.provider]: e.target.value }))}
                          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                        />
                        <Headless.CloseButton
                          as="button"
                          onClick={() => {
                            const key = apiKeys[selectedModel.provider as keyof typeof apiKeys];
                            if (key) {
                              setApiKey(selectedModel.provider, key);
                              // Force re-read from localStorage to update hasApiKey checks
                              setApiKeys(prev => ({ ...prev, [selectedModel.provider]: key }));
                            }
                          }}
                          className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
                        >
                          Save
                        </Headless.CloseButton>
                      </div>
                      <p className="mt-1.5 text-[10px] text-zinc-500">
                        {selectedModel.provider === 'groq' && <>Get your free API key at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">console.groq.com</a></>}
                        {selectedModel.provider === 'claude' && <>Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">console.anthropic.com</a></>}
                        {selectedModel.provider === 'openai' && <>Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">platform.openai.com</a></>}
                        {selectedModel.provider === 'gemini' && <>Get your key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">aistudio.google.com</a></>}
                      </p>
                    </div>
                  )}
                    </>
                  )}
                </Headless.PopoverPanel>
              </Headless.Popover>

              {/* Protocol selector */}
              <Headless.Popover className="relative">
                <Headless.PopoverButton className="flex h-[42px] items-center gap-1 rounded-lg border border-transparent px-3 transition-all data-[hover]:border-zinc-700 data-[hover]:bg-zinc-800/50">
                  <div className="flex items-center gap-1">
                    {/* Selected protocols (colored, left) */}
                    {PROTOCOLS.filter(p => selectedProtocols.has(p.id)).map(protocol => (
                      <img
                        key={protocol.id}
                        src={protocol.icon}
                        alt={protocol.name}
                        title={protocol.name}
                        className="size-6"
                      />
                    ))}
                    {/* Unselected protocols (grayscale, right) */}
                    {PROTOCOLS.filter(p => !selectedProtocols.has(p.id)).map(protocol => (
                      <img
                        key={protocol.id}
                        src={protocol.icon}
                        alt={protocol.name}
                        title={protocol.name}
                        className="size-6 opacity-30 grayscale"
                      />
                    ))}
                  </div>
                  <svg className="ml-1 size-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </Headless.PopoverButton>
                <Headless.PopoverPanel
                  anchor="top end"
                  className="z-50 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl [--anchor-gap:8px]"
                >
                  <div className="mb-2 text-xs font-medium text-zinc-400">Select protocols to include</div>
                  <div className="grid grid-cols-4 gap-2">
                    {PROTOCOLS.map(protocol => {
                      const isSelected = selectedProtocols.has(protocol.id);
                      return (
                        <button
                          key={protocol.id}
                          onClick={() => {
                            setSelectedProtocols(prev => {
                              const next = new Set(prev);
                              if (next.has(protocol.id)) {
                                next.delete(protocol.id);
                              } else {
                                next.add(protocol.id);
                              }
                              return next;
                            });
                          }}
                          className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-all ${
                            isSelected
                              ? 'bg-zinc-800 ring-1 ring-zinc-600'
                              : 'opacity-40 grayscale hover:opacity-70 hover:grayscale-0'
                          }`}
                          title={protocol.name}
                        >
                          <img src={protocol.icon} alt={protocol.name} className="size-6" />
                          <span className="text-[10px] text-zinc-400">{protocol.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between border-t border-zinc-800 pt-2">
                    <button
                      onClick={() => setSelectedProtocols(new Set(PROTOCOLS.map(p => p.id)))}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelectedProtocols(new Set())}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Clear all
                    </button>
                  </div>
                </Headless.PopoverPanel>
              </Headless.Popover>
            </div>

            {/* View last log button */}
            {lastGenerationLog && (
              <button
                onClick={() => setLogModalOpen(true)}
                title="View last generation log"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition-all hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-300"
              >
                <DocumentTextIcon className="h-4 w-4" />
              </button>
            )}

            <button
              onClick={() => isAiProcessing ? handleAiCancel() : handleAiSubmit()}
              disabled={!aiPrompt.trim() && !isAiProcessing}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
                isAiProcessing
                  ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                  : aiPrompt.trim()
                    ? 'border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white'
                    : 'border-zinc-700 bg-transparent text-zinc-600'
              }`}
            >
              {isAiProcessing ? (
                <StopIcon className="h-4 w-4" />
              ) : (
                <ArrowRightIcon className="h-4 w-4 -rotate-90" />
              )}
            </button>
          </div>

          {/* Streaming response */}
          {(streamedResponse || isAiProcessing) && (
            <div className="mt-3 border-t border-zinc-800 pt-3">
              {isAiProcessing && !streamedResponse && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-fuchsia-500" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-pink-500" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-zinc-500">Connecting...</span>
                </div>
              )}
              {streamedResponse && (
                <div
                  ref={responseRef}
                  className="max-h-48 overflow-y-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300"
                >
                  <pre className="whitespace-pre-wrap">{streamedResponse}</pre>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {aiError && (
            <div className="mt-3 flex items-center gap-2 border-t border-zinc-800 pt-3 text-xs text-red-400">
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {aiError}
            </div>
          )}
        </div>

        {/* Example scenario buttons - v0 style */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {exampleScenarios.map((example) => (
            <button
              key={example.label}
              onClick={() => {
                setAiPrompt(example.prompt);
                setSelectedProtocols(new Set(example.protocols));
                // Auto-resize textarea after setting prompt
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.style.height = 'auto';
                    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
                    inputRef.current.focus();
                  }
                }, 0);
              }}
              disabled={isAiProcessing}
              className="flex items-center gap-2 rounded-full border border-zinc-700/50 bg-zinc-900/30 px-4 py-2 text-sm text-zinc-400 transition-all hover:border-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-300 disabled:opacity-50"
            >
              <span>{example.icon}</span>
              <span>{example.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative h-full">
      {/* AI Header - always visible */}
      {!isDetailPaneOpen && renderAIHeader()}

      <GenericBento
        items={bentoItems}
        searchPlaceholder="Search scenarios..."
        emptyMessage="No scenarios found"
        emptyState={
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <SparklesIcon className="h-12 w-12 text-zinc-600 mb-4" />
            <p className="text-zinc-400 mb-4">No scenarios yet</p>
            <p className="text-sm text-zinc-500 max-w-md">
              Use the AI prompt above to generate a scenario, or click the + button to create one manually.
            </p>
          </div>
        }
        renderItem={renderItem}
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

      {/* Add New Scenario Button - Fixed at bottom right */}
      {!isDetailPaneOpen && (
        <div className="fixed right-6 bottom-6 z-50">
          <button
            onClick={handleCreateScenario}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg transition-all duration-200 hover:scale-110 hover:bg-pink-400 hover:shadow-xl"
            title="Create new scenario"
          >
            <PlusIcon className="h-7 w-7" />
          </button>
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

      {/* Generation Log Modal */}
      <Dialog open={logModalOpen} onClose={setLogModalOpen} size="3xl">
        <DialogTitle>Last Generation Log</DialogTitle>
        {lastGenerationLog && (
          <DialogBody>
            {/* Header info */}
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">
                {lastGenerationLog.providerName} {lastGenerationLog.modelName}
              </span>
              <span className="text-xs text-zinc-500">
                {new Date(lastGenerationLog.timestamp).toLocaleString()}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                lastGenerationLog.status === 'success'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {lastGenerationLog.status === 'success' ? '✓ Success' : '✗ Error'}
              </span>
            </div>

            {/* Prompt section */}
            <div className="mb-4">
              <div className="mb-1 text-xs font-medium text-zinc-400">Prompt</div>
              <div className="rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
                {lastGenerationLog.prompt}
              </div>
            </div>

            {/* Protocols section */}
            {lastGenerationLog.protocols.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium text-zinc-400">Protocols</div>
                <div className="flex flex-wrap gap-1">
                  {lastGenerationLog.protocols.map(protocol => (
                    <span key={protocol} className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      {protocol}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Error message */}
            {lastGenerationLog.errorMessage && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium text-red-400">Error</div>
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                  {lastGenerationLog.errorMessage}
                </div>
              </div>
            )}

            {/* Response section */}
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-400">Response</div>
              <div className="max-h-80 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                <pre className="whitespace-pre-wrap">{lastGenerationLog.response || '(no response)'}</pre>
              </div>
            </div>
          </DialogBody>
        )}
        <DialogActions>
          <Button color="dark" onClick={() => setLogModalOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
