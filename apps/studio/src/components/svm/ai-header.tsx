'use client';

import { useAppConfig } from '@/hooks/use-app-config';
import {
  AI_PROVIDERS,
  DEFAULT_MODEL_ID,
  fetchOllamaStatus,
  getApiKey,
  getModelById,
  getProviderById,
  setApiKey,
  streamAIResponse,
  type AIProvider,
  type OllamaStatus,
} from '@/lib/ai-client';
import { PROTOCOLS } from '@/lib/protocol-icons';
import { buildAiPrompt } from '@/lib/scenarios-api';
import * as Headless from '@headlessui/react';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  StopIcon,
} from '@heroicons/react/24/solid';
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Switch } from '@surfpool/ui';
import React, { useState } from 'react';
import { exampleScenarios, type ExampleScenario, type GenerationLog } from './scenarios-bento.types';

interface AIHeaderProps {
  onRefresh?: () => void;
  onScenarioNavigate?: (scenarioId: string) => void;
}

interface ExampleScenarioChipProps {
  disabled: boolean;
  example: ExampleScenario;
  onSelect: (example: ExampleScenario) => void;
}

interface ExampleScenarioRowProps {
  disabled: boolean;
  examples: ExampleScenario[];
  label: string;
  onSelect: (example: ExampleScenario) => void;
}

function ExampleScenarioChip({ disabled, example, onSelect }: ExampleScenarioChipProps) {
  const handleSelect = () => {
    onSelect(example);
  };

  return (
    <button
      type="button"
      onClick={handleSelect}
      disabled={disabled}
      className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-700/50 bg-zinc-900/30 px-4 py-2 text-sm text-zinc-400 transition-all hover:border-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-300 disabled:opacity-50"
    >
      <span>{example.icon}</span>
      <span>{example.label}</span>
    </button>
  );
}

function ExampleScenarioRow({ disabled, examples, label, onSelect }: ExampleScenarioRowProps) {
  function renderExampleScenario(example: ExampleScenario) {
    return <ExampleScenarioChip key={example.label} disabled={disabled} example={example} onSelect={onSelect} />;
  }

  return (
    <div role="group" aria-label={label} className="flex min-w-max items-center gap-2">
      {examples.map(renderExampleScenario)}
    </div>
  );
}

export default function AIHeader({ onRefresh, onScenarioNavigate }: AIHeaderProps) {
  const { mcpUrl } = useAppConfig();

  // AI state
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
  const [thinkingEnabled, setThinkingEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('surfpool:thinking-enabled') !== 'false';
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
  const [canScrollExamplesLeft, setCanScrollExamplesLeft] = useState(false);
  const [canScrollExamplesRight, setCanScrollExamplesRight] = useState(false);

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const currentPromptRef = React.useRef<string>('');
  const exampleScrollerRef = React.useRef<HTMLDivElement>(null);
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
    fetchOllamaStatus().then(setOllamaStatus);
  }, []);

  // Save selected model to localStorage
  React.useEffect(() => {
    localStorage.setItem('surfpool:last-model', selectedModelId);
  }, [selectedModelId]);

  React.useEffect(() => {
    const scroller = exampleScrollerRef.current;
    if (!scroller) return;

    function updateScrollControls() {
      const currentScroller = exampleScrollerRef.current;
      if (!currentScroller) return;

      const maxScrollLeft = currentScroller.scrollWidth - currentScroller.clientWidth;
      setCanScrollExamplesLeft(currentScroller.scrollLeft > 1);
      setCanScrollExamplesRight(currentScroller.scrollLeft < maxScrollLeft - 1);
    }

    scroller.addEventListener('scroll', updateScrollControls, { passive: true });
    window.addEventListener('resize', updateScrollControls);
    updateScrollControls();

    return () => {
      scroller.removeEventListener('scroll', updateScrollControls);
      window.removeEventListener('resize', updateScrollControls);
    };
  }, []);

  // Find selected model
  const selectedModel =
    getModelById(selectedModelId) ||
    ollamaStatus.models.find((m) => m.id === selectedModelId) ||
    AI_PROVIDERS[0].models[0];
  const selectedProvider = getProviderById(selectedModel.provider) || AI_PROVIDERS[0];
  const thinkingToggleable =
    selectedModel.provider === 'openai' || selectedModelId === 'claude-sonnet' || selectedModelId === 'claude-opus';
  const thinkingChecked = thinkingToggleable ? thinkingEnabled : selectedModelId === 'claude-fable';
  const handleThinkingChange = (value: boolean) => {
    setThinkingEnabled(value);
    if (typeof window !== 'undefined') localStorage.setItem('surfpool:thinking-enabled', String(value));
  };

  // Protocol chips on the bar: selected first, capped at 5, with a "+N" overflow count.
  const PROTOCOL_ICON_LIMIT = 5;
  const orderedProtocols = [
    ...PROTOCOLS.filter((p) => selectedProtocols.has(p.id)),
    ...PROTOCOLS.filter((p) => !selectedProtocols.has(p.id)),
  ];
  const visibleProtocols = orderedProtocols.slice(0, PROTOCOL_ICON_LIMIT);
  const hiddenProtocolCount = orderedProtocols.length - visibleProtocols.length;
  const exampleRowLength = Math.ceil(exampleScenarios.length / 2);
  const firstExampleRow = exampleScenarios.slice(0, exampleRowLength);
  const secondExampleRow = exampleScenarios.slice(exampleRowLength);

  const hasApiKey = (provider: AIProvider) => {
    const providerConfig = getProviderById(provider);
    if (!providerConfig?.requiresKey) return true;
    return !!getApiKey(provider);
  };

  const handleAiSubmit = async (promptText?: string) => {
    const basePrompt = promptText || aiPrompt;
    if (!basePrompt.trim() || isAiProcessing) return;

    if (!hasApiKey(selectedModel.provider)) {
      setAiError('Please configure your API key in the LLM selector first');
      return;
    }

    const finalPrompt = buildAiPrompt(basePrompt, selectedProtocols);
    const selectedProtocolNames = PROTOCOLS.filter((p) => selectedProtocols.has(p.id)).map((p) => p.name);

    currentPromptRef.current = basePrompt.trim();

    setIsAiProcessing(true);
    setAiError(null);
    setStreamedResponse('');

    abortControllerRef.current = new AbortController();

    let accumulatedResponse = '';
    let generationError: string | null = null;

    try {
      const stream = streamAIResponse(
        selectedModelId,
        finalPrompt,
        mcpUrl,
        abortControllerRef.current.signal,
        thinkingEnabled
      );

      for await (const event of stream) {
        if (responseRef.current) {
          responseRef.current.scrollTop = responseRef.current.scrollHeight;
        }

        switch (event.type) {
          case 'info':
            const infoLine = `[info] ${event.content}\n`;
            accumulatedResponse += infoLine;
            setStreamedResponse((prev) => prev + infoLine);
            break;
          case 'text':
            accumulatedResponse += event.content;
            setStreamedResponse((prev) => prev + event.content);
            break;
          case 'tool_use':
            const toolLine = `\n[tool] Calling ${event.content.name}...\n`;
            const inputLine = `  Input: ${JSON.stringify(event.content.input, null, 2)}\n`;
            accumulatedResponse += toolLine + inputLine;
            setStreamedResponse((prev) => prev + toolLine);
            setStreamedResponse((prev) => prev + inputLine);
            break;
          case 'tool_result':
            if (event.content.error) {
              const errorLine = `  Error: ${event.content.error}\n`;
              accumulatedResponse += errorLine;
              setStreamedResponse((prev) => prev + errorLine);
            } else {
              const resultLine = `  Result: ${JSON.stringify(event.content.result, null, 2)}\n`;
              accumulatedResponse += resultLine;
              setStreamedResponse((prev) => prev + resultLine);
              const result = event.content.result;
              if (result?.scenarioId || result?.scenario_id || result?.id) {
                const scenarioId = result.scenarioId || result.scenario_id || result.id;
                onRefresh?.();
                setTimeout(() => {
                  onScenarioNavigate?.(scenarioId);
                }, 500);
              }
            }
            break;
          case 'error':
            generationError = event.content;
            setAiError(event.content);
            break;
          case 'done':
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

  const handleExampleScenarioSelect = (example: ExampleScenario) => {
    setAiPrompt(example.prompt);
    setSelectedProtocols(new Set(example.protocols));
    setTimeout(() => {
      if (!inputRef.current) return;

      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      inputRef.current.focus();
    }, 0);
  };

  const scrollExampleScenarios = (direction: -1 | 1) => {
    const scroller = exampleScrollerRef.current;
    if (!scroller) return;

    scroller.scrollBy({
      behavior: 'smooth',
      left: direction * Math.max(scroller.clientWidth * 0.7, 280),
    });
  };

  const handleScrollExamplesLeft = () => {
    scrollExampleScenarios(-1);
  };

  const handleScrollExamplesRight = () => {
    scrollExampleScenarios(1);
  };

  return (
    <>
      <div className="mb-10 pt-8">
        <div className="mx-auto max-w-2xl">
          {/* v0-style input box */}
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-zinc-700/60 bg-gradient-to-b from-zinc-900 to-zinc-900/95 p-4 shadow-xl shadow-black/20">
            {/* Subtle top glow */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-600/20 to-transparent" />

            {/* Textarea-style input */}
            <textarea
              ref={inputRef}
              placeholder="Describe a scenario to simulate..."
              value={aiPrompt}
              onChange={(e) => {
                setAiPrompt(e.target.value);
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
                    <img src={selectedProvider.icon} alt="" className="size-6" style={{ filter: 'invert(1)' }} />
                    <span className="block text-left">
                      <span className="block whitespace-nowrap text-sm font-medium">{selectedProvider.name}</span>
                      <span className="block whitespace-nowrap text-xs text-zinc-500">{selectedModel.name}</span>
                    </span>
                    {selectedProvider.requiresKey && !hasApiKey(selectedModel.provider) && (
                      <span className="text-[10px] text-amber-400">(no key)</span>
                    )}
                    <svg
                      className="ml-1 size-4 shrink-0 text-zinc-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                      />
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
                          {[AI_PROVIDERS.find((p) => p.id === 'ollama')!].map((provider) => {
                            const providerHasKey = hasApiKey(provider.id);
                            const noKey = provider.requiresKey && !providerHasKey;
                            const models = ollamaStatus.models;
                            const hasSelectedModel = models.some((m) => m.id === selectedModelId);
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
                                  <span className="mt-0.5 rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-medium text-emerald-400">
                                    Running
                                  </span>
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
                                  {models.map((model) => {
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
                          {[...AI_PROVIDERS]
                            .filter((p) => p.id !== 'ollama')
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((provider) => {
                              const providerHasKey = hasApiKey(provider.id);
                              const noKey = provider.requiresKey && !providerHasKey;
                              const models = provider.models;
                              const hasSelectedModel = models.some((m) => m.id === selectedModelId);
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
                                  {providerHasKey && (
                                    <span className="mt-0.5 rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-medium text-emerald-400">
                                      ✓ Connected
                                    </span>
                                  )}
                                  {noKey && (
                                    <span className="mt-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-[8px] font-medium text-amber-400">
                                      API key required
                                    </span>
                                  )}

                                  <div className="mt-2 flex w-full flex-col gap-1">
                                    {models.map((model) => {
                                      const isSelected = selectedModelId === model.id;
                                      return (
                                        <button
                                          key={model.id}
                                          onClick={() => {
                                            setSelectedModelId(model.id);
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
                            <div className="mb-2 flex items-center gap-2">
                              <img src={selectedProvider.icon} alt="" className="size-4 dark:invert" />
                              <span className="text-xs font-medium text-zinc-300">{selectedProvider.name} API Key</span>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="password"
                                placeholder={
                                  selectedModel.provider === 'groq'
                                    ? 'gsk_...'
                                    : selectedModel.provider === 'claude'
                                      ? 'sk-ant-...'
                                      : selectedModel.provider === 'openai'
                                        ? 'sk-...'
                                        : 'AIza...'
                                }
                                value={apiKeys[selectedModel.provider as keyof typeof apiKeys] || ''}
                                onChange={(e) =>
                                  setApiKeys((prev) => ({ ...prev, [selectedModel.provider]: e.target.value }))
                                }
                                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                              />
                              <Headless.CloseButton
                                as="button"
                                onClick={() => {
                                  const key = apiKeys[selectedModel.provider as keyof typeof apiKeys];
                                  if (key) {
                                    setApiKey(selectedModel.provider, key);
                                    setApiKeys((prev) => ({ ...prev, [selectedModel.provider]: key }));
                                  }
                                }}
                                className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
                              >
                                Save
                              </Headless.CloseButton>
                            </div>
                            <p className="mt-1.5 text-[10px] text-zinc-500">
                              {selectedModel.provider === 'groq' && (
                                <>
                                  Get your free API key at{' '}
                                  <a
                                    href="https://console.groq.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-zinc-400"
                                  >
                                    console.groq.com
                                  </a>
                                </>
                              )}
                              {selectedModel.provider === 'claude' && (
                                <>
                                  Get your key at{' '}
                                  <a
                                    href="https://console.anthropic.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-zinc-400"
                                  >
                                    console.anthropic.com
                                  </a>
                                </>
                              )}
                              {selectedModel.provider === 'openai' && (
                                <>
                                  Get your key at{' '}
                                  <a
                                    href="https://platform.openai.com/api-keys"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-zinc-400"
                                  >
                                    platform.openai.com
                                  </a>
                                </>
                              )}
                              {selectedModel.provider === 'gemini' && (
                                <>
                                  Get your key at{' '}
                                  <a
                                    href="https://aistudio.google.com/apikey"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-zinc-400"
                                  >
                                    aistudio.google.com
                                  </a>
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </Headless.PopoverPanel>
                </Headless.Popover>
                <div className="flex h-[42px] items-center gap-2 rounded-lg border border-transparent px-3">
                  <span className={`text-xs ${thinkingToggleable ? 'text-zinc-400' : 'text-zinc-600'}`}>Thinking</span>
                  <Switch
                    checked={thinkingChecked}
                    onChange={handleThinkingChange}
                    disabled={!thinkingToggleable}
                    color="violet"
                  />
                </div>

                {/* Protocol selector */}
                <Headless.Popover className="relative">
                  <Headless.PopoverButton className="flex h-[42px] items-center gap-1 rounded-lg border border-transparent px-3 transition-all data-[hover]:border-zinc-700 data-[hover]:bg-zinc-800/50">
                    <div className="flex items-center gap-1">
                      {visibleProtocols.map((protocol) => (
                        <img
                          key={protocol.id}
                          src={protocol.icon}
                          alt={protocol.name}
                          title={protocol.name}
                          className={`size-6 ${selectedProtocols.has(protocol.id) ? '' : 'opacity-30 grayscale'}`}
                        />
                      ))}
                      {hiddenProtocolCount > 0 && (
                        <span className="ml-0.5 text-xs text-zinc-500">+{hiddenProtocolCount}</span>
                      )}
                    </div>
                    <svg
                      className="ml-1 size-4 shrink-0 text-zinc-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                      />
                    </svg>
                  </Headless.PopoverButton>
                  <Headless.PopoverPanel
                    anchor="top end"
                    className="z-50 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl [--anchor-gap:8px]"
                  >
                    <div className="mb-2 text-xs font-medium text-zinc-400">Select protocols to include</div>
                    <div className="grid grid-cols-4 gap-2">
                      {PROTOCOLS.map((protocol) => {
                        const isSelected = selectedProtocols.has(protocol.id);
                        return (
                          <button
                            key={protocol.id}
                            onClick={() => {
                              setSelectedProtocols((prev) => {
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
                        onClick={() => setSelectedProtocols(new Set(PROTOCOLS.map((p) => p.id)))}
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
                onClick={() => (isAiProcessing ? handleAiCancel() : handleAiSubmit())}
                disabled={!aiPrompt.trim() && !isAiProcessing}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
                  isAiProcessing
                    ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : aiPrompt.trim()
                      ? 'border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white'
                      : 'border-zinc-700 bg-transparent text-zinc-600'
                }`}
              >
                {isAiProcessing ? <StopIcon className="h-4 w-4" /> : <ArrowRightIcon className="h-4 w-4 -rotate-90" />}
              </button>
            </div>

            {/* Streaming response */}
            {(streamedResponse || isAiProcessing) && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                {isAiProcessing && !streamedResponse && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span
                        className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-fuchsia-500"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-pink-500"
                        style={{ animationDelay: '300ms' }}
                      />
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {aiError}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-3">
            <button
              type="button"
              aria-label="Scroll example scenarios left"
              onClick={handleScrollExamplesLeft}
              disabled={!canScrollExamplesLeft}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/70 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>

            <div
              ref={exampleScrollerRef}
              aria-label="Example scenarios"
              className="overflow-x-auto overscroll-x-contain scroll-smooth px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="w-max space-y-3">
                <ExampleScenarioRow
                  disabled={isAiProcessing}
                  examples={firstExampleRow}
                  label="Example scenarios row 1"
                  onSelect={handleExampleScenarioSelect}
                />
                <ExampleScenarioRow
                  disabled={isAiProcessing}
                  examples={secondExampleRow}
                  label="Example scenarios row 2"
                  onSelect={handleExampleScenarioSelect}
                />
              </div>
            </div>

            <button
              type="button"
              aria-label="Scroll example scenarios right"
              onClick={handleScrollExamplesRight}
              disabled={!canScrollExamplesRight}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/70 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Generation Log Modal */}
      <Dialog open={logModalOpen} onClose={setLogModalOpen} size="3xl">
        <DialogTitle>Last Generation Log</DialogTitle>
        {lastGenerationLog && (
          <DialogBody>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">
                {lastGenerationLog.providerName} {lastGenerationLog.modelName}
              </span>
              <span className="text-xs text-zinc-500">{new Date(lastGenerationLog.timestamp).toLocaleString()}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  lastGenerationLog.status === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {lastGenerationLog.status === 'success' ? '✓ Success' : '✗ Error'}
              </span>
            </div>

            <div className="mb-4">
              <div className="mb-1 text-xs font-medium text-zinc-400">Prompt</div>
              <div className="rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">{lastGenerationLog.prompt}</div>
            </div>

            {lastGenerationLog.protocols.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium text-zinc-400">Protocols</div>
                <div className="flex flex-wrap gap-1">
                  {lastGenerationLog.protocols.map((protocol) => (
                    <span key={protocol} className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      {protocol}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lastGenerationLog.errorMessage && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium text-red-400">Error</div>
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                  {lastGenerationLog.errorMessage}
                </div>
              </div>
            )}

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
    </>
  );
}
