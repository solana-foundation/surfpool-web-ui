import { logger } from '@surfpool/shared'
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

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
  const [settled, setSettled] = useState(false)
  const request = useRef<AbortController | null>(null)

  const fetchConfig = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      setLoading(true)
      setError(null)
      
      // Try local /config endpoint first
      let response = await fetch('/config', { signal: controller.signal })
      if (!response.ok) {
        const fallbackUrl = process.env.NEXT_PUBLIC_STUDIO_URL || 'http://127.0.0.1:18488'
        logger.log(`⚠️ Local /config failed, trying ${fallbackUrl}/config`)
        // Fallback to the full URL
        response = await fetch(`${fallbackUrl}/config`, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to fetch config from both endpoints: ${response.status}`)
        }
      }
      
      const data: Config = await response.json()
      logger.log('📋 Config loaded:', data)
      if (request.current === controller) setConfig(data)
    } catch (err) {
      if (request.current !== controller) return
      const errorMessage = controller.signal.aborted
        ? 'Studio configuration request timed out'
        : err instanceof Error ? err.message : 'Failed to fetch config'
      console.error('❌ Config fetch error:', errorMessage)
      setError(errorMessage)
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) {
        setLoading(false)
        setSettled(true)
      }
    }
  }

  useEffect(() => {
    fetchConfig()
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [])

  const value: ConfigContextType = {
    config,
    loading,
    error,
    refetch: fetchConfig
  }

  // Consumers connect on mount: settle configuration before choosing endpoints.
  return (
    <ConfigContext.Provider value={value}>
      {settled ? children : <p role="status">Loading Studio configuration…</p>}
    </ConfigContext.Provider>
  )
}
