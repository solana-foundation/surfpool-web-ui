'use client';

import { truncateAddress as truncateAddressUtil } from './lib/address-utils';
import {
  computeHexDiff,
  getProgramName,
  getProgramType,
  mergeTransactionProfiles,
  processTransactionProfile,
} from './lib/transaction-profile-utils';
import { getTransactionStatus, TransactionInfo, useTransactionInspector } from './lib/solana-transaction-stream';
import {
  ComputeUnitBar,
  InstructionProfileCard,
  LamportsComparison,
  LamportsDisplay,
  LogsBlock,
} from './transaction-profile-components';
import { ArrowTopRightOnSquareIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { Badge, Dialog, DialogBody } from '@surfpool/ui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getTransactionExplorerUrl, logger } from '@surfpool/shared';
import AddressDisplay from './address-display';


interface OwnerDisplayProps {
  owner: string;
  copiedStates: Record<string, boolean>;
  copyToClipboard: (text: string, id: string) => void;
  truncateAddress: (address: string) => string;
  copyId: string;
  className?: string;
}

const OwnerDisplay: React.FC<OwnerDisplayProps> = ({
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

interface DataDisplayProps {
  data: any;
  address: string;
  context?: string;
  getAccountViewMode: (address: string, context?: string) => string;
  extractProgramData: (data: any) => any;
  getHexData: (data: any) => string;
  getHexDataResponsive: (data: any) => string;
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

const DataDisplay: React.FC<DataDisplayProps> = ({
  data,
  address,
  context,
  getAccountViewMode,
  extractProgramData,
  getHexData,
  getHexDataResponsive,
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
            __html: getHexDataResponsive(data),
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



interface PermissionsBoxProps {
  accountState: any;
  address: string;
  hasChanges: boolean;
  transactionProfile: any;
  selectedTransaction: any;
}

const PermissionsBox: React.FC<PermissionsBoxProps> = ({
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

interface AccountLabelsProps {
  accountState: any;
  address: string;
  hasChanges: boolean;
  transactionProfile: any;
  selectedTransaction: any;
}

const AccountLabels: React.FC<AccountLabelsProps> = ({
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

interface OwnerComparisonProps {
  beforeOwner: string;
  afterOwner: string;
  copiedStates: Record<string, boolean>;
  copyToClipboard: (text: string, id: string) => void;
  truncateAddress: (address: string) => string;
}

const OwnerComparison: React.FC<OwnerComparisonProps> = ({
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

interface DataComparisonProps {
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
}

const DataComparison: React.FC<DataComparisonProps> = ({
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
  const CopyButton = ({ data, label }: { data: any; label: string }) => (
    <button
      onClick={() => {
        const hexData = generateHexData(data);
        copyToClipboard(hexData, `${label.toLowerCase()}-hex-${address}`);
      }}
      className="mr-6 text-gray-400 transition-colors hover:text-white"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    </button>
  );

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
  rpcUrl: string;
  wsUrl: string;
  maxTransactions?: number;
  autoStart?: boolean;
  filterByProgram?: string;
  filterByAccount?: string;
  compact?: boolean;
  fetchHistorical?: boolean;
  hideTitle?: boolean;
}

interface AccountDetailsProps {
  address: string;
  accountData: any;
  accountType: 'create' | 'delete' | 'read';
  copiedStates: Record<string, boolean>;
  getAccountViewMode: (address: string, context?: string) => string;
  copyToClipboard: (text: string, id: string) => void;
  extractProgramData: (data: any) => any;
  getHexData: (data: any) => string;
  getHexDataResponsive: (data: any) => string;
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

interface UpdateAccountDetailsProps {
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

const AccountDetails: React.FC<AccountDetailsProps> = ({
  address,
  accountData,
  accountType,
  copiedStates,
  getAccountViewMode,
  copyToClipboard,
  extractProgramData,
  getHexData,
  getHexDataResponsive,
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
            getHexDataResponsive={getHexDataResponsive}
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

const UpdateAccountDetails: React.FC<UpdateAccountDetailsProps> = ({
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
          />
        </div>
      )}
    </div>
  );
};

export default function TransactionInspector({
  rpcUrl,
  wsUrl,
  maxTransactions = 50,
  autoStart = true,
  filterByProgram,
  filterByAccount,
  compact = false,
  fetchHistorical = true,
  hideTitle = false,
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

  const getHexData = (data: any) => {
    if (typeof data === 'object' && data !== null) {
      // If it's a base64 array, decode and convert to hex
      if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
        try {
          const decoded = atob(data[0]);
          return formatHexDump(decoded);
        } catch (error) {
          return data[0] || '<none>';
        }
      }

      // If it's our new data structure with bytes field, use that
      if (data.bytes && Array.isArray(data.bytes)) {
        const bytes = data.bytes;
        const bytesString = String.fromCharCode(...bytes);
        return formatHexDump(bytesString);
      }

      // If it's an array of numbers (decoded bytes), convert to hex
      if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
        const bytesString = String.fromCharCode(...data);
        return formatHexDump(bytesString);
      }

      // For other objects, convert to hex representation
      const jsonStr = JSON.stringify(data);
      return formatHexDump(jsonStr);
    }
    // For strings, convert to hex
    const str = String(data);
    if (str === '' || str === 'null' || str === 'undefined') return '<none>';
    return formatHexDump(str);
  };

  const getHexDataResponsive = (data: any, isSmallScreen: boolean = false) => {
    if (typeof data === 'object' && data !== null) {
      // If it's a base64 array, decode and convert to hex
      if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
        try {
          const decoded = atob(data[0]);
          return formatHexDump(decoded);
        } catch (error) {
          return data[0] || '<none>';
        }
      }

      // If it's our new data structure with bytes field, use that
      if (data.bytes && Array.isArray(data.bytes)) {
        const bytes = data.bytes;
        const bytesString = String.fromCharCode(...bytes);
        return formatHexDump(bytesString);
      }

      // If it's an array of numbers (decoded bytes), convert to hex
      if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
        const bytesString = String.fromCharCode(...data);
        return formatHexDump(bytesString);
      }

      // For other objects, convert to hex representation
      const jsonStr = JSON.stringify(data);
      return formatHexDump(jsonStr);
    }
    // For strings, convert to hex
    const str = String(data);
    if (str === '' || str === 'null' || str === 'undefined') return '<none>';
    return formatHexDump(str);
  };

  const getHexDataForUpdates = (data: any) => {
    if (typeof data === 'object' && data !== null) {
      // If it's a base64 array, decode and convert to hex
      if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
        try {
          const decoded = atob(data[0]);
          return decoded === '' ? '<none>' : formatHexOnly(decoded);
        } catch (error) {
          return data[0] === '' ? '<none>' : data[0] || '<none>';
        }
      }

      // If it's our new data structure with bytes field, use that
      if (data.bytes && Array.isArray(data.bytes)) {
        if (data.bytes.length === 0) {
          return '<none>';
        }
        const bytes = data.bytes;
        const bytesString = String.fromCharCode(...bytes);
        return formatHexOnly(bytesString);
      }

      // If it's an array of numbers (decoded bytes), convert to hex
      if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
        if (data.length === 0) {
          return '<none>';
        }
        const bytesString = String.fromCharCode(...data);
        return formatHexOnly(bytesString);
      }

      // Check if it's an empty array or empty object
      if (Array.isArray(data) && data.length === 0) {
        return '<none>';
      }

      if (Object.keys(data).length === 0) {
        return '<none>';
      }

      // For other objects, convert to hex representation
      const jsonStr = JSON.stringify(data);
      if (jsonStr === '[]' || jsonStr === '{}' || jsonStr === 'null' || jsonStr === 'undefined') {
        return '<none>';
      }
      return formatHexOnly(jsonStr);
    }
    // For strings, convert to hex
    const str = String(data);
    if (str === '' || str === 'null' || str === 'undefined') return '<none>';
    return formatHexOnly(str);
  };

  const formatHexDump = (data: string) => {
    const bytes = Array.from(data).map((char) => char.charCodeAt(0));
    const lines = [];

    for (let i = 0; i < bytes.length; i += 16) {
      const lineBytes = bytes.slice(i, i + 16);

      // Hex representation - join bytes with span elements for CSS padding
      const hexPart = lineBytes
        .map((byte) => `<span>${byte.toString(16).padStart(2, '0').toUpperCase()}</span>`)
        .join('');

      // ASCII representation
      const asciiPart = lineBytes
        .map((byte) => {
          if (byte >= 32 && byte <= 126) {
            return String.fromCharCode(byte);
          } else {
            return '.';
          }
        })
        .join('');

      // Line number (offset)
      const offset = i.toString(16).padStart(4, '0').toUpperCase();

      // Create line with HTML styling and proper layout - use CSS for spacing
      const hexSection = `<span class="text-gray-500">${offset}:</span> <span class="text-white hex-grid">${hexPart}</span>`;
      const asciiSection = `<span class="text-gray-400">|${asciiPart}|</span>`;

      // Use flexbox layout to push ASCII to the right
      lines.push(
        `<div class="flex justify-between items-start"><div>${hexSection}</div><div>${asciiSection}</div></div>`
      );
    }

    return lines.join('');
  };

  const formatHexOnly = (data: string) => {
    const bytes = Array.from(data).map((char) => char.charCodeAt(0));
    const lines = [];

    for (let i = 0; i < bytes.length; i += 16) {
      const lineBytes = bytes.slice(i, i + 16);

      // Hex representation - join bytes with span elements for CSS padding
      const hexPart = lineBytes
        .map((byte) => `<span>${byte.toString(16).padStart(2, '0').toUpperCase()}</span>`)
        .join('');

      // Line number (offset)
      const offset = i.toString(16).padStart(4, '0').toUpperCase();

      // Create line with only hex (no ASCII) - use CSS for spacing
      lines.push(`${offset}: <span class="hex-grid">${hexPart}</span>`);
    }

    return lines.join('\n');
  };

  // Helper function to extract programData from parsed data
  const hasJsonData = (data: any) => {
    if (typeof data === 'object' && data !== null) {
      // Check if it has the new structure with json field
      if (data.json) {
        return true;
      }

      // Check if it has the parsed structure with programData
      if (data.parsed && data.parsed.info && data.parsed.info.programData) {
        return true;
      }

      // Check if it's a base64 array format: ["base64string", "base64"]
      if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
        try {
          const decoded = atob(data[0]);
          return decoded !== '' && decoded !== '<none>';
        } catch (error) {
          return data[0] !== '' && data[0] !== '<none>';
        }
      }

      // Check if it's a meaningful JSON object (not empty)
      try {
        const jsonStr = JSON.stringify(data);
        return jsonStr !== '{}' && jsonStr !== 'null' && jsonStr !== 'undefined';
      } catch (error) {
        return false;
      }
    }
    const stringValue = String(data);
    return stringValue !== '' && stringValue !== 'null' && stringValue !== 'undefined' && stringValue !== '<none>';
  };

  const extractProgramData = (data: any) => {
    if (typeof data === 'object' && data !== null) {
      // Check if it has the new structure with json field
      if (data.json) {
        return data.json;
      }

      // Check if it has the parsed structure with programData
      if (data.parsed && data.parsed.info && data.parsed.info.programData) {
        return data.parsed.info.programData;
      }

      // Check if it's a base64 array format: ["base64string", "base64"]
      if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
        try {
          const decoded = atob(data[0]);
          return decoded === '' ? '<none>' : decoded;
        } catch (error) {
          // If decoding fails, return the original base64 string
          return data[0] === '' ? '<none>' : data[0];
        }
      }

      // Check if it's an empty array or empty object
      if (Array.isArray(data) && data.length === 0) {
        return '<none>';
      }

      if (Object.keys(data).length === 0) {
        return '<none>';
      }

      // Pretty print JSON objects
      try {
        const jsonStr = JSON.stringify(data, null, 2);
        // Check if the JSON string represents empty data
        if (jsonStr === '[]' || jsonStr === '{}' || jsonStr === 'null' || jsonStr === 'undefined') {
          return '<none>';
        }
        return jsonStr;
      } catch (error) {
        return JSON.stringify(data);
      }
    }
    const stringValue = String(data);
    return stringValue === '' || stringValue === 'null' || stringValue === 'undefined' ? '<none>' : stringValue;
  };

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

  // Helper function to find changed paths in objects
  const findChangedPaths = (beforeObj: any, afterObj: any, currentPath: string[] = []): Set<string> => {
    const changedPaths = new Set<string>();

    if (typeof beforeObj !== typeof afterObj) {
      // Different types - mark current path as changed
      changedPaths.add(currentPath.join('.'));
      return changedPaths;
    }

    if (typeof beforeObj !== 'object' || beforeObj === null || afterObj === null) {
      // Primitive values - compare directly
      if (beforeObj !== afterObj) {
        changedPaths.add(currentPath.join('.'));
      }
      return changedPaths;
    }

    if (Array.isArray(beforeObj) !== Array.isArray(afterObj)) {
      // One is array, other is object
      changedPaths.add(currentPath.join('.'));
      return changedPaths;
    }

    if (Array.isArray(beforeObj)) {
      // Arrays - compare each element
      const maxLength = Math.max(beforeObj.length, afterObj.length);
      for (let i = 0; i < maxLength; i++) {
        const beforeItem = beforeObj[i];
        const afterItem = afterObj[i];
        const itemPath = [...currentPath, i.toString()];
        const itemChanges = findChangedPaths(beforeItem, afterItem, itemPath);
        itemChanges.forEach((path) => changedPaths.add(path));
      }
    } else {
      // Objects - compare each property
      const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
      for (const key of allKeys) {
        const beforeValue = beforeObj[key];
        const afterValue = afterObj[key];
        const keyPath = [...currentPath, key];

        // Check if property exists in both objects
        const beforeExists = key in beforeObj;
        const afterExists = key in afterObj;

        if (!beforeExists || !afterExists) {
          // Property was added or removed
          changedPaths.add(keyPath.join('.'));
        } else {
          // Property exists in both - compare values
          const keyChanges = findChangedPaths(beforeValue, afterValue, keyPath);
          keyChanges.forEach((path) => changedPaths.add(path));
        }
      }
    }

    return changedPaths;
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
        {!hideTitle && (
          <div className="mb-0 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-white">Transaction Inspector</h2>
          </div>
        )}
        <div className="flex h-[280px] items-center justify-center">
          <div className="h-3 w-3 animate-pulse rounded-full bg-pink-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full flex-col gap-4 space-y-6">
      {!hideTitle && (
        <div className="mb-0">
          <h2 className="text-sm font-medium uppercase tracking-wide text-white">Transaction Inspector</h2>
        </div>
      )}

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
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(signature, `sig-${signature}`);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-zinc-600 hover:text-gray-200"
                          title="Copy signature"
                        >
                          <ClipboardIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const explorerUrl = getTransactionExplorerUrl(signature, rpcUrl);
                            window.open(explorerUrl, '_blank');
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-zinc-600 hover:text-gray-200"
                          title="Open in explorer"
                        >
                          <ArrowTopRightOnSquareIcon className="h-5 w-5" />
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
                        const explorerUrl = getTransactionExplorerUrl(signature, rpcUrl);
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
                  <div className="col-span-2 flex items-center justify-between rounded-lg bg-zinc-800/50 p-3">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-3xl font-bold text-zinc-100">
                        {(() => {
                          const readonlyCount = Object.keys(transactionProfile.readonlyAccountStates || {}).length;
                          const writableCount = Object.keys(
                            transactionProfile.transactionProfile?.accountStates || {}
                          ).length;
                          return readonlyCount + writableCount;
                        })()}
                      </span>
                      <span className="text-xs text-gray-500">Accounts Loaded</span>
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
                          const response = await fetch(rpcUrl, {
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
                            const data = await response.json();
                            logger.log('📸 Export fixtures response:', data);

                            if (data.result) {
                              // Download the snapshot as JSON
                              const jsonString = JSON.stringify(data.result.value, null, 2);
                              const blob = new Blob([jsonString], { type: 'application/json' });
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
                      className="group flex items-center gap-2 rounded-md bg-pink-600 px-3 py-2 text-sm text-white transition-all duration-200 hover:bg-pink-700"
                    >
                      <svg
                        className="h-6 w-6 flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
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
                      <div className="flex flex-col items-start">
                        <span className="text-xs uppercase leading-tight tracking-wide">Download Fixtures</span>
                        <span className="text-[9px] uppercase leading-tight text-zinc-300">Pre-execution Snapshot</span>
                      </div>
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
                      <ComputeUnitBar
                        values={transactionProfile.instructionProfiles.map((profile: any) => profile.computeUnitsConsumed || 0)}
                      />
                    </div>
                  )}

                  {/* Instruction Profiles */}
                  <div className="space-y-4">
                    {transactionProfile.instructionProfiles?.map((profile: any, index: number) => {
                      // Get the actual instruction from selectedTransaction using the index
                      const instruction = selectedTransaction?.transaction?.message?.instructions?.[index];
                      const programId = instruction?.programId || profile.programId;
                      return (
                        <InstructionProfileCard
                          key={index}
                          index={index}
                          instruction={profile}
                          programId={programId}
                          open={expandedInstructions.has(index)}
                          onToggle={() => toggleInstructionExpansion(index)}
                          headerExtras={
                            profile.errorMessage ? (
                              <Badge color="red" className="text-xs">
                                ERROR
                              </Badge>
                            ) : undefined
                          }
                        >
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
                                                    getHexDataResponsive={getHexDataResponsive}
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
                                                    getHexDataResponsive={getHexDataResponsive}
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
                                                      getHexDataResponsive={getHexDataResponsive}
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
                                <LogsBlock logs={profile.logMessages} title="LOGS" />
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
                        </InstructionProfileCard>
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
