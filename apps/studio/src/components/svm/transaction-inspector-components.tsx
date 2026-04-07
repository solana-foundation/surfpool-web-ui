'use client';

import { computeHexDiff, getProgramType } from '@surfpool/svm';
import React, { useEffect, useMemo, useRef } from 'react';
import AddressDisplay from './address-display';
import TokenAmountDisplay from './token-amount-display';

// Shared sub-components

export interface LamportsDisplayProps {
  lamports: number;
  label?: string;
  className?: string;
}

export const LamportsDisplay: React.FC<LamportsDisplayProps> = ({ lamports, label, className = '' }) => {
  return (
    <TokenAmountDisplay
      amount={lamports}
      decimals={9}
      symbol="SOL"
      className={className}
      variant="badge"
      formatOptions={{
        minimumFractionDigits: 0,
        maximumFractionDigits: 9,
      }}
    />
  );
};

export interface OwnerDisplayProps {
  owner: string;
  copiedStates: Record<string, boolean>;
  copyToClipboard: (text: string, id: string) => void;
  truncateAddress: (address: string) => string;
  copyId: string;
  className?: string;
}

export const OwnerDisplay: React.FC<OwnerDisplayProps> = ({
  owner,
  copiedStates,
  copyToClipboard,
  truncateAddress,
  copyId,
  className = '',
}) => {
  return (
    <AddressDisplay
      address={owner}
      copiedStates={copiedStates}
      copyToClipboard={copyToClipboard}
      truncateAddress={truncateAddress}
      copyId={copyId}
      className={className}
      aggressiveTruncate={false}
    />
  );
};

export interface DataDisplayProps {
  data: any;
  address: string;
  context?: string;
  getAccountViewMode: (address: string, context?: string) => string;
  extractProgramData: (data: any) => any;
  getHexData: (data: any) => string;
  hasJsonData: (data: any) => boolean;
  isDragOver: Record<string, boolean>;
  droppedIdl: Record<string, any>;
  handleDragOver: (e: React.DragEvent, address: string) => void;
  handleDragLeave: (e: React.DragEvent, address: string) => void;
  handleDrop: (e: React.DragEvent, address: string) => void;
  registerIdl: (address: string) => void;
  toggleAccountViewMode: (address: string, context?: string) => void;
  className?: string;
}

export const DataDisplay: React.FC<DataDisplayProps> = ({
  data,
  address,
  context,
  getAccountViewMode,
  extractProgramData,
  getHexData,
  hasJsonData,
  isDragOver,
  droppedIdl,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  registerIdl,
  toggleAccountViewMode,
  className = '',
}) => {
  const prettyJsonRef = useRef<HTMLDivElement>(null);
  const lastJsonStringRef = useRef<string>('');

  const jsonString = useMemo(() => {
    try {
      const extractedData = extractProgramData(data);
      return typeof extractedData === 'string' ? extractedData : JSON.stringify(extractedData, null, 2);
    } catch {
      return JSON.stringify(extractProgramData(data), null, 2);
    }
  }, [data, extractProgramData]);

  useEffect(() => {
    if (prettyJsonRef.current && typeof window !== 'undefined' && getAccountViewMode(address, context) === 'parsed') {
      // Only update if the JSON string actually changed
      if (lastJsonStringRef.current !== jsonString) {
        lastJsonStringRef.current = jsonString;
        prettyJsonRef.current.innerHTML = `<pretty-json expand="2" class="font-mono text-xs" style="--key-color: #60a5fa; --arrow-color: #6b7280; --brace-color: #6b7280; --bracket-color: #6b7280; --string-color: #a855f7; --number-color: #f59e0b; --null-color: #6b7280; --boolean-color: #f59e0b; --comma-color: #6b7280; --ellipsis-color: #6b7280; --indent: 1rem; --font-family: monospace; --font-size: 0.75rem;">${jsonString}</pretty-json>`;
      }
    }
  }, [jsonString, address, context, getAccountViewMode]);

  return (
    <div
      className={`w-full overflow-x-auto whitespace-pre bg-zinc-950 p-2 pb-4 pl-5 pr-5 font-mono text-xs ${className}`}
    >
      {getAccountViewMode(address, context) === 'parsed' ? (
        <div ref={prettyJsonRef} />
      ) : (
        <div
          className="space-y-1 font-mono text-xs"
          dangerouslySetInnerHTML={{
            __html: getHexData(data),
          }}
        />
      )}

      {/* IDL Drop Zone - Only show if no JSON data */}
      {!hasJsonData(data) && (
        <div
          className={`mt-2 w-full rounded border-2 border-dotted p-3 text-center transition-colors ${
            isDragOver[address]
              ? 'border-blue-400 bg-blue-900/20'
              : droppedIdl[address]
                ? 'border-green-400 bg-green-900/20'
                : 'border-gray-500 bg-gray-900/20'
          }`}
          onDragOver={(e) => handleDragOver(e, address)}
          onDragLeave={(e) => handleDragLeave(e, address)}
          onDrop={(e) => handleDrop(e, address)}
        >
          {droppedIdl[address] ? (
            <div className="space-y-2">
              <div className="text-xs text-green-400">
                ✓ IDL file loaded: {Object.keys(droppedIdl[address].accounts || {}).length} accounts,{' '}
                {Object.keys(droppedIdl[address].instructions || {}).length} instructions
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  registerIdl(address);
                }}
                className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700"
              >
                Register IDL
              </button>
            </div>
          ) : (
            <div className="text-[12px] font-medium uppercase text-gray-400">
              DROP IDL.JSON FILE TO GET DATA DECODED
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface LamportsComparisonProps {
  beforeLamports: number;
  afterLamports: number;
}

export const LamportsComparison: React.FC<LamportsComparisonProps> = ({ beforeLamports, afterLamports }) => {
  const hasChange = beforeLamports !== afterLamports;
  const smallerAmount = Math.min(beforeLamports, afterLamports);
  const largerAmount = Math.max(beforeLamports, afterLamports);

  return (
    <div className="flex items-center gap-1">
      {hasChange && (
        <>
          <LamportsDisplay
            lamports={beforeLamports}
            className={
              beforeLamports === smallerAmount ? 'border-red-500/30 text-red-300' : 'border-green-500/30 text-green-300'
            }
          />
          <span className="text-xs text-gray-500">→</span>
        </>
      )}
      <LamportsDisplay
        lamports={afterLamports}
        className={
          hasChange
            ? afterLamports === smallerAmount
              ? 'border-red-500/30 text-red-300'
              : 'border-green-500/30 text-green-300'
            : ''
        }
      />
    </div>
  );
};

export interface PermissionsBoxProps {
  accountState: any;
  address: string;
  hasChanges: boolean;
  transactionProfile: any;
  selectedTransaction: any;
}

export const PermissionsBox: React.FC<PermissionsBoxProps> = ({
  accountState,
  address,
  hasChanges,
  transactionProfile,
  selectedTransaction,
}) => {
  // Check if this is an executable account (program)
  const isExecutable = (() => {
    let isExecutable = false;

    // Check all possible sources for executable flag
    if (hasChanges && accountState.accountChange.data) {
      if (Array.isArray(accountState.accountChange.data)) {
        // Update case - check both before and after
        isExecutable = accountState.accountChange.data[0]?.executable || accountState.accountChange.data[1]?.executable;
      } else {
        // Create/Delete case - check the single account
        isExecutable = accountState.accountChange.data.executable;
      }
    } else if (
      !hasChanges &&
      transactionProfile.readonlyAccountStates &&
      transactionProfile.readonlyAccountStates[address]
    ) {
      // Read-only account case
      isExecutable = transactionProfile.readonlyAccountStates[address].executable;
    }

    // Additional check: if we have instruction profiles, check if this address appears as a program
    if (!isExecutable && transactionProfile.instructionProfiles) {
      for (const instructionProfile of transactionProfile.instructionProfiles) {
        if (instructionProfile.accountStates && instructionProfile.accountStates[address]) {
          const accountState = instructionProfile.accountStates[address];
          if (accountState.accountChange?.data) {
            if (Array.isArray(accountState.accountChange.data)) {
              isExecutable =
                accountState.accountChange.data[0]?.executable || accountState.accountChange.data[1]?.executable;
            } else {
              isExecutable = accountState.accountChange.data.executable;
            }
          }
          if (isExecutable) break;
        }
      }
    }

    // Fallback check: look at the transaction's instruction data to identify program accounts
    if (!isExecutable && selectedTransaction?.transaction?.message?.instructions) {
      for (const instruction of selectedTransaction.transaction.message.instructions) {
        if (instruction.programId === address) {
          isExecutable = true;
          break;
        }
      }
    }

    return isExecutable;
  })();

  return (
    <div className="mr-3 flex items-center rounded-md bg-clip-border">
      <div className="h-6 rounded-[2px] border border-gray-600/50 bg-gray-800/50 font-mono text-xs">
        <span
          className={`inline-block h-full w-6 border-r border-gray-600/50 text-center ${accountState.type === 'readonly' ? 'bg-gray-300 text-gray-900' : 'text-gray-500'}`}
        >
          R
        </span>
        <span
          className={`inline-block h-full w-6 border-r border-gray-600/50 text-center ${accountState.type === 'writable' ? 'bg-gray-300 text-gray-900' : 'text-gray-500'}`}
        >
          W
        </span>
        <span
          className={`inline-block h-full w-6 text-center ${isExecutable ? 'bg-gray-300 text-gray-900' : 'text-gray-500'}`}
        >
          X
        </span>
      </div>
    </div>
  );
};

export interface AccountLabelsProps {
  accountState: any;
  address: string;
  hasChanges: boolean;
  transactionProfile: any;
  selectedTransaction: any;
}

export const AccountLabels: React.FC<AccountLabelsProps> = ({
  accountState,
  address,
  hasChanges,
  transactionProfile,
  selectedTransaction,
}) => {
  // Check if account has a change label (NEW, UPDATED, DELETED)
  const hasChangeLabel =
    hasChanges &&
    (accountState.accountChange.type === 'create' ||
      accountState.accountChange.type === 'update' ||
      accountState.accountChange.type === 'delete');

  return (
    <div className="flex items-center">
      {hasChanges && accountState.accountChange.type === 'create' && (
        <span className="mr-2 rounded border border-green-500/30 bg-green-900/30 px-2 py-0.5 text-[10px] font-medium text-green-300">
          NEW ACCOUNT
        </span>
      )}
      {hasChanges && accountState.accountChange.type === 'update' && (
        <span className="mr-2 rounded border border-yellow-500/30 bg-yellow-900/30 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
          UPDATED ACCOUNT
        </span>
      )}
      {hasChanges && accountState.accountChange.type === 'delete' && (
        <span className="mr-2 rounded border border-red-500/30 bg-red-900/30 px-2 py-0.5 text-[10px] font-medium text-red-300">
          DELETED ACCOUNT
        </span>
      )}

      {(() => {
        // Check if this is an executable account (program)
        let isExecutable = false;

        // Check all possible sources for executable flag
        if (hasChanges && accountState.accountChange.data) {
          if (Array.isArray(accountState.accountChange.data)) {
            // Update case - check both before and after
            isExecutable =
              accountState.accountChange.data[0]?.executable || accountState.accountChange.data[1]?.executable;
          } else {
            // Create/Delete case - check the single account
            isExecutable = accountState.accountChange.data.executable;
          }
        } else if (
          !hasChanges &&
          transactionProfile.readonlyAccountStates &&
          transactionProfile.readonlyAccountStates[address]
        ) {
          // Read-only account case
          isExecutable = transactionProfile.readonlyAccountStates[address].executable;
        }

        // Additional check: if we have instruction profiles, check if this address appears as a program
        if (!isExecutable && transactionProfile.instructionProfiles) {
          for (const instructionProfile of transactionProfile.instructionProfiles) {
            if (instructionProfile.accountStates && instructionProfile.accountStates[address]) {
              const accountState = instructionProfile.accountStates[address];
              if (accountState.accountChange?.data) {
                if (Array.isArray(accountState.accountChange.data)) {
                  isExecutable =
                    accountState.accountChange.data[0]?.executable || accountState.accountChange.data[1]?.executable;
                } else {
                  isExecutable = accountState.accountChange.data.executable;
                }
              }
              if (isExecutable) break;
            }
          }
        }

        // Fallback check: look at the transaction's instruction data to identify program accounts
        if (!isExecutable && selectedTransaction?.transaction?.message?.instructions) {
          for (const instruction of selectedTransaction.transaction.message.instructions) {
            if (instruction.programId === address) {
              isExecutable = true;
              break;
            }
          }
        }

        if (isExecutable && getProgramType(address)) {
          const programLabel = getProgramType(address);
          return (
            <span className="mr-2 rounded border border-gray-400/30 bg-gray-800/30 px-2 py-0.5 text-[10px] font-medium text-gray-200">
              {programLabel}
            </span>
          );
        }

        // If no other label applies and no change label exists, show READ ACCOUNT badge
        if (!hasChangeLabel) {
          return (
            <span className="mr-2 rounded border border-gray-500/30 bg-gray-900/30 px-2 py-0.5 text-[10px] font-medium text-gray-300">
              READ ACCOUNT
            </span>
          );
        }

        return null;
      })()}
    </div>
  );
};

export interface OwnerComparisonProps {
  beforeOwner: string;
  afterOwner: string;
  copiedStates: Record<string, boolean>;
  copyToClipboard: (text: string, id: string) => void;
  truncateAddress: (address: string) => string;
}

export const OwnerComparison: React.FC<OwnerComparisonProps> = ({
  beforeOwner,
  afterOwner,
  copiedStates,
  copyToClipboard,
  truncateAddress,
}) => {
  const hasChange = beforeOwner !== afterOwner;

  return (
    <div className="flex items-center gap-3">
      {hasChange && (
        <>
          <AddressDisplay
            address={beforeOwner}
            copiedStates={copiedStates}
            copyToClipboard={copyToClipboard}
            truncateAddress={truncateAddress}
            copyId={`owner-pre-${beforeOwner}`}
            aggressiveTruncate={true}
          />
          <span className="text-xs text-gray-500">→</span>
        </>
      )}
      <AddressDisplay
        address={afterOwner}
        copiedStates={copiedStates}
        copyToClipboard={copyToClipboard}
        truncateAddress={truncateAddress}
        copyId={`owner-post-${afterOwner}`}
        aggressiveTruncate={true}
      />
    </div>
  );
};

export interface DataComparisonProps {
  beforeData: any;
  afterData: any;
  address: string;
  context?: string;
  getAccountViewMode: (address: string, context?: string) => string;
  extractProgramData: (data: any) => any;
  getHexData: (data: any) => string;
  getHexDataForUpdates: (data: any) => string;
  hasJsonData: (data: any) => boolean;
  isDragOver: Record<string, boolean>;
  droppedIdl: Record<string, any>;
  handleDragOver: (e: React.DragEvent, address: string) => void;
  handleDragLeave: (e: React.DragEvent, address: string) => void;
  handleDrop: (e: React.DragEvent, address: string) => void;
  registerIdl: (address: string) => void;
  toggleAccountViewMode: (address: string, context?: string) => void;
  renderJsonDiff: (beforeJson: any, afterJson: any, isRed: boolean) => any;
  renderUnifiedJsonDiff: (beforeJson: any, afterJson: any) => any;
  copyToClipboard: (text: string, id: string) => void;
  copiedStates: Record<string, boolean>;
}

export const DataComparison: React.FC<DataComparisonProps> = ({
  beforeData,
  afterData,
  address,
  context,
  getAccountViewMode,
  extractProgramData,
  getHexData,
  getHexDataForUpdates,
  hasJsonData,
  isDragOver,
  droppedIdl,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  registerIdl,
  toggleAccountViewMode,
  renderJsonDiff,
  renderUnifiedJsonDiff,
  copyToClipboard,
  copiedStates,
}) => {
  // Use original before/after data
  const tempBeforeData = beforeData;
  const tempAfterData = afterData;

  // Refs for pretty-json to prevent re-rendering on expand/collapse
  const prettyJsonRef = useRef<HTMLDivElement>(null);
  const lastJsonStringRef = useRef<string>('');

  const jsonString = useMemo(() => {
    try {
      const extractedData = extractProgramData(afterData);
      if (extractedData === '<none>') return '<none>';
      return typeof extractedData === 'string' ? extractedData : JSON.stringify(extractedData, null, 2);
    } catch {
      return JSON.stringify(extractProgramData(afterData), null, 2);
    }
  }, [afterData, extractProgramData]);

  useEffect(() => {
    const viewMode = getAccountViewMode(address, context);
    const hasChange =
      viewMode === 'parsed'
        ? JSON.stringify(extractProgramData(tempBeforeData)) !== JSON.stringify(extractProgramData(tempAfterData))
        : getHexData(tempBeforeData) !== getHexData(tempAfterData);

    if (prettyJsonRef.current && typeof window !== 'undefined' && viewMode === 'parsed' && !hasChange) {
      // Only update if the JSON string actually changed
      if (lastJsonStringRef.current !== jsonString) {
        lastJsonStringRef.current = jsonString;
        if (jsonString === '<none>') {
          prettyJsonRef.current.innerHTML = '<div class="text-gray-500 text-xs italic">No data</div>';
        } else {
          prettyJsonRef.current.innerHTML = `<pretty-json expand="2" class="font-mono text-xs" style="--key-color: #60a5fa; --arrow-color: #6b7280; --brace-color: #6b7280; --bracket-color: #6b7280; --string-color: #a855f7; --number-color: #f59e0b; --null-color: #6b7280; --boolean-color: #f59e0b; --comma-color: #6b7280; --ellipsis-color: #6b7280; --indent: 1rem; --font-family: monospace; --font-size: 0.75rem;">${jsonString}</pretty-json>`;
        }
      }
    }
  }, [jsonString, address, context, getAccountViewMode, extractProgramData, getHexData, tempBeforeData, tempAfterData]);

  // Helper function to generate hex data from account data
  const generateHexData = (data: any) => {
    const getDataString = (data: any) => {
      if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
          try {
            return atob(data[0]);
          } catch (error) {
            return data[0] || '';
          }
        }
        return JSON.stringify(data);
      }
      return String(data);
    };

    const dataStr = getDataString(data);
    const bytes = Array.from(dataStr).map((char) => (char as string).charCodeAt(0));
    return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('');
  };

  // Copy button component
  const CopyButton = ({ data, label }: { data: any; label: string }) => {
    const copyId = `${label.toLowerCase()}-hex-${address}`;
    const isCopied = copiedStates[copyId];
    return (
      <button
        onClick={() => {
          const hexData = generateHexData(data);
          copyToClipboard(hexData, copyId);
        }}
        className="flex h-6 w-6 items-center justify-center rounded bg-zinc-700/50 text-zinc-400 transition-colors hover:bg-zinc-600 hover:text-zinc-200"
      >
        {isCopied ? (
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
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    );
  };

  const viewMode = getAccountViewMode(address, context);
  const hasChange =
    viewMode === 'parsed'
      ? JSON.stringify(extractProgramData(tempBeforeData)) !== JSON.stringify(extractProgramData(tempAfterData))
      : getHexData(tempBeforeData) !== getHexData(tempAfterData);

  return (
    <div className="w-full overflow-x-auto whitespace-pre border-t border-gray-600/30 bg-black/20 p-3 font-mono text-xs">
      {viewMode === 'parsed' ? (
        <div>
          {hasChange ? (
            <div>{renderUnifiedJsonDiff(extractProgramData(beforeData), extractProgramData(afterData))}</div>
          ) : (
            <div>
              <div ref={prettyJsonRef} />
            </div>
          )}
        </div>
      ) : (
        <div>
          {hasChange ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-500">BEFORE</div>
                  <CopyButton data={tempBeforeData} label="before" />
                </div>
                <div
                  className="font-mono text-xs"
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      // Get raw bytes from the data
                      const getRawBytes = (data: any) => {
                        if (typeof data === 'object' && data !== null) {
                          // If it's our new data structure with bytes field, use that
                          if (data.bytes && Array.isArray(data.bytes)) {
                            return data.bytes;
                          }

                          // If it's a base64 array, decode it
                          if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
                            try {
                              const decoded = atob(data[0]);
                              return Array.from(decoded).map((char) => (char as string).charCodeAt(0));
                            } catch (error) {
                              return [];
                            }
                          }

                          // If it's already an array of numbers, use it directly
                          if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
                            return data;
                          }

                          // Fallback: convert to JSON string and then to bytes
                          const jsonStr = JSON.stringify(data);
                          return Array.from(jsonStr).map((char) => (char as string).charCodeAt(0));
                        }
                        return [];
                      };

                      const beforeBytes = getRawBytes(tempBeforeData);
                      const afterBytes = getRawBytes(tempAfterData);
                      const { beforeDiffMap, afterDiffMap, diffResult } = computeHexDiff(beforeBytes, afterBytes);
                      const lines = [];

                      for (let i = 0; i < beforeBytes.length; i += 16) {
                        const beforeLineBytes = beforeBytes.slice(i, i + 16);

                        // Hex representation with analyzeHexDiff highlighting
                        const beforeHexParts = beforeLineBytes.map((byte: number, index: number) => {
                          const globalIndex = i + index;
                          const diffEntry = beforeDiffMap.get(globalIndex);

                          let highlightClass = '';
                          let borderClass = '';

                          if (diffEntry) {
                            if (diffEntry.type === 'removal') {
                              // Show removals in red
                              highlightClass = 'text-red-500 bg-red-900/30';
                            } else if (diffEntry.type === 'update') {
                              // Show updates in yellow
                              highlightClass = 'text-yellow-500 bg-yellow-900/30';
                            }
                          } else {
                            // Check if this byte follows an addition (for green border in before view)
                            if (diffResult.additions.length > 0) {
                              for (const addition of diffResult.additions) {
                                if (globalIndex === addition.beforeIndex) {
                                  borderClass = 'border-l-2 border-green-500';
                                  break;
                                }
                              }
                            }
                          }

                          const hex = byte.toString(16).padStart(2, '0').toUpperCase();
                          const combinedClass = highlightClass || borderClass;
                          return combinedClass
                            ? `<span class="${combinedClass} hex-grid">${hex}</span>`
                            : `<span class="hex-grid">${hex}</span>`;
                        });

                        // Join hex bytes directly since they're already wrapped in spans
                        const beforeHexPart = beforeHexParts.join('');

                        // Line number (offset)
                        const offset = i.toString(16).padStart(4, '0').toUpperCase();

                        // Create line with only hex (no ASCII) - use CSS for spacing between pairs
                        lines.push(
                          `<span class="text-gray-500">${offset}:</span> <span class="hex-grid">${beforeHexPart}</span>`
                        );
                      }

                      return lines.join('\n').replace(/\n/g, '<br>');
                    })(),
                  }}
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-500">AFTER</div>
                  <CopyButton data={tempAfterData} label="after" />
                </div>
                <div
                  className="font-mono text-xs"
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      // Get raw bytes from the data
                      const getRawBytes = (data: any) => {
                        if (typeof data === 'object' && data !== null) {
                          // If it's our new data structure with bytes field, use that
                          if (data.bytes && Array.isArray(data.bytes)) {
                            return data.bytes;
                          }

                          // If it's a base64 array, decode it
                          if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
                            try {
                              const decoded = atob(data[0]);
                              return Array.from(decoded).map((char) => (char as string).charCodeAt(0));
                            } catch (error) {
                              return [];
                            }
                          }

                          // If it's already an array of numbers, use it directly
                          if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
                            return data;
                          }

                          // Fallback: convert to JSON string and then to bytes
                          const jsonStr = JSON.stringify(data);
                          return Array.from(jsonStr).map((char) => (char as string).charCodeAt(0));
                        }
                        return [];
                      };

                      const beforeBytes = getRawBytes(tempBeforeData);
                      const afterBytes = getRawBytes(tempAfterData);
                      const { beforeDiffMap, afterDiffMap, diffResult } = computeHexDiff(beforeBytes, afterBytes);
                      const lines = [];

                      for (let i = 0; i < afterBytes.length; i += 16) {
                        const afterLineBytes = afterBytes.slice(i, i + 16);

                        // Hex representation with analyzeHexDiff highlighting
                        const afterHexParts = afterLineBytes.map((byte: number, index: number) => {
                          const globalIndex = i + index;
                          const diffEntry = afterDiffMap.get(globalIndex);

                          let highlightClass = '';
                          let borderClass = '';

                          if (diffEntry) {
                            if (diffEntry.type === 'addition') {
                              // Show additions in green
                              highlightClass = 'text-green-500 bg-green-900/30';
                            } else if (diffEntry.type === 'update') {
                              // Show updates in yellow
                              highlightClass = 'text-yellow-500 bg-yellow-900/30';
                            }
                          } else {
                            // Check if this byte follows a removal (for red border)
                            if (diffResult.removals.length > 0) {
                              for (const removal of diffResult.removals) {
                                // Calculate the correct position accounting for all previous removals
                                // Each removal shifts the positions in the after view
                                const removedBeforeThis = diffResult.removals
                                  .filter((r) => r.beforeRange.start < removal.beforeRange.start)
                                  .reduce((sum, r) => sum + (r.beforeRange.end - r.beforeRange.start + 1), 0);

                                const correctAfterPosition = removal.beforeRange.start - removedBeforeThis;

                                if (globalIndex === correctAfterPosition) {
                                  borderClass = 'border-l-2 border-red-500';
                                  break;
                                }
                              }
                            }
                          }

                          const hex = byte.toString(16).padStart(2, '0').toUpperCase();
                          const combinedClass = highlightClass || borderClass;
                          return combinedClass
                            ? `<span class="${combinedClass} hex-grid">${hex}</span>`
                            : `<span class="hex-grid">${hex}</span>`;
                        });

                        // Join hex bytes directly since they're already wrapped in spans
                        const afterHexPart = afterHexParts.join('');

                        // Line number (offset)
                        const offset = i.toString(16).padStart(4, '0').toUpperCase();

                        // Create line with only hex (no ASCII) - use CSS for spacing between pairs
                        lines.push(
                          `<span class="text-gray-500">${offset}:</span> <span class="hex-grid">${afterHexPart}</span>`
                        );
                      }

                      return lines.join('\n').replace(/\n/g, '<br>');
                    })(),
                  }}
                />
              </div>
            </div>
          ) : (
            <div>
              {(() => {
                const hexData = getHexDataForUpdates(afterData);
                if (hexData === '<none>') {
                  return <div className="text-xs italic text-gray-500">No data</div>;
                }
                return <div dangerouslySetInnerHTML={{ __html: hexData }} />;
              })()}
            </div>
          )}
        </div>
      )}

      {/* IDL Drop Zone - Only show if no JSON data */}
      {!hasJsonData(beforeData) && !hasJsonData(afterData) && (
        <div
          className={`mt-3 w-full rounded border-2 border-dotted p-3 text-center transition-colors ${
            isDragOver[address]
              ? 'border-blue-400 bg-blue-900/20'
              : droppedIdl[address]
                ? 'border-green-400 bg-green-900/20'
                : 'border-gray-500 bg-gray-900/20'
          }`}
          onDragOver={(e) => handleDragOver(e, address)}
          onDragLeave={(e) => handleDragLeave(e, address)}
          onDrop={(e) => handleDrop(e, address)}
        >
          {droppedIdl[address] ? (
            <div className="space-y-2">
              <div className="text-xs text-green-400">
                ✓ IDL file loaded: {Object.keys(droppedIdl[address].accounts || {}).length} accounts,{' '}
                {Object.keys(droppedIdl[address].instructions || {}).length} instructions
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  registerIdl(address);
                }}
                className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700"
              >
                Register IDL
              </button>
            </div>
          ) : (
            <div className="text-[12px] font-medium uppercase text-gray-400">
              DROP IDL.JSON FILE TO GET DATA DECODED
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface AccountDetailsProps {
  address: string;
  accountData: any;
  accountType: 'create' | 'delete' | 'read';
  copiedStates: Record<string, boolean>;
  getAccountViewMode: (address: string, context?: string) => string;
  copyToClipboard: (text: string, id: string) => void;
  extractProgramData: (data: any) => any;
  getHexData: (data: any) => string;
  hasJsonData: (data: any) => boolean;
  truncateAddress: (address: string) => string;
  isDragOver: Record<string, boolean>;
  droppedIdl: Record<string, any>;
  handleDragOver: (e: React.DragEvent, address: string) => void;
  handleDragLeave: (e: React.DragEvent, address: string) => void;
  handleDrop: (e: React.DragEvent, address: string) => void;
  registerIdl: (address: string) => void;
  toggleAccountViewMode: (address: string, context?: string) => void;
}

export const AccountDetails: React.FC<AccountDetailsProps> = ({
  address,
  accountData,
  accountType,
  copiedStates,
  getAccountViewMode,
  copyToClipboard,
  extractProgramData,
  getHexData,
  hasJsonData,
  truncateAddress,
  isDragOver,
  droppedIdl,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  registerIdl,
  toggleAccountViewMode,
}) => {
  const context = accountType;
  const getLamportsLabel = () => {
    if (accountType === 'delete') return 'LAMPORTS REMOVED';
    if (accountType === 'read') return 'LAMPORTS';
    return 'LAMPORTS ADDED';
  };

  return (
    <div className="space-y-4 text-xs text-gray-400">
      <div className="flex items-center justify-between">
        <span className="px-5 text-xs font-semibold text-gray-500">{getLamportsLabel()}</span>
        <span className="pr-5 text-right">
          <LamportsDisplay lamports={accountData.lamports} />
        </span>
      </div>
      {accountData.owner && (
        <div className="flex items-center justify-between">
          <span className="px-5 text-xs font-semibold text-gray-500">
            <span className="hidden sm:inline">ACCOUNT OWNER</span>
            <span className="sm:hidden">OWNER</span>
          </span>
          <OwnerDisplay
            owner={accountData.owner}
            copiedStates={copiedStates}
            copyToClipboard={copyToClipboard}
            truncateAddress={truncateAddress}
            copyId={`owner-${accountData.owner}`}
            className="mr-5"
          />
        </div>
      )}
      {accountData.executable ? (
        <div className="space-y-0 pb-2">{/* No content for executable accounts */}</div>
      ) : (
        <div className="space-y-0">
          <div className="flex items-center justify-between px-5 pb-2">
            <div className="text-xs font-semibold text-gray-500">DATA</div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAccountViewMode(address, context);
                }}
                className={`transition-colors ${
                  getAccountViewMode(address, context) === 'parsed'
                    ? 'font-medium text-white'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                Pretty
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAccountViewMode(address, context);
                }}
                className={`transition-colors ${
                  getAccountViewMode(address, context) === 'hex'
                    ? 'font-medium text-white'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                Hex
              </button>
            </div>
          </div>
          <DataDisplay
            data={accountData}
            address={address}
            context={context}
            getAccountViewMode={getAccountViewMode}
            extractProgramData={extractProgramData}
            getHexData={getHexData}
            hasJsonData={hasJsonData}
            isDragOver={isDragOver}
            droppedIdl={droppedIdl}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            registerIdl={registerIdl}
            toggleAccountViewMode={toggleAccountViewMode}
          />
        </div>
      )}
    </div>
  );
};

export interface UpdateAccountDetailsProps {
  address: string;
  accountData: any;
  copiedStates: Record<string, boolean>;
  getAccountViewMode: (address: string, context?: string) => string;
  copyToClipboard: (text: string, id: string) => void;
  extractProgramData: (data: any) => any;
  getHexData: (data: any) => string;
  getHexDataForUpdates: (data: any) => string;
  hasJsonData: (data: any) => boolean;
  truncateAddress: (address: string) => string;
  highlightDifferences: (beforeValue: any, afterValue: any, isRed: boolean) => any;
  renderJsonDiff: (beforeJson: any, afterJson: any, isRed: boolean) => any;
  renderUnifiedJsonDiff: (beforeJson: any, afterJson: any) => any;
  isDragOver: Record<string, boolean>;
  droppedIdl: Record<string, any>;
  handleDragOver: (e: React.DragEvent, address: string) => void;
  handleDragLeave: (e: React.DragEvent, address: string) => void;
  handleDrop: (e: React.DragEvent, address: string) => void;
  registerIdl: (address: string) => void;
  toggleAccountViewMode: (address: string, context?: string) => void;
}

export const UpdateAccountDetails: React.FC<UpdateAccountDetailsProps> = ({
  address,
  accountData,
  copiedStates,
  getAccountViewMode,
  copyToClipboard,
  extractProgramData,
  getHexData,
  getHexDataForUpdates,
  hasJsonData,
  truncateAddress,
  highlightDifferences,
  renderJsonDiff,
  renderUnifiedJsonDiff,
  isDragOver,
  droppedIdl,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  registerIdl,
  toggleAccountViewMode,
}) => {
  const context = 'update';
  return (
    <div className="space-y-3">
      {/* Lamports Field */}
      <div className="flex items-center justify-between px-5">
        <span
          className={`text-xs font-semibold ${accountData[0].lamports !== accountData[1].lamports ? 'text-yellow-400' : 'text-gray-400'}`}
        >
          LAMPORTS
        </span>
        <LamportsComparison beforeLamports={accountData[0].lamports} afterLamports={accountData[1].lamports} />
      </div>

      {/* Owner Field */}
      {accountData[0].owner && (
        <div className="flex items-center justify-between px-5">
          <span
            className={`text-xs font-semibold ${accountData[0].owner !== accountData[1].owner ? 'text-yellow-400' : 'text-gray-400'}`}
          >
            <span className="hidden sm:inline">ACCOUNT OWNER</span>
            <span className="sm:hidden">OWNER</span>
          </span>
          <OwnerComparison
            beforeOwner={accountData[0].owner}
            afterOwner={accountData[1].owner}
            copiedStates={copiedStates}
            copyToClipboard={copyToClipboard}
            truncateAddress={truncateAddress}
          />
        </div>
      )}

      {/* Data Field */}
      {accountData[0].executable || accountData[1].executable ? (
        <div className="space-y-0">{/* No content for executable accounts */}</div>
      ) : (
        <div className="space-y-0">
          <div className="flex items-center justify-between px-5 pb-2">
            <div
              className={`text-xs font-semibold ${
                (
                  getAccountViewMode(address) === 'parsed'
                    ? JSON.stringify(extractProgramData(accountData[0].data)) !==
                      JSON.stringify(extractProgramData(accountData[1].data))
                    : getHexData(accountData[0].data) !== getHexData(accountData[1].data)
                )
                  ? 'text-yellow-400'
                  : 'text-gray-400'
              }`}
            >
              DATA
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAccountViewMode(address, context);
                }}
                className={`transition-colors ${
                  getAccountViewMode(address, context) === 'parsed'
                    ? 'font-medium text-white'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                Pretty
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAccountViewMode(address, context);
                }}
                className={`transition-colors ${
                  getAccountViewMode(address, context) === 'hex'
                    ? 'font-medium text-white'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                Hex
              </button>
            </div>
          </div>
          <DataComparison
            beforeData={accountData[0]}
            afterData={accountData[1]}
            address={address}
            context={context}
            getAccountViewMode={getAccountViewMode}
            extractProgramData={extractProgramData}
            getHexData={getHexData}
            getHexDataForUpdates={getHexDataForUpdates}
            hasJsonData={hasJsonData}
            isDragOver={isDragOver}
            droppedIdl={droppedIdl}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            registerIdl={registerIdl}
            toggleAccountViewMode={toggleAccountViewMode}
            renderJsonDiff={renderJsonDiff}
            renderUnifiedJsonDiff={renderUnifiedJsonDiff}
            copyToClipboard={copyToClipboard}
            copiedStates={copiedStates}
          />
        </div>
      )}
    </div>
  );
};
