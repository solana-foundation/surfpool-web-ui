import { logger } from '@surfpool/shared';
import { useEffect, useState, useRef, useCallback } from 'react';
import { solanaWebSocketService, SolanaWebSocketService } from './solana-websocket-service';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { convertTokenAmount } from './address-utils';
// Types for transaction data
export interface TransactionInfo {
  signatures: string[];
  slot: number;
  err: any;
  memo: string | null;
  blockTime: number | null;
  meta: {
    err: any;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    innerInstructions: any[];
    logMessages: string[];
    preTokenBalances: any[];
    postTokenBalances: any[];
    rewards: any[];
    loadedAddresses: any;
    returnData: any;
    computeUnitsConsumed: number;
  } | null;
  transaction: {
    message: {
      accountKeys: string[];
      recentBlockhash: string;
      instructions: any[];
      header: {
        numRequiredSignatures: number;
        numReadonlySignedAccounts: number;
        numReadonlyUnsignedAccounts: number;
      };
    };
    signatures: string[];
  };
}

export interface TokenAmount {
  amount: string | null;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}
export interface TransactionInspectorOptions {
  rpcUrl?: string;
  wsUrl?: string;
  maxTransactions?: number;
  autoStart?: boolean;
  filterByProgram?: string; // Program ID to filter transactions
  filterByAccount?: string; // Account to filter transactions
  fetchHistorical?: boolean; // Whether to fetch historical/local signatures (default: true)
  // A historical surfnet: a reset or restart removes its local transactions, so the list is
  // reconciled with the surfnet's own local signatures on every slot change and reconnect.
  reconcile?: boolean;
}

export interface TransactionInspectorStats {
  totalReceived: number;
  successful: number;
  failed: number;
  lastUpdate: Date;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
}

export interface AccountInfo {
  ata_address: string | null;
  data: any;
  executable: boolean;
  lamports: number;
  owner: string;
  rentEpoch: number;
}
export function useTransactionInspector(options: TransactionInspectorOptions = {}) {
  const {
    rpcUrl,
    wsUrl,
    maxTransactions = 50,
    autoStart = true,
    filterByProgram,
    filterByAccount,
    fetchHistorical = true,
    reconcile = false
  } = options;

  // Validate that required URLs are provided
  if (!rpcUrl || !wsUrl) {
    throw new Error('rpcUrl and wsUrl are required for useTransactionInspector');
  }

  const [transactions, setTransactions] = useState<TransactionInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(autoStart);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TransactionInspectorStats>({
    totalReceived: 0,
    successful: 0,
    failed: 0,
    lastUpdate: new Date(),
    connectionStatus: 'disconnected'
  });
  
  const subscriptionIdRef = useRef<string | null>(null);
  const processedSignaturesRef = useRef<Map<string, number>>(new Map());
  const transactionsRef = useRef<TransactionInfo[]>([]);
  const transactionReadsRef = useRef<Map<string, number>>(new Map());
  const readRef = useRef(0);
  const generationRef = useRef(0);
  const reconcileReadRef = useRef(0);
  const localSnapshotRef = useRef<{ read: number; signatures: Set<string> } | null>(null);
  const mountedRef = useRef(true);
  const streamingRequestedRef = useRef(autoStart);
  const streamOperationRef = useRef(0);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const currentRead = useCallback((signature: string, read: number, generation: number) => {
    const snapshot = localSnapshotRef.current;
    return mountedRef.current && generation === generationRef.current &&
      (!reconcile || !snapshot || read > snapshot.read || snapshot.signatures.has(signature));
  }, [reconcile]);

  const fetchTransactionDetails = useCallback(async (signature: string, read: number, generation: number) => {
    try {
      logger.log('🌐 Fetching transaction details from:', rpcUrl);
      logger.log('📋 Signature:', signature);

      const requestBody = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          {
            encoding: 'jsonParsed',
            maxSupportedTransactionVersion: 0,
            commitment: 'processed'
          }
        ]
      };

      logger.log('📤 Request body:', requestBody);

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      logger.log('📡 Response status:', response.status);
      logger.log('📡 Response ok:', response.ok);

      const data = await response.json();
      logger.log('📥 Transaction fetch response:', data);

      if (!currentRead(signature, read, generation)) {
        logger.log('Dropping a stale transaction read:', { signature, read, generation });
        return false;
      }

      if (data.result) {
        const txInfo: TransactionInfo = data.result;
        logger.log('✅ Transaction details received:', {
          signature: txInfo.transaction.signatures[0],
          slot: txInfo.slot,
          blockTime: txInfo.blockTime,
          hasError: !!txInfo.meta?.err,
          fee: txInfo.meta?.fee,
          computeUnits: txInfo.meta?.computeUnitsConsumed
        });

        // Filter by program if specified
        if (filterByProgram) {
          const hasProgram = txInfo.transaction.message.instructions.some(
            (instruction: any) => instruction.programId === filterByProgram
          );
          if (!hasProgram) {
            logger.log('🚫 Transaction filtered out (program mismatch)');
            return false;
          }
        }

        logger.log('📊 Adding transaction to state...');
        const newTransactions = [txInfo, ...transactionsRef.current].slice(0, maxTransactions);
        transactionReadsRef.current.set(signature, read);
        const kept = new Set(newTransactions.map(tx => tx.transaction.signatures[0]));
        for (const key of transactionReadsRef.current.keys()) {
          if (!kept.has(key)) transactionReadsRef.current.delete(key);
        }
        transactionsRef.current = newTransactions;
        setTransactions(newTransactions);

        setStats(prev => {
          const newStats = {
            ...prev,
            totalReceived: prev.totalReceived + 1,
            successful: prev.successful + (txInfo.meta?.err ? 0 : 1),
            failed: prev.failed + (txInfo.meta?.err ? 1 : 0),
            lastUpdate: new Date()
          };
          logger.log('📊 Stats updated:', newStats);
          return newStats;
        });
        return true;
      } else {
        logger.log('❌ No transaction result in response');
      }
    } catch (err) {
      console.error('Error fetching transaction details:', err);
    }
    return false;
  }, [rpcUrl, filterByProgram, maxTransactions, currentRead]);

  const processTransactionSignature = useCallback(async (
    signature: string, err?: any, read = ++readRef.current, generation = generationRef.current
  ) => {
    if (!currentRead(signature, read, generation)) return;
    // Check if we've already processed this signature
    if (processedSignaturesRef.current.has(signature)) {
      logger.log('🔄 Signature already processed, skipping:', signature);
      return;
    }

    // Mark signature as processed
    processedSignaturesRef.current.set(signature, read);
    // Fetch full transaction details
    logger.log('🔄 Fetching transaction details for signature:', signature);
    const accepted = await fetchTransactionDetails(signature, read, generation);
    if (!accepted && processedSignaturesRef.current.get(signature) === read) {
      processedSignaturesRef.current.delete(signature);
    }
  }, [fetchTransactionDetails, currentRead]);

  const subscribeToStream = useCallback(async (operation: number) => {
    const current = () => mountedRef.current && streamingRequestedRef.current &&
      operation === streamOperationRef.current;
    const filter = filterByAccount ? { account: filterByAccount } :
                  filterByProgram ? { program: filterByProgram } : undefined;
    const subscription = await solanaWebSocketService.subscribeToTransactions(filter);
    if (!current()) {
      solanaWebSocketService.unsubscribe(subscription, 'transaction');
      return false;
    }
    subscriptionIdRef.current = subscription;
    if (reconcile) {
      const slots = await solanaWebSocketService.subscribeToSlots();
      if (!current()) {
        solanaWebSocketService.unsubscribe(slots, 'slot');
        solanaWebSocketService.unsubscribe(subscription, 'transaction');
        return false;
      }
    }
    return true;
  }, [filterByAccount, filterByProgram, reconcile]);

  const startStreaming = useCallback(async () => {
    streamingRequestedRef.current = true;
    const operation = ++streamOperationRef.current;
    if (!wsUrl) {
      const errorMsg = 'WebSocket URL not provided';
      console.error('❌', errorMsg);
      setError(errorMsg);
      return;
    }

    try {
      logger.log('🚀 Starting transaction stream...');
      setError(null);
      setStats(prev => ({ ...prev, connectionStatus: 'connecting' }));

      // Unsubscribe from any existing subscription before creating a new one
      if (subscriptionIdRef.current) {
        logger.log('📡 Cleaning up old subscription before reconnecting...');
        try {
          solanaWebSocketService.unsubscribeAll();
        } catch (err) {
          console.warn('⚠️ Error cleaning up old subscription:', err);
        }
        subscriptionIdRef.current = null;
      }

      // Connect to WebSocket service
      logger.log('🔗 Connecting to WebSocket service...');
      logger.log('🔗 Original WebSocket URL:', wsUrl);

      // Convert HTTP URL to WebSocket URL if needed
      const convertedWsUrl = SolanaWebSocketService.convertHttpToWebSocket(wsUrl);
      logger.log('🔗 Converted WebSocket URL:', convertedWsUrl);

      await solanaWebSocketService.connect(convertedWsUrl);
      logger.log('🔗 WebSocket connected successfully');
      if (!mountedRef.current || !streamingRequestedRef.current || operation !== streamOperationRef.current) return;
      if (!await subscribeToStream(operation)) return;

      setIsStreaming(true);
      setStats(prev => ({ ...prev, connectionStatus: 'connected' }));
      logger.log('🎉 Transaction stream started successfully');

    } catch (err) {
      if (!mountedRef.current || !streamingRequestedRef.current || operation !== streamOperationRef.current) {
        logger.log('Ignoring a superseded stream connection failure:', err);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : 'Failed to start streaming';
      console.error('❌ Failed to start streaming:', errorMsg);
      console.error('❌ Full error:', err);
      setError(errorMsg);
      setStats(prev => ({ ...prev, connectionStatus: 'error' }));
    }
  }, [wsUrl, subscribeToStream]);

  const stopStreaming = useCallback(() => {
    streamingRequestedRef.current = false;
    streamOperationRef.current++;
    if (subscriptionIdRef.current) {
      solanaWebSocketService.unsubscribeAll();
      subscriptionIdRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const toggleStreaming = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    } else {
      startStreaming();
    }
  }, [isStreaming, startStreaming, stopStreaming]);

  const fetchLocalSignatures = useCallback(async () => {
    const read = ++readRef.current;
    const generation = generationRef.current;
    try {
      logger.log('🔍 Fetching local signatures from RPC endpoint...');
      
      const requestBody = {
        jsonrpc: '2.0',
        id: 1,
        method: 'surfnet_getLocalSignatures',
        params: []
      };
      
      logger.log('📤 Request body:', requestBody);
      
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      logger.log('📡 Response status:', response.status);
      logger.log('📡 Response ok:', response.ok);

      const data = await response.json();
      logger.log('📥 Local signatures response:', data);

      if (!mountedRef.current || generation !== generationRef.current) return;
      
      if (data.result && data.result.value && Array.isArray(data.result.value)) {
        logger.log('✅ Local signatures received:', data.result.value.length, 'signatures');
        
        // Process each signature using the unified processor
        // Process in reverse order so most recent appear at the top
        for (let i = data.result.value.length - 1; i >= 0; i--) {
          const signatureData = data.result.value[i];
          const signature = signatureData.signature;
          await processTransactionSignature(signature, signatureData.err, read, generation);
        }
      } else {
        logger.log('❌ No local signatures found or invalid response');
      }
    } catch (err) {
      console.error('Error fetching local signatures:', err);
    }
  }, [rpcUrl, processTransactionSignature]);

  const clearTransactions = useCallback(() => {
    generationRef.current++;
    reconcileReadRef.current = ++readRef.current;
    localSnapshotRef.current = null;
    transactionReadsRef.current.clear();
    transactionsRef.current = [];
    setTransactions([]);
    processedSignaturesRef.current.clear();
    setStats(prev => ({
      ...prev,
      totalReceived: 0,
      successful: 0,
      failed: 0,
      lastUpdate: new Date()
    }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (reconcile) clearTransactions();
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      reconcileReadRef.current = ++readRef.current;
      streamOperationRef.current++;
    };
  }, [rpcUrl, wsUrl, reconcile, filterByAccount, filterByProgram, clearTransactions]);

  // A local inventory bounds reads begun before it; later transaction notifications must
  // not be erased by an older inventory reply. Only the newest reconciliation can apply.
  const reconcileWithLocal = useCallback(async () => {
    if (!mountedRef.current) return;
    const read = ++readRef.current;
    reconcileReadRef.current = read;
    const generation = generationRef.current;
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'surfnet_getLocalSignatures', params: [] })
      });
      const data = await response.json();
      if (!mountedRef.current || generation !== generationRef.current || reconcileReadRef.current !== read) return;
      if (!Array.isArray(data.result?.value)) {
        logger.log('Local signature reconciliation returned no inventory:', { rpcUrl, data });
        return;
      }
      const present = new Set<string>(data.result.value.map((entry: any) => entry.signature));
      localSnapshotRef.current = { read, signatures: present };
      const remaining = transactionsRef.current.filter((tx) => {
        const signature = tx.transaction.signatures[0];
        const loaded = transactionReadsRef.current.get(signature);
        return present.has(signature) || (loaded !== undefined && loaded > read);
      });
      if (remaining.length !== transactionsRef.current.length) {
        logger.log('🔄 The surfnet no longer lists some transactions, reloading the list');
        for (const tx of transactionsRef.current) {
          const signature = tx.transaction.signatures[0];
          if (!present.has(signature) && !remaining.includes(tx)) {
            processedSignaturesRef.current.delete(signature);
            transactionReadsRef.current.delete(signature);
          }
        }
        transactionsRef.current = remaining;
        setTransactions(remaining);
        setStats(prev => ({ ...prev, totalReceived: remaining.length,
          successful: remaining.filter(tx => !tx.meta?.err).length,
          failed: remaining.filter(tx => tx.meta?.err).length, lastUpdate: new Date() }));
      }
    } catch (err) {
      logger.log('Local signature reconciliation failed:', err);
    }
  }, [rpcUrl]);

  useEffect(() => {
    let disconnected = false;
    const handleSlot = () => {
      if (reconcile && mountedRef.current) reconcileWithLocal();
    };
    const handleDisconnected = () => {
      disconnected = true;
      if (reconcile) reconcileReadRef.current = ++readRef.current;
      streamOperationRef.current++;
    };
    const handleReconnected = async () => {
      if (!disconnected) return;
      disconnected = false;
      // A restarted surfnet knows none of the earlier subscriptions.
      if (streamingRequestedRef.current) {
        const operation = ++streamOperationRef.current;
        try {
          if (await subscribeToStream(operation)) setError(null);
        } catch (err) {
          console.error('Resubscribing after a reconnect failed:', err);
          if (mountedRef.current && streamingRequestedRef.current && operation === streamOperationRef.current) {
            setError(err instanceof Error ? err.message : 'Failed to resume streaming');
            setStats(prev => ({ ...prev, connectionStatus: 'error' }));
          }
        }
      }
      if (reconcile) reconcileWithLocal();
    };
    solanaWebSocketService.on('slot', handleSlot);
    solanaWebSocketService.on('disconnected', handleDisconnected);
    solanaWebSocketService.on('connected', handleReconnected);
    return () => {
      solanaWebSocketService.off('slot', handleSlot);
      solanaWebSocketService.off('disconnected', handleDisconnected);
      solanaWebSocketService.off('connected', handleReconnected);
    };
  }, [reconcile, reconcileWithLocal, subscribeToStream]);

  // Listen for transaction events
  useEffect(() => {
    const handleTransaction = (data: any) => {
      logger.log('🔌 WebSocket message received:', data);
      
      if (data?.value?.signature) {
        const signature = data.value.signature;
        logger.log('✅ SIGNATURE FOUND:', signature);
        logger.log('📊 Log data:', data.value);
        
        // Use the unified processor
        processTransactionSignature(signature, data.value.err);
      } else {
        logger.log('⚠️ No signature found in log notification');
        logger.log('🔍 Full log data:', data);
      }
    };

    solanaWebSocketService.on('transaction', handleTransaction);

    return () => {
      solanaWebSocketService.off('transaction', handleTransaction);
    };
  }, [processTransactionSignature]);

  // Listen for connection status changes
  useEffect(() => {
    const handleConnected = () => {
      logger.log('🔗 WebSocket connected');
      setStats(prev => ({ ...prev, connectionStatus: 'connected' }));
    };

    const handleDisconnected = () => {
      logger.log('🔌 WebSocket disconnected');
      setStats(prev => ({ ...prev, connectionStatus: 'disconnected' }));
    };

    const handleError = () => {
      console.error('❌ WebSocket error');
      setStats(prev => ({ ...prev, connectionStatus: 'error' }));
    };

    solanaWebSocketService.on('connected', handleConnected);
    solanaWebSocketService.on('disconnected', handleDisconnected);
    solanaWebSocketService.on('error', handleError);

    return () => {
      solanaWebSocketService.off('connected', handleConnected);
      solanaWebSocketService.off('disconnected', handleDisconnected);
      solanaWebSocketService.off('error', handleError);
    };
  }, []);

  // Auto-start streaming
  useEffect(() => {
    if (autoStart) {
      startStreaming();
    }

    // Don't stop streaming on unmount - keep connection alive across page navigation
    // This prevents killing the compact slot widget's subscription
    return () => {
      // stopStreaming();
    };
  }, [autoStart, startStreaming, stopStreaming]);

  // Fetch local signatures when transaction list is empty
  useEffect(() => {
    if (fetchHistorical && transactions.length === 0 && isStreaming && stats.connectionStatus === 'connected') {
      logger.log('📭 Transaction list is empty, fetching local signatures...');
      fetchLocalSignatures();
    }
  }, [fetchHistorical, transactions.length, isStreaming, stats.connectionStatus, fetchLocalSignatures]);

  return {
    transactions,
    isStreaming,
    error,
    stats,
    startStreaming,
    stopStreaming,
    toggleStreaming,
    clearTransactions,
    fetchLocalSignatures
  };
}

// Utility functions
export const formatSignature = (signature: string) => {
  return signature;
};

export const formatTime = (timestamp: number | null) => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleTimeString();
};

export const getTransactionStatus = (tx: TransactionInfo) => {
  if (tx.meta?.err) return 'failed';
  if (tx.meta) return 'success';
  return 'pending';
};

export const getTransactionPrograms = (tx: TransactionInfo): string[] => {
  if (!tx.transaction?.message?.instructions) return [];
  
  return tx.transaction.message.instructions
    .map((instruction: any) => instruction.programId)
    .filter((programId: string, index: number, arr: string[]) => 
      arr.indexOf(programId) === index
    );
}; 

export async function getTokenBalance(address: string, tokenMint: string, rpcUrl: string, commitment:string = "confirmed", programId:string = TOKEN_PROGRAM_ID.toBase58()): Promise<{tokenAmount: TokenAmount | undefined, ata_address: string} | undefined> {
  // request for fetching the ata token balance
  const tokenAccount = await getAssociatedTokenAddressSync(new PublicKey(tokenMint), new PublicKey(address), true, new PublicKey(programId));
  let rpcRequest = {};
  rpcRequest = {
    id: 1,
    jsonrpc: '2.0',
    method: 'getTokenAccountBalance',
    params: [
      tokenAccount.toBase58(),
      {commitment: commitment}
    ] 
  };
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });
    const data = await response.json() as { result?: { value?: TokenAmount } };
    logger.log(data);
    return {tokenAmount: data?.result?.value, ata_address: tokenAccount.toBase58()};
  } catch (error) {
    logger.log(error);
  }
}

export async function getAccountBalance(address: string, rpcUrl: string, commitment:string = "finalized", encoding:string = "jsonParsed"): Promise<number | undefined> {
  let rpcRequest = {};
  rpcRequest = {
    id: 1,
    jsonrpc: '2.0',
    method: 'getAccountInfo',
    params: [address, {commitment: commitment, encoding: encoding}]
  };
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });
    const data = await response.json() as { result?: { value?: AccountInfo } };
    const lamports = data?.result?.value?.lamports; 
    if (lamports) {
      const lamportsNum = Number(lamports);
      const uiAmount = convertTokenAmount(lamportsNum, 9);
      return uiAmount;
    }
  } catch (error) {
    logger.log(error);
    return 0;
  }
}

export async function setAccount(address: string, lamports: number, rpcUrl: string): Promise<any | undefined> {
  let rpcRequest = {};
  rpcRequest = {
    id: 1,
    jsonrpc: '2.0',
    method: 'surfnet_setAccount',
    params: [address, { lamports: lamports }],
  };
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });
    const data = await response.json() as { result?: { value?: any } };
    logger.log(data);
    return data?.result?.value;
  } catch (error) {
    logger.log(error);
  }
}
