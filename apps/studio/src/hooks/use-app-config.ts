import { useConfig } from '@/contexts/config-context'

export const useAppConfig = () => {
  const { config, loading, error, refetch } = useConfig()

  const studioUrl = config?.studio_url || process.env.NEXT_PUBLIC_STUDIO_URL || 'http://127.0.0.1:18488'

  return {
    // URLs
    rpcUrl: config?.rpc_url || process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8899',
    wsUrl: config?.ws_url || process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8900',
    rpcDatasourceUrl: config?.rpc_datasource_url || process.env.NEXT_PUBLIC_RPC_DATASOURCE_URL || 'https://api.mainnet-beta.solana.com/',
    studioUrl,
    mcpUrl: config?.mcp_url || studioUrl, // MCP defaults to studio URL

    // State
    loading,
    error,
    refetch,

    // Raw config
    config
  }
} 