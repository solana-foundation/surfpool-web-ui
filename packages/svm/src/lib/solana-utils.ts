import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from '@surfpool/shared';
import { PublicKey } from '@solana/web3.js';
import { convertTokenAmount } from './address-utils';

export interface TokenAmount {
  amount: string | null;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

export interface AccountInfo {
  ata_address: string | null;
  data: any;
  executable: boolean;
  lamports: number;
  owner: string;
  rentEpoch: number;
}

export async function getTokenBalance(
  address: string,
  tokenMint: string,
  rpcUrl: string,
  commitment: string = 'confirmed',
  programId: string = TOKEN_PROGRAM_ID.toBase58()
): Promise<{ tokenAmount: TokenAmount | undefined; ata_address: string } | undefined> {
  // request for fetching the ata token balance
  const tokenAccount = await getAssociatedTokenAddressSync(
    new PublicKey(tokenMint),
    new PublicKey(address),
    true,
    new PublicKey(programId)
  );
  let rpcRequest = {};
  rpcRequest = {
    id: 1,
    jsonrpc: '2.0',
    method: 'getTokenAccountBalance',
    params: [tokenAccount.toBase58(), { commitment: commitment }],
  };
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });
    const data = (await response.json()) as { result?: { value?: TokenAmount } };
    logger.log(data);
    return { tokenAmount: data?.result?.value, ata_address: tokenAccount.toBase58() };
  } catch (error) {
    logger.log(error);
  }
}

export async function getAccountBalance(
  address: string,
  rpcUrl: string,
  commitment: string = 'finalized',
  encoding: string = 'jsonParsed'
): Promise<number | undefined> {
  let rpcRequest = {};
  rpcRequest = {
    id: 1,
    jsonrpc: '2.0',
    method: 'getAccountInfo',
    params: [address, { commitment: commitment, encoding: encoding }],
  };
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });
    const data = (await response.json()) as { result?: { value?: AccountInfo } };
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

export async function setAccount(
  address: string,
  lamports: number,
  rpcUrl: string
): Promise<any | undefined> {
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
    const data = (await response.json()) as { result?: { value?: any } };
    logger.log(data);
    return data?.result?.value;
  } catch (error) {
    logger.log(error);
  }
}
