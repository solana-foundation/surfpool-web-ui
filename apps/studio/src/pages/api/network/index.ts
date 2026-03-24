import type { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '@surfpool/shared';

export type NetworksResponseData = {
  networks: Network[];
};

export type Network = {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  rpc_url: string;
  datasource_rpc_url: string;
};

export type NetworkStatus = {
  online: boolean;
  status: string;
};

export default async function handler(_req: NextApiRequest, res: NextApiResponse<NetworksResponseData>) {
  logger.log('here');
  // Get data from your database
  res.status(200).json({ networks: [] });
}

export function isNetworkInitializing(network: Network): boolean {
  if (network.status == 'Pending') {
    return true;
  }
  return false;
}

export const getNetworks = (workspaceUuid: String) => `
query {
  svm_networks(where: {workspace_id: {_eq: "${workspaceUuid}"}}) {
    id
    name
    created_at
    description
    status
    rpc_url
    datasource_rpc_url
    block_production_mode
  }
}
`;

export const fetchRpc = async (network: Network, method: string) => {
  try {
    const res = await fetch(`${network.rpc_url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: network.rpc_url,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
      }),
    });
    const json = await res.json();
    return json;
  } catch (err) {
    console.error(`Error fetching ${method}:`, err);
    return null;
  }
};

export const checkNetworkStatus = async (network: Network): Promise<boolean> => {
  try {
    const response = await fetchRpc(network, 'getEpochInfo');
    return response && response.result ? true : false;
  } catch (error) {
    console.error(`Error checking network status for ${network.name}:`, error);
    return false;
  }
};
