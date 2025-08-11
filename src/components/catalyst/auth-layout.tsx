import type React from 'react'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col p-2 bg-zinc-900">
      <div className="flex grow items-center justify-center p-6 lg:rounded-lg lg:bg-zinc-900 lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-white/10">
        {children}
      </div>
    </main>
  )
}
