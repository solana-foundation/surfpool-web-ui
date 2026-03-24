import { logger } from '@surfpool/shared'
import React, { createContext, useContext, useEffect, useState } from 'react'

interface Config {
  rpc_url: string
  ws_url: string
  rpc_datasource_url: string
  studio_url: string
  mcp_url?: string
}

interface ConfigContextType {
  config: Config | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export const useConfig = () => {
  const context = useContext(ConfigContext)
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider')
  }
  return context
}

interface ConfigProviderProps {
  children: React.ReactNode
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfig = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Try local /config endpoint first
      let response = await fetch('/config')
      if (!response.ok) {
        const fallbackUrl = process.env.NEXT_PUBLIC_STUDIO_URL || 'http://127.0.0.1:18488'
        logger.log(`⚠️ Local /config failed, trying ${fallbackUrl}/config`)
        // Fallback to the full URL
        response = await fetch(`${fallbackUrl}/config`)
        if (!response.ok) {
          throw new Error(`Failed to fetch config from both endpoints: ${response.status}`)
        }
      }
      
      const data: Config = await response.json()
      logger.log('📋 Config loaded:', data)
      setConfig(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch config'
      console.error('❌ Config fetch error:', errorMessage)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const value: ConfigContextType = {
    config,
    loading,
    error,
    refetch: fetchConfig
  }

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  )
} 