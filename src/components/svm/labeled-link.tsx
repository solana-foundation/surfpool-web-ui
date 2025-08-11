'use client'

import { Button } from '@/components/catalyst/button'
import { CheckIcon, ClipboardIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

export interface Endpoint {
  title?: string
  name: string
  url: string
}

interface LabeledLinkProps {
  endpoint: Endpoint
  className?: string
}

export function LabeledLink({ endpoint, className = '' }: LabeledLinkProps) {
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)

    setCopiedStates((prev) => ({ ...prev, [id]: true }))

    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [id]: false }))
    }, 2000)
  }

  return (
    <div className="space-y-0">
      <div key={endpoint.name} className="mt-0 space-y-0">
        {/* Query Endpoint */}
        <div className="flex-1 space-y-2">
          <div className="text-sm font-medium text-zinc-300 uppercase">{endpoint.title}</div>
          <div className={`flex h-[38px] items-center justify-between overflow-hidden border border-zinc-700 bg-zinc-800 pr-[6px] font-mono text-xs ${className}`}>
            {' '}
            <div className="flex h-full items-center gap-2">
              <span className="flex h-full w-[40px] sm:w-[72px] items-center justify-center border-r border-zinc-600 bg-zinc-900 p-1 text-zinc-300 uppercase">
                <span className="hidden sm:inline">{endpoint.name}</span>
                <span className="sm:hidden">
                  {endpoint.name === 'RPC URL' ? 'RPC' :
                   endpoint.name === 'WS URL' ? 'WS' :
                   endpoint.name === 'SOURCE' ? 'SRC' :
                   endpoint.name}
                </span>
              </span>
              <span className="flex h-full items-center text-xs">{endpoint.url}</span>
            </div>
            <Button
              outline
              onClick={() => copyToClipboard(endpoint.url, `query-${endpoint.name}`)}
              aria-label={`Copy query endpoint for ${endpoint.name}`}
              className="flex h-[28px] w-[28px] items-center justify-center border border-zinc-700"
           >
              {copiedStates[`query-${endpoint.name}`] ? (
                <CheckIcon data-slot="icon" className="h-4 w-4 text-green-500" />
              ) : (
                <ClipboardIcon data-slot="icon" className="h-4 w-4 text-zinc-300" />
              )}
            </Button>
          </div>
        </div>

        {/* Subscription Endpoint */}
      </div>
    </div>
  )
}
