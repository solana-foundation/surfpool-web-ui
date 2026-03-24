'use client';

import { useAppConfig } from '@/hooks/use-app-config';
import { truncateAddress as truncateAddressUtil } from '@/lib/address-utils';
import { getTransactionStatus, TransactionInfo, useTransactionInspector } from '@/lib/solana-transaction-stream';
import {
  extractProgramData,
  findChangedPaths,
  getHexData,
  getHexDataForUpdates,
  getProgramName,
  hasJsonData,
  mergeTransactionProfiles,
  processTransactionProfile,
} from '@/lib/transaction-inspector-utils';
import { ArrowTopRightOnSquareIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { getTransactionExplorerUrl, logger } from '@surfpool/shared';
import { Badge, brandBlue, Dialog, DialogBody } from '@surfpool/ui';
import { parse, stringify } from 'lossless-json';
import React, { useEffect, useState } from 'react';
import AddressDisplay from './address-display';
import { AccountDetails, AccountLabels, UpdateAccountDetails } from './transaction-inspector-components';

// Client-side only component - will be hydrated on the client

// Wrap external library imports in try-catch for Fast Refresh compatibility
let jsonDiff: any;
let prettyJsonCustomElement: any;

// Only load browser-specific libraries on the client side
if (typeof window !== 'undefined') {
  try {
    jsonDiff = require('json-diff');
    require('pretty-json-custom-element');
  } catch (error) {
    console.warn('Failed to load json-diff or pretty-json-custom-element:', error);
    jsonDiff = { diffString: () => '' };
  }
} else {
  // Server-side fallback
  jsonDiff = { diffString: () => '' };
}

interface TransactionInspectorProps {
  rpcUrl?: string;
  wsUrl?: string;
  maxTransactions?: number;
  autoStart?: boolean;
  filterByProgram?: string;
  filterByAccount?: string;
  compact?: boolean;
  fetchHistorical?: boolean;
  initialTransactionSignature?: string;
}

export default function TransactionInspector({
  rpcUrl: propRpcUrl,
  wsUrl: propWsUrl,
  maxTransactions = 50,
  autoStart = true,
  filterByProgram,
  filterByAccount,
  compact = false,
  fetchHistorical = true,
  initialTransactionSignature,
}: TransactionInspectorProps) {
  const [isClient, setIsClient] = useState(false);

  // Ensure component only renders on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fast Refresh safeguard - ensure component re-mounts cleanly
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // This helps Fast Refresh work better with complex state
      return () => {
        // Cleanup on unmount for Fast Refresh
      };
    }
  }, []);
  const { rpcUrl: configRpcUrl, wsUrl: configWsUrl } = useAppConfig();
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [transactionProfile, setTransactionProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Map<string, boolean>>(new Map());
  const [accountViewModes, setAccountViewModes] = useState<Map<string, 'parsed' | 'hex'>>(new Map());
  const [expandedInstructions, setExpandedInstructions] = useState<Set<number>>(new Set());
  const [defaultInstructionsExpanded, setDefaultInstructionsExpanded] = useState(false);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [droppedIdl, setDroppedIdl] = useState<{ [address: string]: any }>({});
  const [isDragOver, setIsDragOver] = useState<{ [address: string]: boolean }>({});

  // Move the large JSON object inside the component and memoize it

  // Use props if provided, otherwise use config values
  const rpcUrl = propRpcUrl || configRpcUrl;
  const wsUrl = propWsUrl || configWsUrl;
  const { transactions, isStreaming, error, stats, toggleStreaming, clearTransactions, fetchLocalSignatures } =
    useTransactionInspector({
      rpcUrl,
      wsUrl,
      maxTransactions,
      autoStart,
      filterByProgram,
      filterByAccount,
      fetchHistorical,
    });

  // Handle initial transaction signature from URL parameter
  const [initialTxProcessed, setInitialTxProcessed] = useState(false);
  useEffect(() => {
    if (!initialTransactionSignature || !rpcUrl || initialTxProcessed) return;

    const fetchInitialTransaction = async () => {
      try {
        logger.log('🔗 Fetching initial transaction from URL:', initialTransactionSignature);
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [initialTransactionSignature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            const tx = {
              transaction: data.result.transaction,
              meta: data.result.meta,
              slot: data.result.slot,
              blockTime: data.result.blockTime,
            };
            setSelectedTransaction(tx);
            setTransactionDialogOpen(true);
            setInitialTxProcessed(true);
            // Fetch transaction profile for before/after state data
            fetchTransactionProfile(initialTransactionSignature);
          }
        }
      } catch (err) {
        console.error('Failed to fetch initial transaction:', err);
      }
    };

    fetchInitialTransaction();
  }, [initialTransactionSignature, rpcUrl, initialTxProcessed]);

  const toggleAccountExpansion = (instructionIndex: number, address: string) => {
    const key = `${instructionIndex}:${address}`;
    setExpandedAccounts((prev) => {
      const newMap = new Map(prev);
      const currentState = newMap.get(key);
      newMap.set(key, !currentState);
      return newMap;
    });
  };

  const isAccountExpanded = (instructionIndex: number, address: string, hasChanges: boolean) => {
    const key = `${instructionIndex}:${address}`;
    // Default: all accounts collapsed
    const defaultExpanded = false;
    // If the address has been explicitly set, use that value, otherwise use the default
    return expandedAccounts.has(key) ? expandedAccounts.get(key)! : defaultExpanded;
  };

  const getAccountViewMode = (address: string, context?: string) => {
    const key = context ? `${address}-${context}` : address;
    return accountViewModes.get(key) || 'parsed';
  };

  const toggleAccountViewMode = (address: string, context?: string) => {
    const key = context ? `${address}-${context}` : address;
    setAccountViewModes((prev) => {
      const newMap = new Map(prev);
      const currentMode = newMap.get(key) || 'parsed';
      newMap.set(key, currentMode === 'parsed' ? 'hex' : 'parsed');
      return newMap;
    });
  };

  const toggleInstructionExpansion = (index: number) => {
    setExpandedInstructions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  };

  const handleDragOver = (e: React.DragEvent, address: string) => {
    e.preventDefault();
    setIsDragOver((prev) => ({ ...prev, [address]: true }));
  };

  const handleDragLeave = (e: React.DragEvent, address: string) => {
    e.preventDefault();
    setIsDragOver((prev) => ({ ...prev, [address]: false }));
  };

  const handleDrop = (e: React.DragEvent, address: string) => {
    e.preventDefault();
    setIsDragOver((prev) => ({ ...prev, [address]: false }));

    const files = Array.from(e.dataTransfer.files);
    const jsonFile = files.find((file) => file.name.endsWith('.json'));

    if (jsonFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const idl = JSON.parse(event.target?.result as string);
          setDroppedIdl((prev) => ({ ...prev, [address]: idl }));
        } catch (error) {
          console.error('Error parsing IDL file:', error);
        }
      };
      reader.readAsText(jsonFile);
    }
  };

  const registerIdl = (address: string) => {
    // Here you would typically send the IDL to your backend or store it
    logger.log('Registering IDL for address:', address, droppedIdl[address]);
    // For now, we'll just log it
    alert(`IDL registered for ${address}`);
  };

  const truncateAddress = truncateAddressUtil;

  // Helper function to highlight character differences
  const highlightDifferences = (beforeValue: any, afterValue: any, isRed: boolean) => {
    // Convert values to strings for comparison
    const beforeStr = String(beforeValue);
    const afterStr = String(afterValue);

    // If values are identical, return the appropriate value without highlighting
    if (beforeStr === afterStr) {
      return <span>{isRed ? beforeStr : afterStr}</span>;
    }

    logger.log(`🔍 highlightDifferences: "${beforeStr}" vs "${afterStr}", isRed: ${isRed}`);

    // Find the first difference and highlight from there to the end
    const maxLength = Math.max(beforeStr.length, afterStr.length);
    let firstDiffIndex = -1;

    // Find the first character that's different
    for (let i = 0; i < maxLength; i++) {
      const beforeChar = beforeStr[i] || '';
      const afterChar = afterStr[i] || '';
      if (beforeChar !== afterChar) {
        firstDiffIndex = i;
        break;
      }
    }

    if (firstDiffIndex === -1) {
      // No differences found
      return <span>{isRed ? beforeStr : afterStr}</span>;
    }

    // Split the string into normal and highlighted parts
    const valueToShow = isRed ? beforeStr : afterStr;
    const normalPart = valueToShow.substring(0, firstDiffIndex);
    const highlightedPart = valueToShow.substring(firstDiffIndex);

    const colorClass = isRed ? 'text-red-500 font-bold bg-red-900/30' : 'text-green-500 font-bold bg-green-900/30';

    logger.log(`✅ Result: normal="${normalPart}", highlighted="${highlightedPart}"`);

    return (
      <>
        {normalPart && <span>{normalPart}</span>}
        {highlightedPart && <span className={colorClass}>{highlightedPart}</span>}
      </>
    );
  };

  // Helper function to render JSON diff with proper color coding
  const renderJsonDiff = (beforeJson: any, afterJson: any, isRed: boolean) => {
    try {
      // Ensure we're working with actual objects, not strings
      const beforeObj = typeof beforeJson === 'string' ? JSON.parse(beforeJson) : beforeJson;
      const afterObj = typeof afterJson === 'string' ? JSON.parse(afterJson) : afterJson;

      // Get the JSON to display (before or after)
      const jsonToShow = isRed ? beforeObj : afterObj;
      const jsonString = JSON.stringify(jsonToShow, null, 2);

      // Find all changed paths
      const changedPaths = findChangedPaths(beforeObj, afterObj);

      // Helper function to get the path for a specific line in the JSON
      const getPathForLine = (jsonLines: string[], targetIndex: number): string[] => {
        const path: string[] = [];
        const stack: { indent: number; key: string }[] = [];

        for (let i = 0; i <= targetIndex; i++) {
          const line = jsonLines[i];
          const indent = (line.match(/^\s*/)?.[0].length || 0) / 2;
          const trimmed = line.trim();

          // Remove items from stack that are deeper than current indent
          while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
          }

          // If this line starts an object, add it to the stack
          if (trimmed.endsWith('{')) {
            const match = trimmed.match(/^"?([^":]+)"?\s*:\s*{$/);
            if (match) {
              stack.push({ indent, key: match[1] });
            }
          }

          // If this is the target line and it has a key, extract it
          if (i === targetIndex) {
            const fieldMatch = trimmed.match(/^"?([^":]+)"?\s*:/);
            if (fieldMatch) {
              return [...stack.map((item) => item.key), fieldMatch[1]];
            }
          }
        }

        return stack.map((item) => item.key);
      };

      // Split into lines and process each line
      const jsonLines = jsonString.split('\n');
      const processedLines = jsonLines.map((line, index) => {
        const trimmedLine = line.trim();

        // Get the path for this line
        const linePath = getPathForLine(jsonLines, index);
        const linePathStr = linePath.join('.');
        // Check if this line contains a changed field.
        // Match exact paths OR, for array element lines (which don't include ':'), consider
        // descendant paths like parsed.info.addresses.0 matching parent line parsed.info.addresses.
        const hasChangedValue = Array.from(changedPaths).some((path) => {
          if (path === linePathStr) return true;
          // If this printed line looks like an array element (no colon) and the changed path is a descendant
          // of the parent path, treat this element line as changed so added addresses appear green.
          if (!trimmedLine.includes(':') && path.startsWith(linePathStr + '.')) return true;
          return false;
        });

        if (hasChangedValue) {
          const colorClass = isRed
            ? 'text-red-500 bg-red-900/30 font-bold'
            : 'text-green-500 bg-green-900/30 font-bold';
          return (
            <div key={index} className={colorClass}>
              {line}
            </div>
          );
        } else {
          // Unchanged line
          return (
            <div key={index} className="text-gray-300">
              {line}
            </div>
          );
        }
      });

      return <div className="font-mono text-xs">{processedLines}</div>;
    } catch (error) {
      console.error('Error rendering JSON diff:', error);
      // Fallback to simple string comparison
      const jsonToShow = isRed ? beforeJson : afterJson;
      return <pre className="text-gray-300">{JSON.stringify(jsonToShow, null, 2)}</pre>;
    }
  };

  const renderUnifiedJsonDiff = (beforeJson: any, afterJson: any) => {
    try {
      // Ensure we're working with actual objects, not strings
      const beforeObj = typeof beforeJson === 'string' ? JSON.parse(beforeJson) : beforeJson;
      const afterObj = typeof afterJson === 'string' ? JSON.parse(afterJson) : afterJson;

      // Find all changed paths
      const changedPaths = findChangedPaths(beforeObj, afterObj);

      // Helper function to get the path for a specific line in the JSON
      // This version recognizes arrays and assigns numeric indices to array elements
      const getPathForLine = (jsonLines: string[], targetIndex: number): string[] => {
        const stack: { indent: number; key: string; type: 'object' | 'array' }[] = [];

        for (let i = 0; i <= targetIndex; i++) {
          const line = jsonLines[i];
          const indent = Math.floor((line.match(/^\s*/)?.[0].length || 0) / 2);
          const trimmedLine = line.trim();

          // Pop stack frames that are deeper or equal to the current indent
          while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
          }

          // If this line opens an object property: "key": {
          const objMatch = trimmedLine.match(/^"?([^":]+)"?\s*:\s*\{\s*$/);
          if (objMatch) {
            stack.push({ indent, key: objMatch[1], type: 'object' });
            continue;
          }

          // If this line opens an array property: "key": [
          const arrMatch = trimmedLine.match(/^"?([^":]+)"?\s*:\s*\[\s*$/);
          if (arrMatch) {
            stack.push({ indent, key: arrMatch[1], type: 'array' });
            continue;
          }

          // If we're inside an array, compute the current element index for this line
          if (stack.length > 0 && stack[stack.length - 1].type === 'array') {
            // Find the nearest array frame from the top of the stack
            let arrFrameIndex = -1;
            for (let s = stack.length - 1; s >= 0; s--) {
              if (stack[s].type === 'array') {
                arrFrameIndex = s;
                break;
              }
            }

            if (arrFrameIndex >= 0) {
              const arrKey = stack[arrFrameIndex].key;

              // Find the line index where the array started (the '"arrKey": [' line)
              let startLine = -1;
              for (let j = i; j >= 0; j--) {
                const pl = jsonLines[j].trim();
                if (pl.match(new RegExp(`^\"?${arrKey}\"?\\s*:\\s*\\[`))) {
                  startLine = j;
                  break;
                }
              }

              // Count elements between startLine and current line to derive element index
              let elementIndex = 0;
              if (startLine >= 0) {
                // We count element starts by scanning forward from the array start
                // and incrementing when we encounter a non-key / non-closing line that likely starts an element.
                let depth = 0;
                for (let j = startLine + 1; j <= i; j++) {
                  const pl = jsonLines[j].trim();
                  if (pl === '' || pl === ',') continue;
                  if (pl === ']' || pl === '],') break;

                  // Track object nesting inside an element so we don't count internal object lines as new elements
                  if (pl.endsWith('{')) {
                    if (depth === 0) {
                      // beginning of a new element object
                      elementIndex++;
                    }
                    depth++;
                    continue;
                  }
                  if (pl.startsWith('}')) {
                    if (depth > 0) depth--;
                    continue;
                  }

                  // Primitive elements or string elements usually appear as a line like: "value", or "value"
                  if (depth === 0 && !pl.includes(':') && !pl.startsWith(']')) {
                    // treat this as an element (or continuation of an element)
                    if (!/^[\]\},]$/.test(pl)) {
                      elementIndex = Math.max(1, elementIndex); // ensure at least 1 if a primitive element exists
                    }
                  }
                }
                // elementIndex is 1-based from above counting; convert to 0-based index:
                elementIndex = Math.max(0, elementIndex - 1);
              }

              // If this is the target line, try to return a full path including the element index and optional field
              if (i === targetIndex) {
                const fieldMatch = trimmedLine.match(/^"?([^":]+)"?\s*:/);
                if (fieldMatch) {
                  return [...stack.slice(0, arrFrameIndex + 1).map((s) => s.key), String(elementIndex), fieldMatch[1]];
                }
                // If it's a primitive array element line or the array element start, return the element path
                return [...stack.slice(0, arrFrameIndex + 1).map((s) => s.key), String(elementIndex)];
              }

              // If an element object begins here, push a synthetic object frame with the element index
              if (trimmedLine.startsWith('{')) {
                stack.push({ indent: indent + 1, key: String(elementIndex), type: 'object' });
              }
              continue;
            }
          }

          // For non-array object properties or the target primitive key line
          if (i === targetIndex) {
            const fieldMatch = trimmedLine.match(/^"?([^":]+)"?\s*:/);
            if (fieldMatch) {
              return [...stack.map((item) => item.key), fieldMatch[1]];
            }
          }
        }

        // Default: return the current stack keys (path to current container)
        return stack.map((item) => item.key);
      };

      // Use the after data as the base for display
      const jsonToShow = afterObj;
      const jsonString = JSON.stringify(jsonToShow, null, 2);

      // Split into lines and process each line
      const jsonLines = jsonString.split('\n');
      const processedLines: React.ReactNode[] = [];

      for (let index = 0; index < jsonLines.length; index++) {
        const line = jsonLines[index];
        const trimmedLine = line.trim();

        // Get the path for this line
        const linePath = getPathForLine(jsonLines, index);

        // Check if this line contains a changed field
        const hasChangedValue = Array.from(changedPaths).some((path) => {
          const pathParts = path.split('.');
          return pathParts.join('.') === linePath.join('.');
        });

        if (hasChangedValue) {
          // Find the corresponding line in the before data
          const beforeJsonString = JSON.stringify(beforeObj, null, 2);
          const beforeJsonLines = beforeJsonString.split('\n');

          // Try to find the matching line in before data
          let beforeLine = '';
          for (let beforeIndex = 0; beforeIndex < beforeJsonLines.length; beforeIndex++) {
            const beforeLinePath = getPathForLine(beforeJsonLines, beforeIndex);
            if (beforeLinePath.join('.') === linePath.join('.')) {
              beforeLine = beforeJsonLines[beforeIndex];
              break;
            }
          }

          // Show both old and new values
          if (beforeLine && beforeLine !== line) {
            // Show old value in red
            processedLines.push(
              <div key={`${index}-before`} className="bg-red-900/30 font-bold text-red-500">
                {beforeLine}
              </div>
            );
            // Show new value in green
            processedLines.push(
              <div key={`${index}-after`} className="bg-green-900/30 font-bold text-green-500">
                {line}
              </div>
            );
          } else {
            // Fallback: just show the new value in green
            processedLines.push(
              <div key={index} className="bg-green-900/30 font-bold text-green-500">
                {line}
              </div>
            );
          }
        } else {
          // Unchanged line
          processedLines.push(
            <div key={index} className="text-gray-300">
              {line}
            </div>
          );
        }
      }

      return <div className="font-mono text-xs">{processedLines}</div>;
    } catch (error) {
      console.error('Error rendering unified JSON diff:', error);
      // Fallback to simple string comparison
      return <pre className="text-gray-300">{JSON.stringify(afterJson, null, 2)}</pre>;
    }
  };

  const fetchTransactionProfile = async (signature: string) => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      setTransactionProfile(null);

      logger.log('🔍 Fetching transaction profile for signature:', signature);

      // Fetch transaction profile with both jsonParsed and base64 encodings in parallel
      const [jsonParsedResponse, base64Response] = await Promise.all([
        fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'surfnet_getTransactionProfile',
            params: [signature, { encoding: 'jsonParsed' }],
          }),
        }),
        fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'surfnet_getTransactionProfile',
            params: [signature, { encoding: 'base64' }],
          }),
        }),
      ]);

      if (!jsonParsedResponse.ok || !base64Response.ok) {
        throw new Error(`HTTP error! status: jsonParsed=${jsonParsedResponse.status}, base58=${base64Response.status}`);
      }

      const [jsonParsedData, base64Data] = await Promise.all([jsonParsedResponse.json(), base64Response.json()]);

      logger.log('📊 JSON Parsed response:', jsonParsedData);
      logger.log('📊 Base64 response:', base64Data);

      if (jsonParsedData.result?.value && base64Data.result?.value) {
        // Merge the results to include both jsonParsedBytes and rawBytes
        const mergedProfile = mergeTransactionProfiles(jsonParsedData.result.value, base64Data.result.value);
        let transactionProfile = processTransactionProfile(mergedProfile);
        setTransactionProfile(transactionProfile);

        // Expand all instructions by default
        if (transactionProfile.instructionProfiles && transactionProfile.instructionProfiles.length > 0) {
          const allInstructionIndices = new Set<number>(
            transactionProfile.instructionProfiles.map((_: any, index: number) => index)
          );
          setExpandedInstructions(allInstructionIndices);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching transaction profile:', error);
      setProfileError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleTransactionClick = async (tx: any) => {
    try {
      logger.log('🖱️ Transaction clicked:', tx);
      setSelectedTransaction(tx);
      setTransactionDialogOpen(true);

      // Fetch transaction profile if we have a signature
      if (tx.transaction?.signatures?.[0]) {
        fetchTransactionProfile(tx.transaction.signatures[0]);

        // Also fetch the actual transaction details to get the real fee
        try {
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [tx.transaction.signatures[0], { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.result?.value) {
              // Update the selected transaction with the real fee
              setSelectedTransaction((prev: any) => ({
                ...prev,
                meta: {
                  ...prev.meta,
                  fee: data.result.value.meta?.fee || prev.meta?.fee,
                },
              }));
            }
          }
        } catch (feeError) {
          console.warn('⚠️ Could not fetch real fee:', feeError);
        }
      }
    } catch (error) {
      console.error('❌ Error handling transaction click:', error);
    }
  };

  // Show loading state during SSR (after all hooks are called)
  if (!isClient) {
    return (
      <div className="mx-auto flex w-full flex-col gap-4 space-y-6">
        <div className="mb-0 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-white">Transaction Inspector</h2>
        </div>
        <div className="flex h-[280px] items-center justify-center">
          <div className="h-3 w-3 animate-pulse rounded-full bg-pink-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full flex-col gap-4 space-y-6">
      <div className="mb-0">
        <h2 className="text-sm font-medium uppercase tracking-wide text-white">Transaction Inspector</h2>
      </div>

      <div className="rounded-lg">
        {/* Transactions List */}
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center rounded-lg p-8">
              <div className="text-center">
                <div className="mb-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center">
                    <div className="relative h-12 w-12">
                      {error || stats.connectionStatus === 'error' || stats.connectionStatus === 'disconnected' ? (
                        <>
                          {/* Red pulsing rings for error/offline state */}
                          <div className="absolute inset-0 animate-ping rounded-full bg-red-500/30"></div>
                          <div className="absolute inset-2 animate-pulse rounded-full bg-red-500/50"></div>
                          <div className="absolute inset-3 rounded-full bg-red-500"></div>
                        </>
                      ) : (
                        <>
                          {/* Pink pulsing rings for normal waiting state */}
                          <div className="absolute inset-0 animate-ping rounded-full bg-pink-500/30"></div>
                          <div className="absolute inset-2 animate-pulse rounded-full bg-pink-500/50"></div>
                          <div className="absolute inset-3 rounded-full bg-pink-500"></div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {error || stats.connectionStatus === 'error' || stats.connectionStatus === 'disconnected' ? (
                  <>
                    <div className="mb-2 text-lg font-medium text-red-300">Surfnet is Offline</div>
                    <div className="max-w-md text-sm text-red-300/70">
                      Make sure Surfpool is running in your terminal
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2 text-lg font-medium text-zinc-300">Waiting for Transactions</div>
                    <div className="max-w-md text-sm text-zinc-500">
                      Send transactions on your Surfnet to get detailed simulations,
                      <br />
                      performance profiling, and data indexing
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            transactions.map((tx: TransactionInfo, index: number) => {
              const status = getTransactionStatus(tx);

              const badgeColors = {
                success: 'green',
                failed: 'red',
                pending: 'zinc',
              };

              const signature = tx.transaction.signatures[0];
              const shortSig = `${signature.slice(0, 4)}...${signature.slice(-4)}`;
              const timeStr = tx.blockTime
                ? new Date(tx.blockTime * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : null;

              return (
                <div
                  key={`${signature}-${index}`}
                  className="group cursor-pointer rounded-xl bg-zinc-800 px-5 py-4 transition-colors hover:bg-zinc-700"
                  onClick={() => handleTransactionClick(tx)}
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: Status dot + Signature + Actions */}
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`h-3 w-3 flex-shrink-0 rounded-full ${
                          status === 'success' ? 'bg-[#60d695]' : status === 'failed' ? 'bg-[#ff6b6b]' : 'bg-zinc-500'
                        }`}
                      />
                      <div className="flex flex-col">
                        <span className="truncate font-mono text-base font-bold text-white">{shortSig}</span>
                        {/* Hidden full signature for browser search (Cmd+F) */}
                        <span className="block max-w-[200px] truncate text-[2px] leading-[2px] text-transparent selection:bg-[#60d695] selection:text-white">
                          {signature}
                        </span>
                      </div>
                      <div className="-mt-0.5 flex items-center overflow-hidden rounded-md bg-zinc-700/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(signature, `sig-${signature}`);
                          }}
                          className="flex h-7 w-7 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-600 hover:text-zinc-200"
                          title="Copy signature"
                        >
                          {copiedStates[`sig-${signature}`] ? (
                            <svg
                              className="h-3.5 w-3.5 text-green-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <ClipboardIcon className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <div className="h-7 w-px bg-zinc-600"></div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const explorerUrl = getTransactionExplorerUrl(signature, configRpcUrl);
                            window.open(explorerUrl, '_blank');
                          }}
                          className="flex h-7 w-7 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-600 hover:text-zinc-200"
                          title="Open in explorer"
                        >
                          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Right: Slot + Time stacked */}
                    <div className="flex flex-shrink-0 flex-col items-end">
                      <span className="font-mono text-base font-bold text-zinc-300">#{tx.slot.toLocaleString()}</span>
                      {timeStr && <span className="text-sm text-zinc-500">{timeStr}</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Transaction Details Dialog */}
      <Dialog open={transactionDialogOpen} onClose={() => setTransactionDialogOpen(false)} size="5xl">
        <DialogBody>
          {selectedTransaction ? (
            <div className="space-y-6">
              {/* Basic Transaction Info */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <div className="mb-2 text-xs text-gray-500">Status</div>
                  <Badge
                    color={
                      getTransactionStatus(selectedTransaction) === 'success'
                        ? 'green'
                        : getTransactionStatus(selectedTransaction) === 'failed'
                          ? 'red'
                          : 'zinc'
                    }
                    className="text-sm"
                  >
                    {getTransactionStatus(selectedTransaction).toUpperCase()}
                  </Badge>
                </div>

                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <div className="mb-2 text-xs text-gray-500">Open in Explorer</div>
                  <button
                    onClick={() => {
                      const signature = selectedTransaction.transaction?.signatures?.[0];
                      if (signature) {
                        const explorerUrl = getTransactionExplorerUrl(signature, configRpcUrl);
                        window.open(explorerUrl, '_blank');
                      }
                    }}
                    className="flex items-center gap-2 text-sm text-blue-400 transition-colors hover:text-blue-300"
                    disabled={!selectedTransaction.transaction?.signatures?.[0]}
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    <span>View</span>
                  </button>
                </div>

                {/* Accounts Loaded */}
                {transactionProfile && (
                  <div className="col-span-2 flex items-center justify-between rounded-lg bg-zinc-800/50 p-2 sm:p-3">
                    <div className="flex items-baseline gap-1.5 sm:gap-3">
                      <span className="font-mono text-xl font-bold text-zinc-100 sm:text-3xl">
                        {(() => {
                          // Deduplicate accounts across readonlyAccountStates and transactionProfile.accountStates
                          const allAccounts = new Set([
                            ...Object.keys(transactionProfile.readonlyAccountStates || {}),
                            ...Object.keys(transactionProfile.transactionProfile?.accountStates || {}),
                          ]);
                          return allAccounts.size;
                        })()}
                      </span>
                      <span className="text-[10px] text-gray-500 sm:text-xs">
                        <span className="sm:hidden">Accts</span>
                        <span className="hidden sm:inline">Accounts Loaded</span>
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const signature = selectedTransaction.transaction?.signatures?.[0];
                          if (!signature) {
                            console.error('No transaction signature found');
                            return;
                          }

                          // Call surfnet_exportSnapshot RPC method
                          const response = await fetch(configRpcUrl, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              jsonrpc: '2.0',
                              id: 1,
                              method: 'surfnet_exportSnapshot',
                              params: [
                                {
                                  scope: {
                                    preTransaction: signature,
                                  },
                                },
                              ],
                            }),
                          });

                          if (response.ok) {
                            // Use lossless-json to preserve large integer precision
                            const rawText = await response.text();
                            const data = parse(rawText) as { result?: { value?: unknown } };
                            logger.log('📸 Export fixtures response received');

                            if (data.result) {
                              // Download the snapshot as JSON, preserving number precision
                              const jsonString = stringify(data.result.value, null, 2);
                              const blob = new Blob([jsonString || ''], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `fixtures-${signature}.json`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              logger.log('✅ Fixtures exported successfully');
                            }
                          } else {
                            console.error('❌ Error exporting fixtures:', response.statusText);
                          }
                        } catch (error) {
                          console.error('❌ Error exporting fixtures:', error);
                        }
                      }}
                      className="group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-black transition-all duration-200 hover:brightness-110 sm:px-3 sm:py-2"
                      style={{ backgroundColor: brandBlue }}
                      title="Download Fixtures - Pre-execution Snapshot"
                    >
                      <svg
                        className="h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 sm:h-5 sm:w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                        />
                      </svg>
                      <span className="text-xs font-medium uppercase leading-tight tracking-wide">Fixtures</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Transaction Profile Loading State */}
              {profileLoading && (
                <div className="space-y-4">
                  <div className="mb-3 text-sm font-semibold text-zinc-200">CU Profiling</div>
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-500"></div>
                      <span className="text-sm text-zinc-400">Loading transaction profile...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Transaction Profile Error State */}
              {profileError && (
                <div className="space-y-4">
                  <div className="mb-3 text-sm font-semibold text-zinc-200">CU Profiling</div>
                  <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm font-medium text-red-400">Profile Loading Failed</span>
                    </div>
                    <p className="text-sm text-red-300">{profileError}</p>
                    <button
                      onClick={() => {
                        if (selectedTransaction?.transaction?.signatures?.[0]) {
                          fetchTransactionProfile(selectedTransaction.transaction.signatures[0]);
                        }
                      }}
                      className="mt-3 text-sm text-red-400 underline hover:text-red-300"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Transaction Profile - New Detailed View */}
              {transactionProfile && (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-200">CU Profiling</span>
                    {transactionProfile.instructionProfiles && transactionProfile.instructionProfiles.length > 0 && (
                      <span className="text-sm text-zinc-400">
                        (
                        {transactionProfile.instructionProfiles
                          .reduce((sum: number, profile: any) => sum + (profile.computeUnitsConsumed || 0), 0)
                          .toLocaleString()}{' '}
                        CU)
                      </span>
                    )}
                  </div>

                  {/* Compute Units Stack Bar */}
                  {transactionProfile.instructionProfiles && transactionProfile.instructionProfiles.length > 0 && (
                    <div className="mb-8">
                      <div className="mb-3 text-xs text-gray-500">Estimated CU Breakdown per Instruction</div>
                      <div className="flex h-6 overflow-hidden rounded-md border border-zinc-600">
                        {transactionProfile.instructionProfiles.map((profile: any, index: number) => {
                          const cu = profile.computeUnitsConsumed || 0;
                          const totalCu =
                            transactionProfile.instructionProfiles.reduce(
                              (sum: number, profile: any) => sum + (profile.computeUnitsConsumed || 0),
                              0
                            ) || 1;
                          const percentage = (cu / totalCu) * 100;

                          // macOS-style colors for different instruction types
                          const colors = [
                            'bg-blue-500', // Blue
                            'bg-green-500', // Green
                            'bg-orange-500', // Orange
                            'bg-purple-500', // Purple
                            'bg-red-500', // Red
                            'bg-yellow-500', // Yellow
                            'bg-pink-500', // Pink
                            'bg-indigo-500', // Indigo
                          ];
                          const colorClass = colors[index % colors.length];

                          return (
                            <div
                              key={index}
                              className={`${colorClass} group relative cursor-pointer transition-all duration-200 hover:brightness-110`}
                              style={{ width: `${percentage}%` }}
                              title={`Instruction ${index + 1}: ${cu} CU (${percentage.toFixed(1)}%)`}
                            >
                              {/* Tooltip on hover */}
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 transform whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                Instruction {index + 1}: {cu} CU
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="mt-3 flex flex-wrap gap-3">
                        {transactionProfile.instructionProfiles.map((profile: any, index: number) => {
                          const cu = profile.computeUnitsConsumed || 0;
                          const colors = [
                            'bg-blue-500',
                            'bg-green-500',
                            'bg-orange-500',
                            'bg-purple-500',
                            'bg-red-500',
                            'bg-yellow-500',
                            'bg-pink-500',
                            'bg-indigo-500',
                          ];
                          const colorClass = colors[index % colors.length];

                          return (
                            <div key={index} className="flex items-center gap-2 text-xs">
                              <div className={`h-3 w-3 rounded ${colorClass}`}></div>
                              <span className="text-gray-300">Instruction #{index + 1}:</span>
                              <span className="text-gray-400">{cu} CU</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Instruction Profiles */}
                  <div className="space-y-4">
                    {transactionProfile.instructionProfiles?.map((profile: any, index: number) => {
                      // Get the actual instruction from selectedTransaction using the index
                      const instruction = selectedTransaction?.transaction?.message?.instructions?.[index];
                      const programId = instruction?.programId || profile.programId;
                      const programName = getProgramName(programId);
                      // macOS-style colors for different instruction types
                      const colors = [
                        'bg-blue-500', // Blue
                        'bg-green-500', // Green
                        'bg-orange-500', // Orange
                        'bg-purple-500', // Purple
                        'bg-red-500', // Red
                        'bg-yellow-500', // Yellow
                        'bg-pink-500', // Pink
                        'bg-indigo-500', // Indigo
                      ];

                      return (
                        <div key={index} className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800/50">
                          {/* Instruction Header */}
                          <div
                            className="cursor-pointer border-b border-zinc-700 bg-zinc-900/50 p-3 transition-colors hover:bg-zinc-900/70"
                            onClick={() => toggleInstructionExpansion(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`mr-2 ${
                                      colors[index % colors.length] === 'bg-blue-500'
                                        ? 'text-blue-500'
                                        : colors[index % colors.length] === 'bg-green-500'
                                          ? 'text-green-500'
                                          : colors[index % colors.length] === 'bg-orange-500'
                                            ? 'text-orange-500'
                                            : colors[index % colors.length] === 'bg-purple-500'
                                              ? 'text-purple-500'
                                              : colors[index % colors.length] === 'bg-red-500'
                                                ? 'text-red-500'
                                                : colors[index % colors.length] === 'bg-yellow-500'
                                                  ? 'text-yellow-500'
                                                  : colors[index % colors.length] === 'bg-pink-500'
                                                    ? 'text-pink-500'
                                                    : colors[index % colors.length] === 'bg-indigo-500'
                                                      ? 'text-indigo-500'
                                                      : 'text-gray-500'
                                    }`}
                                  >
                                    {expandedInstructions.has(index) ? '▼' : '▶'}
                                  </span>
                                  <div className="text-sm font-semibold text-zinc-200">
                                    Instruction #{index + 1}: {programName}
                                  </div>
                                </div>

                                {profile.errorMessage && (
                                  <Badge color="red" className="text-xs">
                                    ERROR
                                  </Badge>
                                )}
                              </div>
                              <div className="font-mono text-xs font-semibold text-white">
                                {profile.computeUnitsConsumed || 0} CU
                              </div>
                            </div>
                          </div>

                          {/* Instruction Content */}
                          {expandedInstructions.has(index) && (
                            <div className="space-y-4 p-4">
                              {/* Account States */}
                              {profile.accountStates && (
                                <div>
                                  <div className="mb-2 text-xs font-semibold text-gray-500">
                                    ACCOUNTS STATE TRANSITIONS
                                  </div>
                                  <div className="overflow-hidden rounded border border-zinc-600 bg-zinc-900/30">
                                    {Object.entries(profile.accountStates)
                                      .sort(([addressA], [addressB]) => {
                                        // Order such that the executed program is always the first account
                                        if (addressA === programId) return -1;
                                        if (addressB === programId) return 1;
                                        return 0;
                                      })
                                      .map(([address, accountState]: [string, any], accountIndex: number) => {
                                        const isWritable = accountState.type === 'writable';
                                        const hasChanges =
                                          accountState.accountChange && accountState.accountChange.type !== 'unchanged';

                                        // Debug logging
                                        if (hasChanges) {
                                          logger.log(
                                            `🔎 Account ${address.slice(0, 8)}... hasChanges:`,
                                            hasChanges,
                                            'type:',
                                            accountState.accountChange?.type,
                                            'data:',
                                            accountState.accountChange?.data
                                          );
                                        }
                                        const isFirst = accountIndex === 0;
                                        const isLast =
                                          accountIndex === Object.entries(profile.accountStates).length - 1;

                                        const getHoverClasses = () => {
                                          if (hasChanges && accountState.accountChange.type === 'create') {
                                            return 'hover:bg-green-900/40';
                                          } else if (hasChanges && accountState.accountChange.type === 'update') {
                                            return 'hover:bg-yellow-900/40';
                                          } else if (hasChanges && accountState.accountChange.type === 'delete') {
                                            return 'hover:bg-red-900/40';
                                          } else if (!hasChanges && !isWritable) {
                                            return 'hover:bg-gray-700/40';
                                          } else {
                                            return 'hover:bg-zinc-800/40';
                                          }
                                        };

                                        const getSeparatorClasses = () => {
                                          return '';
                                        };

                                        return (
                                          <div key={address}>
                                            <div
                                              className={`bg-zinc-900/30 p-3 ${getHoverClasses()} transition-colors`}
                                            >
                                              <div
                                                className="flex cursor-pointer items-center justify-between px-2 py-1 font-mono text-xs text-gray-400"
                                                onClick={() => toggleAccountExpansion(index, address)}
                                              >
                                                <div className="flex items-center">
                                                  <AddressDisplay
                                                    address={address}
                                                    copiedStates={copiedStates}
                                                    copyToClipboard={copyToClipboard}
                                                    truncateAddress={truncateAddress}
                                                    copyId={`account-${address}`}
                                                    className="font-semibold text-gray-300"
                                                    showCopyButton={true}
                                                  />
                                                </div>

                                                <AccountLabels
                                                  accountState={accountState}
                                                  address={address}
                                                  hasChanges={hasChanges}
                                                  transactionProfile={transactionProfile}
                                                  selectedTransaction={selectedTransaction}
                                                />
                                              </div>
                                            </div>

                                            {isAccountExpanded(index, address, hasChanges) && (
                                              <div className="bg-zinc-950 pt-5">
                                                {hasChanges && accountState.accountChange.type === 'create' && (
                                                  <AccountDetails
                                                    address={address}
                                                    accountData={accountState.accountChange.data}
                                                    accountType="create"
                                                    copiedStates={copiedStates}
                                                    getAccountViewMode={getAccountViewMode}
                                                    copyToClipboard={copyToClipboard}
                                                    extractProgramData={extractProgramData}
                                                    getHexData={getHexData}
                                                    hasJsonData={hasJsonData}
                                                    truncateAddress={truncateAddress}
                                                    isDragOver={isDragOver}
                                                    droppedIdl={droppedIdl}
                                                    handleDragOver={handleDragOver}
                                                    handleDragLeave={handleDragLeave}
                                                    handleDrop={handleDrop}
                                                    registerIdl={registerIdl}
                                                    toggleAccountViewMode={toggleAccountViewMode}
                                                  />
                                                )}

                                                {hasChanges && accountState.accountChange.type === 'update' && (
                                                  <UpdateAccountDetails
                                                    address={address}
                                                    accountData={accountState.accountChange.data}
                                                    copiedStates={copiedStates}
                                                    getAccountViewMode={getAccountViewMode}
                                                    copyToClipboard={copyToClipboard}
                                                    extractProgramData={extractProgramData}
                                                    getHexData={getHexData}
                                                    getHexDataForUpdates={getHexDataForUpdates}
                                                    hasJsonData={hasJsonData}
                                                    truncateAddress={truncateAddress}
                                                    highlightDifferences={highlightDifferences}
                                                    renderJsonDiff={renderJsonDiff}
                                                    renderUnifiedJsonDiff={renderUnifiedJsonDiff}
                                                    isDragOver={isDragOver}
                                                    droppedIdl={droppedIdl}
                                                    handleDragOver={handleDragOver}
                                                    handleDragLeave={handleDragLeave}
                                                    handleDrop={handleDrop}
                                                    registerIdl={registerIdl}
                                                    toggleAccountViewMode={toggleAccountViewMode}
                                                  />
                                                )}

                                                {hasChanges && accountState.accountChange.type === 'delete' && (
                                                  <AccountDetails
                                                    address={address}
                                                    accountData={accountState.accountChange.data}
                                                    accountType="delete"
                                                    copiedStates={copiedStates}
                                                    getAccountViewMode={getAccountViewMode}
                                                    copyToClipboard={copyToClipboard}
                                                    extractProgramData={extractProgramData}
                                                    getHexData={getHexData}
                                                    hasJsonData={hasJsonData}
                                                    truncateAddress={truncateAddress}
                                                    isDragOver={isDragOver}
                                                    droppedIdl={droppedIdl}
                                                    handleDragOver={handleDragOver}
                                                    handleDragLeave={handleDragLeave}
                                                    handleDrop={handleDrop}
                                                    registerIdl={registerIdl}
                                                    toggleAccountViewMode={toggleAccountViewMode}
                                                  />
                                                )}

                                                {!hasChanges &&
                                                  transactionProfile.readonlyAccountStates &&
                                                  transactionProfile.readonlyAccountStates[address] && (
                                                    <AccountDetails
                                                      address={address}
                                                      accountData={transactionProfile.readonlyAccountStates[address]}
                                                      accountType="read"
                                                      copiedStates={copiedStates}
                                                      getAccountViewMode={getAccountViewMode}
                                                      copyToClipboard={copyToClipboard}
                                                      extractProgramData={extractProgramData}
                                                      getHexData={getHexData}
                                                      hasJsonData={hasJsonData}
                                                      truncateAddress={truncateAddress}
                                                      isDragOver={isDragOver}
                                                      droppedIdl={droppedIdl}
                                                      handleDragOver={handleDragOver}
                                                      handleDragLeave={handleDragLeave}
                                                      handleDrop={handleDrop}
                                                      registerIdl={registerIdl}
                                                      toggleAccountViewMode={toggleAccountViewMode}
                                                    />
                                                  )}
                                                {!hasChanges &&
                                                  (!transactionProfile.readonlyAccountStates ||
                                                    !transactionProfile.readonlyAccountStates[address]) && (
                                                    <div className="rounded border border-gray-500/30 bg-gray-700/20 p-2 text-xs text-gray-400">
                                                      No changes to this account
                                                    </div>
                                                  )}
                                              </div>
                                            )}
                                            {!isLast && <div className="mx-3 h-px bg-zinc-500/20"></div>}
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}

                              {/* Log Messages */}
                              {profile.logMessages && profile.logMessages.length > 0 && (
                                <div>
                                  <div className="mb-2 text-xs font-semibold text-gray-500">LOGS</div>
                                  <div className="max-h-32 overflow-y-auto rounded border border-gray-600 bg-black/80 p-3 font-mono text-xs">
                                    <div className="space-y-1">
                                      {profile.logMessages.map((log: string, logIndex: number) => (
                                        <div key={logIndex} className="text-emerald-400">
                                          <span className="text-gray-500">
                                            [{logIndex.toString().padStart(3, '0')}]
                                          </span>{' '}
                                          {log}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Error Message */}
                              {profile.errorMessage && (
                                <div>
                                  <div className="mb-2 text-xs font-semibold text-red-400">ERROR</div>
                                  <div className="rounded border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-300">
                                    {profile.errorMessage}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Legacy Instructions View (fallback) */}
              {!transactionProfile && selectedTransaction.transaction?.message?.instructions && (
                <>
                  <div className="mb-3 text-sm font-semibold text-zinc-200">INSTRUCTIONS</div>
                  <div className="rounded-lg bg-zinc-800/50 p-4">
                    <div className="mb-2 text-xs text-gray-500">
                      Instructions ({selectedTransaction.transaction.message.instructions.length})
                    </div>
                    <div className="max-h-48 space-y-3 overflow-y-auto">
                      {selectedTransaction.transaction.message.instructions.map((instruction: any, index: number) => (
                        <div key={index} className="border-l-2 border-zinc-600 pl-3">
                          <div className="mb-1 font-mono text-xs text-gray-300">
                            <span className="text-gray-500">#{index + 1}:</span>{' '}
                            {instruction.programId || 'Unknown Program'}
                          </div>
                          {instruction.accounts && instruction.accounts.length > 0 && (
                            <div className="ml-4 text-xs text-gray-400">
                              <div className="mb-1 text-gray-500">Accounts:</div>
                              <div className="space-y-1">
                                {instruction.accounts.map((acc: any, accIndex: number) => (
                                  <div key={accIndex} className="flex items-start gap-2">
                                    <span className="w-6 text-gray-500">{accIndex}:</span>
                                    <span className="break-all">
                                      {typeof acc === 'object' && acc !== null ? JSON.stringify(acc) : String(acc)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {instruction.data && (
                            <div className="ml-4 mt-1 text-xs text-gray-400">
                              <div className="mb-1 text-gray-500">Data:</div>
                              <div className="break-all rounded bg-zinc-900/50 p-2 font-mono">{instruction.data}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No transaction selected</div>
          )}
        </DialogBody>
      </Dialog>
    </div>
  );
}
