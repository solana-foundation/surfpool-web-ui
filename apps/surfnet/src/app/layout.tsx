import type { Metadata } from 'next';
import { SURFNET_DOMAIN } from '@surfpool/shared';
import '@/styles/tailwind.css';

// Default metadata - will be updated client-side based on network config
// Note: For proper social media previews on each subdomain, consider using
// a server-rendered deployment instead of static export
export const metadata: Metadata = {
  metadataBase: new URL(`https://${SURFNET_DOMAIN}`),
  title: 'Surfnet - Ephemeral Solana Networks',
  description: 'Ephemeral Solana networks for testing and development. Test new features, run experiments, and build with confidence.',
  openGraph: {
    type: 'website',
    siteName: 'Surfnet',
    title: 'Surfnet - Ephemeral Solana Networks',
    description: 'Ephemeral Solana networks for testing and development.',
    images: ['/og/default.png'],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@surfnet',
    title: 'Surfnet - Ephemeral Solana Networks',
    description: 'Ephemeral Solana networks for testing and development.',
    images: ['/og/default.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full bg-black text-zinc-950 antialiased dark:bg-black dark:text-white">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
