'use client';

import { useAppConfig } from '@/hooks/use-app-config';
import { logger } from '@surfpool/shared';
import { SparklesIcon, ArrowRightIcon, StopIcon } from '@heroicons/react/24/solid';
import { useState, useRef, useEffect } from 'react';

interface AIScenarioPromptProps {
  onScenarioCreated?: (scenarioId: string) => void;
  className?: string;
}

export default function AIScenarioPrompt({ onScenarioCreated, className = '' }: AIScenarioPromptProps) {
  const { studioUrl } = useAppConfig();
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll response container
  useEffect(() => {
    if (responseContainerRef.current) {
      responseContainerRef.current.scrollTop = responseContainerRef.current.scrollHeight;
    }
  }, [streamedResponse]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Collapse when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (prompt === '' && !isProcessing) {
          setIsExpanded(false);
          setStreamedResponse('');
          setError(null);
        }
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded, prompt, isProcessing]);

  const sessionIdRef = useRef<string | null>(null);

  const sendMcpRequest = async (request: Record<string, unknown>): Promise<Record<string, any> | null> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };

    // Include session ID if we have one
    if (sessionIdRef.current) {
      headers['Mcp-Session-Id'] = sessionIdRef.current;
    }

    const response = await fetch(`${studioUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: abortControllerRef.current?.signal,
    });

    // Capture session ID from response (try both case variations)
    const newSessionId = response.headers.get('Mcp-Session-Id') || response.headers.get('mcp-session-id');
    if (newSessionId) {
      logger.log('🤖 Got session ID:', newSessionId);
      sessionIdRef.current = newSessionId;
    }

    // Debug: log all response headers
    logger.log('🤖 Response headers:', [...response.headers.entries()]);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Request failed (${response.status}): ${errorText}`);
    }

    // Check if it's SSE or JSON response
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // Read SSE stream and collect all events
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let result: Record<string, any> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              logger.log('🤖 MCP SSE event:', parsed);
              if (parsed.result) result = parsed;
              if (parsed.error) throw new Error(parsed.error.message);
            } catch (e: unknown) {
              if (e instanceof Error && !e.message.includes('JSON')) throw e;
            }
          }
        }
      }
      return result;
    } else {
      // Regular JSON response
      return await response.json();
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || isProcessing) return;

    setIsProcessing(true);
    setStreamedResponse('');
    setError(null);

    abortControllerRef.current = new AbortController();
    sessionIdRef.current = null; // Reset session for new request

    try {
      logger.log('🤖 Initializing MCP session...');

      // Step 1: Initialize the MCP session
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'surfpool-studio',
            version: '1.0.0',
          },
        },
      };

      const initResponse = await sendMcpRequest(initRequest);
      logger.log('🤖 MCP initialized:', initResponse);

      // Step 2: Send initialized notification
      const initializedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      };
      await sendMcpRequest(initializedNotification);
      logger.log('🤖 MCP initialized notification sent');

      // Step 3: Call the tool
      const toolRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'create_scenario',
          arguments: {
            prompt: prompt.trim(),
          },
        },
      };

      logger.log('🤖 Calling tool:', toolRequest);
      const toolResponse = await sendMcpRequest(toolRequest);
      logger.log('🤖 Tool response:', toolResponse);

      if (toolResponse?.error) {
        throw new Error(toolResponse.error.message || 'Tool call failed');
      }

      if (toolResponse?.result) {
        const resultStr = typeof toolResponse.result === 'string'
          ? toolResponse.result
          : JSON.stringify(toolResponse.result, null, 2);
        setStreamedResponse(resultStr);

        const scenarioId = toolResponse.result.scenarioId || toolResponse.result.scenario_id || toolResponse.result.id;
        if (scenarioId) {
          onScenarioCreated?.(scenarioId);
        }
        setPrompt('');
      } else {
        setStreamedResponse('Request completed');
      }
    } catch (err: any) {
      console.error('🤖 MCP error:', err);
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to process request');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setIsProcessing(false);
    setStreamedResponse('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      if (!isProcessing) {
        setIsExpanded(false);
        setPrompt('');
        setStreamedResponse('');
        setError(null);
      }
    }
  };

  const examplePrompts = [
    'Swap 1 SOL to USDC via Jupiter',
    'Deposit USDC into Kamino lending',
    'Create a token mint and mint 1000 tokens',
  ];

  return (
    <div ref={containerRef} className={`relative mt-2 ${className}`}>
      <div
        className={`relative h-12 transition-all duration-300 ease-out ${
          isExpanded ? 'w-[600px]' : 'w-12'
        }`}
      >
        {!isExpanded ? (
          /* Collapsed state - circular button matching search style */
          <button
            onClick={() => setIsExpanded(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all border-violet-400/50 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 hover:from-violet-500/20 hover:to-fuchsia-500/20 dark:border-violet-500/30 dark:from-violet-500/20 dark:to-fuchsia-500/20 dark:hover:from-violet-500/30 dark:hover:to-fuchsia-500/30"
            aria-label="Create with AI"
            title="Create scenario with AI"
          >
            <SparklesIcon className="h-6 w-6 text-violet-500 dark:text-violet-400" />
          </button>
        ) : (
          /* Expanded state - input field */
          <div className="relative h-12 w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4">
              <SparklesIcon className="h-5 w-5 text-violet-500 dark:text-violet-400" />
            </div>
            <input
              ref={inputRef as any}
              type="text"
              placeholder="Describe your scenario..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              className="block h-12 w-full rounded-full border pl-12 pr-12 text-base shadow-lg transition-all focus:outline-none border-violet-400/50 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 text-zinc-950 placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 dark:border-violet-500/30 dark:from-violet-500/10 dark:to-fuchsia-500/10 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
            <button
              onClick={isProcessing ? handleCancel : handleSubmit}
              disabled={!prompt.trim() && !isProcessing}
              className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                isProcessing
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : prompt.trim()
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:shadow-lg hover:shadow-violet-500/25'
                    : 'bg-zinc-200 text-zinc-400 dark:bg-zinc-700'
              }`}
            >
              {isProcessing ? (
                <StopIcon className="h-4 w-4" />
              ) : (
                <ArrowRightIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Example prompts dropdown */}
      {isExpanded && !isProcessing && !streamedResponse && !error && (
        <div className="absolute left-0 top-14 z-50 w-[600px] overflow-hidden rounded-2xl border border-zinc-200/50 bg-white p-3 shadow-2xl dark:border-zinc-700/50 dark:bg-zinc-900">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Try an example
          </p>
          <div className="flex flex-wrap gap-2">
            {examplePrompts.map((example) => (
              <button
                key={example}
                onClick={() => setPrompt(example)}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-violet-500 dark:hover:bg-violet-900/20 dark:hover:text-violet-400"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Response/Status popup */}
      {isExpanded && (isProcessing || streamedResponse || error) && (
        <div className="absolute left-0 top-14 z-50 w-[600px] overflow-hidden rounded-2xl border border-zinc-200/50 bg-white shadow-2xl dark:border-zinc-700/50 dark:bg-zinc-900">
          {error ? (
            <div className="flex items-center gap-2 p-4 text-sm text-red-600 dark:text-red-400">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          ) : (
            <div
              ref={responseContainerRef}
              className="max-h-48 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-300"
            >
              {streamedResponse || (
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-violet-500" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-fuchsia-500" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-pink-500" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-zinc-500">Generating scenario...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
