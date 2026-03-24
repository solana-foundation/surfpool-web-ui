'use client';

import { convertToRawAmount, truncateAddress as truncateAddressUtil } from './lib/address-utils';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon, PlusIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { generateKeyPair, lamports } from '@solana/kit';
import confetti from 'canvas-confetti';
import { useEffect, useState } from 'react';
import { brandBlue, Dialog, DialogDescription, DialogTitle } from '@surfpool/ui';
import { Field, Label } from '@surfpool/ui';
import { getAddressExplorerUrl, logger } from '@surfpool/shared';
import AddressDisplay from './address-display';
import TokenAmountDisplay from './token-amount-display';
import { getAccountBalance, getTokenBalance, setAccount } from './lib/solana-utils';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const LAMPORTS_PER_SOL = 1000000000;

export type Network = {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  rpc_url: string;
  datasource_rpc_url: string;
};

interface Token {
  ticker: string;
  imageUrl: string;
  address?: string;
  name: string;
  decimals: number;
  programId?: string;
}

interface TokenRequest {
  token: Token;
  amount: number;
}

interface SetAccountRequest {
  address: string;
  lamports: number;
}

const DEFAULT_LAMPORTS_TO_FUND = LAMPORTS_PER_SOL; // 1 SOL

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const WSOL_TOKEN: Token = {
  ticker: 'WSOL',
  name: 'Wrapped SOL',
  imageUrl: 'https://img-v1.raydium.io/icon/So11111111111111111111111111111111111111112.png',
  address: WSOL_MINT,
  decimals: 9,
  programId: TOKEN_PROGRAM_ID.toBase58(),
};

interface FaucetProps {
  rpcUrl: string;
  primaryColor?: string;
  explorerClusterQuery?: string;
  /** Controls inner layer overlay: 'dark' uses black with opacity, 'light' uses white with opacity */
  innerOverlay?: 'dark' | 'light';
}

export default function Faucet({ rpcUrl, primaryColor = '#8B5CF6', explorerClusterQuery, innerOverlay = 'dark' }: FaucetProps) {
  const defaultFundingRequest = {
    token: {
      ticker: 'SOL',
      imageUrl: 'https://img-v1.raydium.io/icon/So11111111111111111111111111111111111111112.png',
      address: undefined,
      decimals: 9,
      name: 'Solana',
    },
    amount: 0,
  };
  const [tokenDialogOpen, setTokenDialogOpen] = useState(0);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [tokenShortcuts, setTokenShortcuts] = useState<Token[]>([]);
  const [tokenMatches, setTokenMatches] = useState<Token[]>([]);
  const [claimedTokens, setClaimedTokens] = useState(0);
  const [tokenFundingRequests, setTokenFundingRequest] = useState<TokenRequest[]>([defaultFundingRequest]);
  const [inputValues, setInputValues] = useState<string[]>(['']);
  const [processedTokens, setProcessedTokens] = useState<TokenRequest[]>([]);
  const [processedRecipients, setProcessedRecipients] = useState<{ address: string | undefined; isGenerated: boolean; privateKey?: number[] }[]>([]);
  const [processedTokenBalances, setProcessedTokenBalances] = useState<Map<string, { token: Token; finalBalance: number; ataAddress?: string }[]>>(new Map());
  const [reccipients, setReccipients] = useState<
    {
      address: string | undefined;
      isGenerated: boolean;
      privateKey?: number[];
    }[]
  >([
    {
      address: '',
      isGenerated: false,
    },
  ]);
  const [tokenSearch, setTokenSearch] = useState('');
  const [animatingRecipient, setAnimatingRecipient] = useState<number | null>(null);
  const [revealedChars, setRevealedChars] = useState(0);
  const [displayAddress, setDisplayAddress] = useState<string>('');

  const [tokens, setTokens] = useState<any[]>([]);

  const [networkStatuses, setNetworkStatuses] = useState<Record<string, boolean>>({});
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  // Detect mobile device on mount
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      setIsMobileDevice(isMobile);
    };
    checkMobile();
  }, []);

  // Helper functions for AddressDisplay
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  };

  const truncateAddress = truncateAddressUtil;

  async function fetchData() {
    // Fetch tokens from Jupiter API only once
    if (tokens.length === 0) {
      try {
        const response = await fetch('https://lite-api.jup.ag/tokens/v2/tag?query=verified');
        const data = await response.json();

        // console.log(`data: ${JSON.stringify(data)}`)
        let usdc = filterTokensByTicker('USDC', data, true);
        let usdt = filterTokensByTicker('USDT', data, true);
        let ray = filterTokensByTicker('RAY', data, true);
        let jup = filterTokensByTicker('JUP', data, true);

        // Log the raw data first to debug
        logger.log('Raw token data:', data);

        // Log each token search result
        logger.log('USDC tokens:', usdc);
        logger.log('USDT tokens:', usdt);
        logger.log('RAY tokens:', ray);
        logger.log('JUP tokens:', jup);

        // Log the filter function parameters for debugging
        logger.log('Filter function called with:', {
          ticker: 'USDC',
          tokensLength: data.length,
          first: true,
        });
        setTokens(data);
        setTokenShortcuts([usdc[0], usdt[0], WSOL_TOKEN, jup[0]].filter(Boolean));
      } catch (error) {
        console.error('Error fetching tokens:', error);
      }
    }
  }

  const handleTokenSearch = async (value: string) => {
    setTokenSearch(value);
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      setTokenMatches([]);
      return;
    }

    // Check if input is a valid Solana address (direct mint input)
    if (isValidSolanaAddress(trimmedValue)) {
      const mintToken = await fetchMintMetadata(trimmedValue);
      if (mintToken) {
        setTokenMatches([mintToken]);
      } else {
        setTokenMatches([]);
      }
    } else {
      // Ticker search - existing logic
      let matches = filterTokensByTicker(trimmedValue, tokens, false);

      // Prioritize WSOL if searching for it
      if (trimmedValue.toLowerCase() === 'wsol') {
        matches = [WSOL_TOKEN, ...matches.filter((t) => t.address !== WSOL_MINT)];
      }

      setTokenMatches(matches);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filterTokensByTicker = (ticker: string, remoteTokens: any[], first: boolean): Token[] => {
    if (!ticker || !remoteTokens) return [];
    const filteredTokens: Token[] = [];
    const normalizedTicker = ticker.toLowerCase().trim();
    for (const entry of remoteTokens) {
      if (entry.symbol.toLowerCase() === normalizedTicker) {
        const token = {
          name: entry.name,
          ticker: entry.symbol,
          imageUrl: entry.icon,
          address: entry.id,
          decimals: entry.decimals,
        };
        if (first == true) {
          return [token];
        } else {
          filteredTokens.push(token);
        }
      }
    }
    return filteredTokens;
  };

  const isValidSolanaAddress = (input: string): boolean => {
    if (!input || input.length < 32 || input.length > 44) return false;
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(input);
  };

  const detectTokenProgram = async (mintAddress: string): Promise<string> => {
    const rpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'getAccountInfo',
      params: [mintAddress, { encoding: 'base64', commitment: 'confirmed' }],
    };
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcRequest),
      });
      const data = await response.json();
      const owner = data?.result?.value?.owner;
      if (owner === TOKEN_2022_PROGRAM_ID.toBase58()) {
        return TOKEN_2022_PROGRAM_ID.toBase58();
      }
    } catch (error) {
      console.error('Error detecting token program:', error);
    }
    return TOKEN_PROGRAM_ID.toBase58();
  };

  const fetchMintMetadata = async (mintAddress: string): Promise<Token | null> => {
    const rpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'getAccountInfo',
      params: [mintAddress, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    };
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcRequest),
      });
      const data = await response.json();
      const accountInfo = data?.result?.value;
      if (!accountInfo) return null;

      const programId = accountInfo.owner;
      const parsedInfo = accountInfo.data?.parsed?.info;
      const decimals = parsedInfo?.decimals ?? 9;

      return {
        ticker: truncateAddress(mintAddress),
        name: 'Unknown Token',
        imageUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        address: mintAddress,
        decimals,
        programId,
      };
    } catch (error) {
      console.error('Error fetching mint metadata:', error);
      return null;
    }
  };

  const resetToInitialState = () => {
    setTokenFundingRequest([defaultFundingRequest]);
    setInputValues(['']);
    setReccipients([{ address: '', isGenerated: false }]);
  };

  const handleClaimTokens = async () => {
    // Store the tokens and recipients that were processed before resetting
    setProcessedTokens([...tokenFundingRequests]);

    // Reset processed recipients for this new airdrop
    const currentAirdropRecipients: { address: string | undefined; isGenerated: boolean; privateKey?: number[] }[] = [];
    const recipientMap = new Map<string, { address: string | undefined; isGenerated: boolean; privateKey?: number[] }>();
    const tokenBalancesMap = new Map<string, { token: Token; finalBalance: number; ataAddress?: string }[]>();

    // Simulate claiming tokens
    setClaimedTokens(claimedTokens + 10);

    // Confetti rain from the top
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 90,
        spread: 120,
        origin: { x: Math.random(), y: -0.1 },
        gravity: 1.2,
        drift: 0,
        ticks: 300,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    for (const tokenFundingRequest of tokenFundingRequests) {
      for (const recipient of reccipients) {
        logger.log(
          `Sending ${tokenFundingRequest.amount} ${tokenFundingRequest.token.ticker} to ${recipient.address}`
        );
        logger.log(``);

        const is_spl_token: boolean = tokenFundingRequest.token.ticker != 'SOL';

        const accountBalance = await getAccountBalance(recipient.address || '', rpcUrl);  // if > 0, the account already exists else account not exists
        if (!accountBalance && is_spl_token) {
          try {
            const response = await setAccount(recipient.address || '', DEFAULT_LAMPORTS_TO_FUND, rpcUrl);
            logger.log('SetAccountRequest response:', response);
          } catch (error) {
            console.error('Error in RPC request:', error);
          }
        }
        let rpcRequest: any = {};
        // now that the account exists lets see if we need to fund it with spl-tokens or lamports
        if (tokenFundingRequest.token.address && is_spl_token){
          const spl_token_program = tokenFundingRequest.token.programId || TOKEN_PROGRAM_ID.toBase58();
          const tokenAcountInfo = await getTokenBalance(
            recipient.address || '',
            tokenFundingRequest.token.address || '',
            rpcUrl,
            'confirmed',
            spl_token_program
          );
          const balanceUiAmount = Number(tokenAcountInfo?.tokenAmount?.uiAmount) || 0;
          const fundingAmount = Number(tokenFundingRequest.amount) || 0;
          const totalUiAmount = balanceUiAmount + fundingAmount;
          const ata_address = tokenAcountInfo?.ata_address;
          rpcRequest = {
            id: 1,
            jsonrpc: '2.0',
            method: 'surfnet_setTokenAccount',
            params: [
              recipient.address,
              tokenFundingRequest.token.address,
              { amount: convertToRawAmount(totalUiAmount, tokenFundingRequest.token.decimals) },
              spl_token_program
            ],
          };
          // Store final balance for this token and recipient (including per-token ATA)
          if (recipient.address) {
            const existingBalances = tokenBalancesMap.get(recipient.address) || [];
            existingBalances.push({ token: tokenFundingRequest.token, finalBalance: totalUiAmount, ataAddress: ata_address });
            tokenBalancesMap.set(recipient.address, existingBalances);

            // Use map to deduplicate recipients by address
            const existing = recipientMap.get(recipient.address);
            if (!existing) {
              recipientMap.set(recipient.address, {address: recipient.address, isGenerated: recipient.isGenerated, privateKey: recipient.privateKey});
            }
          }
        } else {
          const balanceUiAmount = Number(accountBalance) || 0;
          const fundingAmount = Number(tokenFundingRequest.amount) || 0;
          const totalUiAmount = balanceUiAmount + fundingAmount;
          rpcRequest = {
            id: 1,
            jsonrpc: '2.0',
            method: 'surfnet_setAccount',
            params: [
              recipient.address,
              { lamports: convertToRawAmount(totalUiAmount, 9) },
            ],
          };
          // Store final balance for this token and recipient
          if (recipient.address) {
            const existingBalances = tokenBalancesMap.get(recipient.address) || [];
            existingBalances.push({ token: tokenFundingRequest.token, finalBalance: totalUiAmount });
            tokenBalancesMap.set(recipient.address, existingBalances);

            // Use map to deduplicate recipients by address
            const existing = recipientMap.get(recipient.address);
            if (!existing) {
              recipientMap.set(recipient.address, {address: recipient.address, isGenerated: recipient.isGenerated, privateKey: recipient.privateKey});
            }
          }
        }
        try {
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(rpcRequest),
          });
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          const data = await response.json();
        } catch (error) {
          console.error('Error in RPC request:', error);
        }
      }
    }

    // Convert map back to array
    const uniqueRecipients = Array.from(recipientMap.values());
    setProcessedRecipients(uniqueRecipients);
    setProcessedTokenBalances(tokenBalancesMap);
    setSuccessDialogOpen(true);
    resetToInitialState();
  };

  const handleAddFundingRequest = () => {
    setTokenFundingRequest([...tokenFundingRequests, defaultFundingRequest]);
    setInputValues([...inputValues, '']);
  };

  const handleAddAddress = () => {
    setReccipients([...reccipients, { address: undefined, isGenerated: false }]);
  };

  const generateKeypair = async (index: number) => {
    // Generate a random 32-byte seed for the private key
    const privateKeySeed = new Uint8Array(32);
    crypto.getRandomValues(privateKeySeed);

    // Generate the keypair using Ed25519 with extractable keys
    const keypair = await crypto.subtle.generateKey(
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519',
      } as any,
      true, // extractable = true
      ['sign', 'verify']
    );

    // Export the public key
    const publicKeyBuffer = await crypto.subtle.exportKey('raw', keypair.publicKey);
    const publicKeyArray = new Uint8Array(publicKeyBuffer);

    // Export the private key
    const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);
    const privateKeyView = new Uint8Array(privateKeyBuffer);

    // Extract the 32-byte private key from the PKCS8 format
    // PKCS8 format for Ed25519 has the 32-byte private key at offset 16
    const privateKeyBytes = privateKeyView.slice(16, 48);

    // Solana keypair format: [private_key (32 bytes) + public_key (32 bytes)]
    const fullKeypair = new Uint8Array(64);
    fullKeypair.set(privateKeyBytes, 0);
    fullKeypair.set(publicKeyArray, 32);

    // Convert public key to base58
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt(0);
    for (let i = 0; i < publicKeyArray.length; i++) {
      num = num * BigInt(256) + BigInt(publicKeyArray[i]);
    }

    let result = '';
    while (num > 0) {
      result = base58Chars[Number(num % BigInt(58))] + result;
      num = num / BigInt(58);
    }

    // Add leading zeros
    for (let i = 0; i < publicKeyArray.length && publicKeyArray[i] === 0; i++) {
      result = '1' + result;
    }

    const newRecipients = [...reccipients];
    newRecipients[index].isGenerated = true;
    newRecipients[index].privateKey = Array.from(fullKeypair);

    const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const finalAddress = result;
    const addressLength = finalAddress.length;

    // Initialize with random characters immediately to prevent layout shift
    const initialRandom = Array.from({ length: addressLength }, () =>
      base58Alphabet[Math.floor(Math.random() * base58Alphabet.length)]
    ).join('');

    // Start bruteforce animation
    setAnimatingRecipient(index);
    setRevealedChars(0);
    setDisplayAddress(initialRandom);

    let currentChar = 0;

    // Bruteforce effect: reveal characters one by one with random chars cycling before settling
    const revealInterval = setInterval(() => {
      if (currentChar >= addressLength) {
        clearInterval(revealInterval);
        newRecipients[index].address = finalAddress;
        setReccipients([...newRecipients]);
        setAnimatingRecipient(null);
        setDisplayAddress('');
        return;
      }

      // Build the display string: revealed chars + current cycling char + remaining random chars
      const revealed = finalAddress.slice(0, currentChar);
      const remaining = Array.from({ length: addressLength - currentChar - 1 }, () =>
        base58Alphabet[Math.floor(Math.random() * base58Alphabet.length)]
      ).join('');

      // Cycle through a few random chars before settling on the real one
      const cycleCount = Math.floor(Math.random() * 3) + 2;
      let cycle = 0;

      const cycleInterval = setInterval(() => {
        if (cycle >= cycleCount) {
          clearInterval(cycleInterval);
          setDisplayAddress(revealed + finalAddress[currentChar] + remaining.slice(0, -1 || undefined));
          currentChar++;
          setRevealedChars(currentChar);
          return;
        }

        const randomChar = base58Alphabet[Math.floor(Math.random() * base58Alphabet.length)];
        setDisplayAddress(revealed + randomChar + remaining);
        cycle++;
      }, 15);
    }, 25);

    // Safety cleanup
    setTimeout(() => {
      clearInterval(revealInterval);
      newRecipients[index].address = finalAddress;
      setReccipients([...newRecipients]);
      setAnimatingRecipient(null);
      setDisplayAddress('');
    }, 3000);
  };

  const handleTokenFundingRequestChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = e.target.value;

    // Update the input display value
    const newInputValues = [...inputValues];
    newInputValues[index] = value;
    setInputValues(newInputValues);

    // Update the actual amount if it's a valid number
    const newTokenFundingRequests = [...tokenFundingRequests];
    if (value === '') {
      newTokenFundingRequests[index].amount = 0;
    } else {
      const parsedValue = parseFloat(value);
      if (!isNaN(parsedValue)) {
        newTokenFundingRequests[index].amount = parsedValue;
      }
    }

    setTokenFundingRequest(newTokenFundingRequests);
  };

  // Check if the faucet can be activated (has amount and address)
  const canActivateFaucet = () => {
    // Check if any token has a valid amount
    const hasValidAmount = tokenFundingRequests.some((request) => request.amount > 0);

    // Check if any recipient has a valid address
    const hasValidAddress = reccipients.some((recipient) => recipient.address && recipient.address.trim() !== '');

    return hasValidAmount && hasValidAddress;
  };

  // Helper function to darken a color
  const darkenColor = (color: string, amount: number = 0.3) => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Darken
    const newR = Math.round(r * (1 - amount));
    const newG = Math.round(g * (1 - amount));
    const newB = Math.round(b * (1 - amount));

    return `rgb(${newR}, ${newG}, ${newB})`;
  };

  // Helper function to lighten a color (for light overlay mode)
  const lightenColor = (color: string, amount: number = 0.3) => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Lighten (blend with white)
    const newR = Math.round(r + (255 - r) * amount);
    const newG = Math.round(g + (255 - g) * amount);
    const newB = Math.round(b + (255 - b) * amount);

    return `rgb(${newR}, ${newG}, ${newB})`;
  };

  // Get overlay color based on mode
  const getOverlayColor = (amount: number = 0.3) => {
    return innerOverlay === 'light' ? lightenColor(primaryColor, amount) : darkenColor(primaryColor, amount);
  };

  const darkerColor = getOverlayColor(0.3);

  return (
    <div
      className="faucet relative z-10 mx-auto mt-3 flex min-h-[340px] w-full items-center justify-center rounded-xl pb-5 shadow-lg md:mt-0"
      style={{
        backgroundColor: primaryColor
      }}
    >
      <div className="flex w-full flex-col items-center space-y-2 pt-1">
        {/* Box 1: Tokens needed */}
        <Field className="w-full pl-4 uppercase">
          <Label className="text-sm sm:text-sm md:text-sm lg:text-sm">Faucet</Label>
        </Field>

        {tokenFundingRequests.map((tokenFundingRequest, index) => (
          <div key={index} className="flex w-full flex-col items-center pr-4 pl-4">
            <Field className="w-full rounded-xl p-4" style={{ backgroundColor: darkerColor }}>
              <div className="flex items-center space-x-2">
                <input
                  id={`amount-${index}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={inputValues[index] || ''}
                  className="w-full border-none bg-transparent text-left !text-4xl focus:outline-none sm:text-4xl md:text-4xl lg:text-4xl"
                  onChange={(e) => handleTokenFundingRequestChange(e, index)}
                />
                <div
                  className="flex cursor-pointer items-center gap-2 rounded-full pl-3 pr-4 py-2 uppercase transition-colors hover:brightness-90 sm:text-xl md:text-xl lg:text-xl"
                  style={{ backgroundColor: getOverlayColor(0.5) }}
                  onClick={() => setTokenDialogOpen(index + 1)}
                >
                  <img
                    src={tokenFundingRequest.token.imageUrl}
                    alt={tokenFundingRequest.token.ticker}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <span>{tokenFundingRequest.token.ticker}</span>
                  <ChevronDownIcon className="h-5 w-5" />
                </div>
              </div>
            </Field>
          </div>
        ))}

        <div
          className="-mt-6 flex h-12 w-12 sm:h-10 sm:w-10 cursor-pointer items-center justify-center rounded-xl border-2 uppercase"
          style={{ borderColor: primaryColor, backgroundColor: innerOverlay === 'light' ? '#ffffff' : '#09090b' }}
          onClick={() => handleAddFundingRequest()}
        >
          <PlusIcon className={`h-6 w-6 sm:h-5 sm:w-5 ${innerOverlay === 'light' ? 'text-zinc-900' : 'text-white'}`} />
        </div>

        <Field className="w-full pt-4 pl-4 uppercase">
          <Label className="sm:text-sm md:text-sm lg:text-sm">Recipients</Label>
        </Field>

        <div className="mb-6 w-full">
          {reccipients.map((reccipient, index) => (
            <div key={index} className="flex w-full flex-col items-center pt-1 pr-4 pl-4">
              <Field className="w-full rounded-xl p-4 pt-5 pb-5 overflow-hidden" style={{ backgroundColor: darkerColor }}>
                <div className="flex w-full items-center gap-2">
                  <div className="relative flex-1 overflow-hidden" style={{ minWidth: 0 }}>
                    {animatingRecipient === index ? (
                      <div
                        className="w-full text-left sm:text-[12px] md:text-[12px] lg:text-[12px]"
                        style={{
                          fontFamily: 'monospace',
                          letterSpacing: '0.05em',
                          whiteSpace: 'nowrap',
                          height: '24px',
                          lineHeight: '24px',
                          overflow: 'hidden',
                          textOverflow: 'clip',
                        }}
                      >
                        <span style={{ color: brandBlue }}>
                          {displayAddress.slice(0, revealedChars)}
                        </span>
                        <span style={{ color: '#9ca3af', opacity: 0.7 }}>
                          {displayAddress.slice(revealedChars)}
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="ABAq2R9gSpDDGguQxBk4u13s4ZYW6zbwKVBx15mCMG8"
                        className="w-full border-none bg-transparent text-left focus:outline-none sm:text-[12px] md:text-[12px] lg:text-[12px]"
                        style={{
                          fontFamily: 'monospace',
                          letterSpacing: '0.05em',
                          height: '24px',
                          lineHeight: '24px',
                          overflow: 'hidden',
                        }}
                        value={reccipient.address}
                        onChange={(e) => {
                          const newRecipients = [...reccipients];
                          newRecipients[index].address = e.target.value;
                          setReccipients(newRecipients);
                        }}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => generateKeypair(index)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:brightness-90"
                    style={{ backgroundColor: getOverlayColor(0.5) }}
                    title="Generate new keypair"
                  >
                    <SparklesIcon className={`h-4 w-4 ${innerOverlay === 'light' ? 'text-zinc-900' : 'text-white'}`} />
                  </button>
                </div>
              </Field>
            </div>
          ))}

          <div
            className="absolute left-1/2 z-10 -mt-4 flex h-12 w-12 sm:h-10 sm:w-10 -translate-x-1/2 transform cursor-pointer items-center justify-center rounded-xl border-2 uppercase"
            style={{ borderColor: primaryColor, backgroundColor: innerOverlay === 'light' ? '#ffffff' : '#09090b' }}
            onClick={() => handleAddAddress()}
          >
            <PlusIcon className={`h-6 w-6 sm:h-5 sm:w-5 ${innerOverlay === 'light' ? 'text-zinc-900' : 'text-white'}`} />
          </div>
        </div>

        <div className="absolute right-8 bottom-0 translate-y-1/2 transform">
          <div
            className={`flex gap-2 rounded-full p-5 text-center text-sm uppercase transition-all ${
              canActivateFaucet() ? 'cursor-pointer' : 'cursor-not-allowed'
            }`}
            style={canActivateFaucet() ? {
              backgroundColor: brandBlue,
              border: `1px solid ${brandBlue}`
            } : {
              backgroundColor: '#52525b'
            }}
            onClick={() => {
              if (canActivateFaucet()) {
                handleClaimTokens();
              }
            }}
            onMouseEnter={(e) => {
              if (canActivateFaucet()) {
                e.currentTarget.style.filter = 'brightness(1.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (canActivateFaucet()) {
                e.currentTarget.style.filter = 'brightness(1)';
              }
            }}
          >
            <PaperAirplaneIcon className={`h-6 w-6 ${canActivateFaucet() ? 'text-black' : 'text-white'}`} />
          </div>
          {/* <div className="flex h-full w-36 items-center justify-center gap-2 rounded-lg bg-zinc-700 p-2 text-center text-sm uppercase">
              Get Config
            </div> */}
        </div>
      </div>

      <Dialog open={tokenDialogOpen > 0} onClose={() => setTokenDialogOpen(0)} size="xl">
        <DialogDescription>{''}</DialogDescription>
        <input
          type="text"
          placeholder="Search ticker or paste mint address"
          className="w-full border-none bg-transparent text-left text-xl focus:outline-none"
          onChange={(e) => handleTokenSearch(e.target.value)}
          ref={(input) => {
            if (tokenDialogOpen > 0 && input) {
              input.focus();
            }
          }}
        />
        <div className="mt-4 grid grid-cols-4 gap-4">
          {tokenShortcuts.map((tokenShortcut, index) => (
            <div
              key={index}
              className="flex cursor-pointer flex-col items-center rounded-xl bg-zinc-800 p-4 transition-colors"
              onClick={async () => {
                const selectedToken = { ...tokenShortcut };
                // Detect program ID if not already set and token has an address
                if (!selectedToken.programId && selectedToken.address) {
                  selectedToken.programId = await detectTokenProgram(selectedToken.address);
                }
                const newTokenFundingRequests = [...tokenFundingRequests];
                newTokenFundingRequests[tokenDialogOpen - 1].token = selectedToken;
                setTokenFundingRequest(newTokenFundingRequests);
                setTokenDialogOpen(0); // Close the dialog after selection
              }}
            >
              <img src={tokenShortcut.imageUrl} alt={tokenShortcut.ticker} className="mb-2 h-8 w-8" />
              <div className="text-center text-sm font-bold">{tokenShortcut.ticker}</div>
            </div>
          ))}
        </div>
        <div className="mt-8">
          {tokenMatches.map((tokenMatch, index) => (
            <div
              key={index}
              className="flex cursor-pointer flex-row items-center gap-6 rounded-xl border-2 border-zinc-700 p-4 transition-colors"
              onClick={async () => {
                const selectedToken = { ...tokenMatch };
                // Detect program ID if not already set and token has an address
                if (!selectedToken.programId && selectedToken.address) {
                  selectedToken.programId = await detectTokenProgram(selectedToken.address);
                }
                const newTokenFundingRequests = [...tokenFundingRequests];
                newTokenFundingRequests[tokenDialogOpen - 1].token = selectedToken;
                setTokenFundingRequest(newTokenFundingRequests);
                setTokenMatches([]);
                setTokenSearch('');
                setTokenDialogOpen(0);
              }}
            >
              <img
                src={tokenMatch.imageUrl}
                alt={tokenMatch.ticker}
                className="mb-2 h-12 w-12 rounded-full bg-transparent"
              />
              <div className="text-center text-lg font-bold">{tokenMatch.ticker}</div>
            </div>
          ))}
        </div>
      </Dialog>
      <Dialog open={successDialogOpen} onClose={() => setSuccessDialogOpen(false)} size="3xl">
        <DialogTitle>Token Accounts Updated</DialogTitle>
        <DialogDescription>{''}</DialogDescription>
        <div className="space-y-6 -mx-2 sm:mx-0">
          {processedRecipients.map((recipient, recipientIndex) => {
            // Get all tokens sent to this recipient
            const tokensForRecipient = processedTokens.map((fundingRequest, tokenIndex) => ({
              ...fundingRequest,
              tokenIndex,
              recipientIndex,
            })).filter((fundingRequest) => fundingRequest.amount > 0);

            // Check if this address was generated using our keypair generator
            const isGeneratedAddress = recipient.isGenerated;

            return (
              <div key={recipientIndex} className="rounded-lg bg-zinc-800/50 p-3 sm:p-4">
                <div className="mb-4">
                  <div className="text-base sm:text-sm font-medium text-zinc-400 mb-2">Wallet Address:</div>
                  {recipient.address ? (
                    <AddressDisplay
                      address={recipient.address}
                      copiedStates={copiedStates}
                      copyToClipboard={copyToClipboard}
                      truncateAddress={truncateAddress}
                      copyId={`success-wallet-${recipientIndex}`}
                      showCopyButton={true}
                      aggressiveTruncate={false}
                      rpcUrl={rpcUrl}
                    />
                  ) : (
                    <div className="text-zinc-500">No address</div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="text-base sm:text-sm font-medium text-zinc-400 mb-2">Updated Balances:</div>
                  {(() => {
                    const tokenBalances = processedTokenBalances.get(recipient.address || '') || [];
                    return tokenBalances.map((tokenBalance, index) => (
                      <div key={`${tokenBalance.token.ticker}-${index}`} className="flex items-center gap-3 rounded-lg bg-zinc-700/50 p-3">
                        <img
                          src={tokenBalance.token.imageUrl}
                          alt={tokenBalance.token.ticker}
                          className="h-8 w-8 sm:h-6 sm:w-6 rounded-full flex-shrink-0"
                        />
                        <div className="flex flex-1 flex-col min-w-0">
                          <div className="font-medium text-base sm:text-sm">{tokenBalance.token.ticker}</div>
                          {/* Show ATA address first for SPL tokens if available */}
                          {tokenBalance.token.ticker !== 'SOL' && tokenBalance.ataAddress && (
                            <div className="text-sm sm:text-xs text-zinc-400">
                              <span className="text-zinc-500">Associated Token Address (ATA):</span>
                              <AddressDisplay
                                address={tokenBalance.ataAddress}
                                copiedStates={copiedStates}
                                copyToClipboard={copyToClipboard}
                                truncateAddress={truncateAddress}
                                copyId={`ata-${index}-${recipientIndex}`}
                                showCopyButton={true}
                                aggressiveTruncate={false}
                                rpcUrl={rpcUrl}
                              />
                            </div>
                          )}
                          {/* Show token mint address for SPL tokens */}
                          {tokenBalance.token.address && tokenBalance.token.address.trim() !== '' && (
                            <div className="text-sm sm:text-xs text-zinc-400 mt-1">
                              <span className="text-zinc-500">Token Address:</span>
                              <AddressDisplay
                                address={tokenBalance.token.address}
                                copiedStates={copiedStates}
                                copyToClipboard={copyToClipboard}
                                truncateAddress={truncateAddress}
                                copyId={`token-${index}-${recipientIndex}`}
                                showCopyButton={true}
                                aggressiveTruncate={false}
                                rpcUrl={rpcUrl}
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-base sm:text-sm font-bold text-zinc-300 flex-shrink-0">
                          <TokenAmountDisplay
                            amount={convertToRawAmount(tokenBalance.finalBalance, tokenBalance.token.decimals)}
                            decimals={tokenBalance.token.decimals}
                            symbol={tokenBalance.token.ticker}
                            variant="default"
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {isGeneratedAddress && recipient.privateKey && (
                  <div className="mt-4 pt-4 border-t border-zinc-700 flex gap-3">
                    <button
                      onClick={async () => {
                        const keypairData = recipient.privateKey;
                        const jsonContent = JSON.stringify(keypairData);
                        const fileName = `${recipient.address}.json`;

                        // On mobile, try native share API (iOS/Android)
                        if (isMobileDevice && navigator.share && navigator.canShare) {
                          const file = new File([jsonContent], fileName, { type: 'application/json' });
                          if (navigator.canShare({ files: [file] })) {
                            try {
                              await navigator.share({
                                files: [file],
                                title: 'Solana Keypair',
                                text: `Keypair for ${recipient.address}`,
                              });
                            } catch (err) {
                              // User cancelled or share failed - don't fall through to download
                            }
                            return;
                          }
                        }

                        // Download on desktop or when share API not available
                        const blob = new Blob([jsonContent], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-4 sm:py-3 text-base sm:text-sm font-semibold text-white transition-colors"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {isMobileDevice ? (
                        <>
                          <svg className="h-5 w-5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                          Share Keypair
                        </>
                      ) : (
                        <>
                          <svg className="h-5 w-5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download Keypair
                        </>
                      )}
                    </button>
                    {!isMobileDevice && (
                      <button
                        onClick={() => {
                          const explorerUrl = explorerClusterQuery
                            ? `https://explorer.solana.com/address/${recipient.address}?${new URLSearchParams(explorerClusterQuery.split('&').reduce((acc, pair) => {
                                const [key, value] = pair.split('=');
                                if (key && value !== undefined) acc[key] = value;
                                return acc;
                              }, {} as Record<string, string>)).toString()}`
                            : getAddressExplorerUrl(recipient.address || '', rpcUrl);
                          window.open(explorerUrl, '_blank');
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open in Explorer
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
