import { useEffect, useState, useRef, useCallback } from 'react';
import { logger } from '@surfpool/shared';
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
    fetchHistorical = true
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
  const processedSignaturesRef = useRef<Set<string>>(new Set());

  const processTransactionSignature = useCallback(async (signature: string, err?: any) => {
    // Check if we've already processed this signature
    if (processedSignaturesRef.current.has(signature)) {
      logger.log('🔄 Signature already processed, skipping:', signature);
      return;
    }
    
    // Mark signature as processed
    processedSignaturesRef.current.add(signature);
    // Fetch full transaction details
    logger.log('🔄 Fetching transaction details for signature:', signature);
    await fetchTransactionDetails(signature);
  }, []);

  const fetchTransactionDetails = useCallback(async (signature: string) => {
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
            return;
          }
        }
        
        logger.log('📊 Adding transaction to state...');
        setTransactions(prev => {
          const newTransactions = [txInfo, ...prev].slice(0, maxTransactions);
          logger.log('📈 Transaction added! Total transactions now:', newTransactions.length);
          return newTransactions;
        });

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
      } else {
        logger.log('❌ No transaction result in response');
      }
    } catch (err) {
      console.error('Error fetching transaction details:', err);
    }
  }, [rpcUrl, filterByProgram, maxTransactions]);

  const startStreaming = useCallback(async () => {
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

      // Subscribe to transactions
      const filter = filterByAccount ? { account: filterByAccount } :
                    filterByProgram ? { program: filterByProgram } : undefined;

      logger.log('📡 Subscribing to transactions with filter:', filter);
      subscriptionIdRef.current = await solanaWebSocketService.subscribeToTransactions(filter);
      logger.log('✅ Transaction subscription confirmed, ID:', subscriptionIdRef.current);

      setIsStreaming(true);
      setStats(prev => ({ ...prev, connectionStatus: 'connected' }));
      logger.log('🎉 Transaction stream started successfully');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start streaming';
      console.error('❌ Failed to start streaming:', errorMsg);
      console.error('❌ Full error:', err);
      setError(errorMsg);
      setStats(prev => ({ ...prev, connectionStatus: 'error' }));
    }
  }, [wsUrl, filterByAccount, filterByProgram]);

  const stopStreaming = useCallback(() => {
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
      
      if (data.result && data.result.value && Array.isArray(data.result.value)) {
        logger.log('✅ Local signatures received:', data.result.value.length, 'signatures');
        
        // Process each signature using the unified processor
        // Process in reverse order so most recent appear at the top
        for (let i = data.result.value.length - 1; i >= 0; i--) {
          const signatureData = data.result.value[i];
          const signature = signatureData.signature;
          await processTransactionSignature(signature, signatureData.err);
        }
      } else {
        logger.log('❌ No local signatures found or invalid response');
      }
    } catch (err) {
      console.error('Error fetching local signatures:', err);
    }
  }, [rpcUrl, fetchTransactionDetails]);

  const clearTransactions = useCallback(() => {
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

