'use client';

import { WorkspaceProvider } from '@/contexts/workspace-context';
import { ConfigProvider } from '@/contexts/config-context';
import { nhost } from '@/lib/nhost';
import '@/styles/tailwind.css';
import type React from 'react';
import { Dashboard } from './dashboard';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark antialiased">
      <head>
        <title>Surfpool Studio</title>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <meta name="theme-color" content="#09090b" />
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body className="bg-zinc-900 text-white">
        <ConfigProvider>
          <Dashboard>{children}</Dashboard>
        </ConfigProvider>
      </body>
    </html>
  );
}
