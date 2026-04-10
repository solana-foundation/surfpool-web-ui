'use client';

import { ArrowTopRightOnSquareIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { Badge, Dialog, DialogBody } from '@surfpool/ui';
import { getTransactionExplorerUrl, logger } from '@surfpool/shared';
import React, { useEffect, useState } from 'react';
import AddressDisplay from './address-display';
import { truncateAddress as truncateAddressUtil } from './lib/address-utils';
import {
  mergeTransactionProfiles,
  processTransactionProfile,
  type TransactionProfile,
  type TransactionReportEntry,
} from './lib/transaction-profile-utils';
import { getTransactionStatus, TransactionInfo, useTransactionInspector } from './lib/solana-transaction-stream';
import {
  ComputeUnitBar,
  InstructionProfileCard,
  LogsBlock,
  TransactionDetailPanel,
  PermissionsBox,
  type AccountExtensionProps,
} from './transaction-profile-components';

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

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      return () => {};
    }
  }, []);

  const [selectedTransaction, setSelectedTransaction] = useState<TransactionInfo | null>(null);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [transactionProfile, setTransactionProfile] = useState<TransactionProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [droppedIdl, setDroppedIdl] = useState<Record<string, any>>({});
  const [isDragOver, setIsDragOver] = useState<Record<string, boolean>>({});

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
    logger.log('Registering IDL for address:', address, droppedIdl[address]);
    alert(`IDL registered for ${address}`);
  };

  const idlDropZone = (address: string) => (
    <div
      className={`mt-2 w-full rounded border-2 border-dotted p-3 text-center transition-colors ${
        isDragOver[address]
          ? 'border-blue-400 bg-blue-900/20'
          : droppedIdl[address]
            ? 'border-green-400 bg-green-900/20'
            : 'border-zinc-500 bg-zinc-900/20'
      }`}
      onDragOver={(e) => handleDragOver(e, address)}
      onDragLeave={(e) => handleDragLeave(e, address)}
      onDrop={(e) => handleDrop(e, address)}
    >
      {droppedIdl[address] ? (
        <div className="space-y-2">
          <div className="text-xs text-green-400">
            IDL file loaded: {Object.keys(droppedIdl[address].accounts || {}).length} accounts,{' '}
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
        <div className="text-[12px] font-medium uppercase text-zinc-400">
          DROP IDL.JSON FILE TO GET DATA DECODED
        </div>
      )}
    </div>
  );

  const fetchTransactionProfile = async (signature: string) => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      setTransactionProfile(null);

      logger.log('Fetching transaction profile for signature:', signature);

      const [jsonParsedResponse, base64Response] = await Promise.all([
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'surfnet_getTransactionProfile',
            params: [signature, { encoding: 'jsonParsed' }],
          }),
        }),
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'surfnet_getTransactionProfile',
            params: [signature, { encoding: 'base64' }],
          }),
        }),
      ]);

      if (!jsonParsedResponse.ok || !base64Response.ok) {
        throw new Error(`HTTP error! status: jsonParsed=${jsonParsedResponse.status}, base64=${base64Response.status}`);
      }

      const [jsonParsedData, base64Data] = await Promise.all([jsonParsedResponse.json(), base64Response.json()]);

      if (jsonParsedData.result?.value && base64Data.result?.value) {
        const mergedProfile = mergeTransactionProfiles(jsonParsedData.result.value, base64Data.result.value);
        const profile = processTransactionProfile(mergedProfile);
        setTransactionProfile(profile);
      }
    } catch (error) {
      console.error('Error fetching transaction profile:', error);
      setProfileError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleTransactionClick = async (tx: TransactionInfo) => {
    try {
      setSelectedTransaction(tx);
      setTransactionDialogOpen(true);

      if (tx.transaction?.signatures?.[0]) {
        fetchTransactionProfile(tx.transaction.signatures[0]);

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
              setSelectedTransaction((prev: any) => ({
                ...prev,
                meta: {
                  ...prev?.meta,
                  fee: data.result.value.meta?.fee || prev?.meta?.fee,
                },
              }));
            }
          }
        } catch (feeError) {
          console.warn('Could not fetch real fee:', feeError);
        }
      }
    } catch (error) {
      console.error('Error handling transaction click:', error);
    }
  };

  const handleExportFixtures = async () => {
    try {
      const signature = selectedTransaction?.transaction?.signatures?.[0];
      if (!signature) return;

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'surfnet_exportSnapshot',
          params: [{ scope: { preTransaction: signature } }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
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
        }
      } else {
        console.error('Error exporting fixtures:', response.statusText);
      }
    } catch (error) {
      console.error('Error exporting fixtures:', error);
    }
  };

  // Adapt TransactionInfo to TransactionReportEntry for TransactionDetailPanel
  const toReportEntry = (tx: TransactionInfo): TransactionReportEntry => ({
    signature: tx.transaction?.signatures?.[0] ?? '',
    slot: tx.slot,
    error: tx.err ? (typeof tx.err === 'string' ? tx.err : JSON.stringify(tx.err)) : null,
    logs: tx.meta?.logMessages ?? [],
  });

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

  const extensions: AccountExtensionProps = {
    transactionProfile,
    selectedTransaction: selectedTransaction as any,
    renderPermissionsBox: (address, accountState) => (
      <PermissionsBox
        accountState={accountState}
        address={address}
        hasChanges={!!(accountState as any).accountChange && (accountState as any).accountChange?.type !== 'unchanged'}
        transactionProfile={transactionProfile}
        selectedTransaction={selectedTransaction as any}
      />
    ),
  };

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
                          <div className="absolute inset-0 animate-ping rounded-full bg-red-500/30"></div>
                          <div className="absolute inset-2 animate-pulse rounded-full bg-red-500/50"></div>
                          <div className="absolute inset-3 rounded-full bg-red-500"></div>
                        </>
                      ) : (
                        <>
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
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`h-3 w-3 flex-shrink-0 rounded-full ${
                          status === 'success' ? 'bg-[#60d695]' : status === 'failed' ? 'bg-[#ff6b6b]' : 'bg-zinc-500'
                        }`}
                      />
                      <div className="flex flex-col">
                        <span className="truncate font-mono text-base font-bold text-white">{shortSig}</span>
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
                          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-600 hover:text-zinc-200"
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
                          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-600 hover:text-zinc-200"
                          title="Open in explorer"
                        >
                          <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

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
              {/* Export Fixtures Header */}
              {transactionProfile && (
                <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 p-3">
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
                    <span className="text-xs text-zinc-500">Accounts Loaded</span>
                  </div>
                  <button
                    onClick={handleExportFixtures}
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

              {/* Profile Loading State */}
              {profileLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-500"></div>
                    <span className="text-sm text-zinc-400">Loading transaction profile...</span>
                  </div>
                </div>
              )}

              {/* Profile Error State */}
              {profileError && (
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
              )}

              {/* Transaction Detail Panel (shared component) */}
              {!profileLoading && !profileError && (
                <TransactionDetailPanel
                  entry={toReportEntry(selectedTransaction)}
                  profile={transactionProfile}
                  rpcUrl={rpcUrl}
                  extensions={extensions}
                />
              )}

              {/* Legacy Instructions View (fallback when no profile) */}
              {!transactionProfile && !profileLoading && selectedTransaction.transaction?.message?.instructions && (
                <>
                  <div className="mb-3 text-sm font-semibold text-zinc-200">INSTRUCTIONS</div>
                  <div className="rounded-lg bg-zinc-800/50 p-4">
                    <div className="mb-2 text-xs text-zinc-500">
                      Instructions ({selectedTransaction.transaction.message.instructions.length})
                    </div>
                    <div className="max-h-48 space-y-3 overflow-y-auto">
                      {selectedTransaction.transaction.message.instructions.map((instruction: any, index: number) => (
                        <div key={index} className="border-l-2 border-zinc-600 pl-3">
                          <div className="mb-1 font-mono text-xs text-zinc-300">
                            <span className="text-zinc-500">#{index + 1}:</span>{' '}
                            {instruction.programId || 'Unknown Program'}
                          </div>
                          {instruction.accounts && instruction.accounts.length > 0 && (
                            <div className="ml-4 text-xs text-zinc-400">
                              <div className="mb-1 text-zinc-500">Accounts:</div>
                              <div className="space-y-1">
                                {instruction.accounts.map((acc: any, accIndex: number) => (
                                  <div key={accIndex} className="flex items-start gap-2">
                                    <span className="w-6 text-zinc-500">{accIndex}:</span>
                                    <span className="break-all">
                                      {typeof acc === 'object' && acc !== null ? JSON.stringify(acc) : String(acc)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {instruction.data && (
                            <div className="ml-4 mt-1 text-xs text-zinc-400">
                              <div className="mb-1 text-zinc-500">Data:</div>
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
            <div className="py-8 text-center text-zinc-500">No transaction selected</div>
          )}
        </DialogBody>
      </Dialog>
    </div>
  );
}
