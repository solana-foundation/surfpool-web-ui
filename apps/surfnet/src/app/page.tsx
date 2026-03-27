'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import json from 'react-syntax-highlighter/dist/cjs/languages/prism/json';
import javascript from 'react-syntax-highlighter/dist/cjs/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/cjs/languages/prism/typescript';
import { Mermaid } from '../components/mermaid';

SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
import { CompactSlotWidget, Faucet, solanaWebSocketService } from '@surfpool/svm';
import { getSolanaExplorerUrl } from '@surfpool/shared';
import Footer from '@/components/footer';
import { initAmplitude, trackPageView, trackExplorerClicked, trackPrimaryButtonClicked } from '@/lib/amplitude';

interface NetworkConfig {
  network_name: string;
  network_handle: string;
  network_description: string;
  network_url: string;
  rpc_url: string;
  ws_url: string;
  explorer_cluster_query?: string;
  network_banner_image_url: string;
  network_logo_image_url: string;
  primary_color: string;
  secondary_color: string;
  primary_button?: {
    label: string;
    url: string;
    color: string;
  };
  faucet_enabled: boolean;
  faucet_amount_sol: number;
  faucet_daily_limit_sol: number;
  faucet_cooldown_minutes: number;
}

// Helper to build explorer URL from query string (handles encoding)
const buildExplorerUrl = (query: string): string => {
  const params = new URLSearchParams();
  query.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      params.set(key, value);
    }
  });
  return `https://explorer.solana.com/?${params.toString()}`;
};

export default function Home() {
  const [config, setConfig] = useState<NetworkConfig | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [networkId, setNetworkId] = useState<string>('default');

  // Initialize Amplitude on mount
  useEffect(() => {
    initAmplitude();
  }, []);

  useEffect(() => {
    const hostname = window.location.hostname;
    const href = window.location.href;
    const searchParams = new URLSearchParams(window.location.search);
    let detectedNetworkId = 'default';

    // Debug logging for iOS
    console.log('=== Network Detection Debug ===');
    console.log('Full URL:', href);
    console.log('Hostname:', hostname);
    console.log('Search params:', window.location.search);
    console.log('Query params:', Array.from(searchParams.entries()));

    // Check if hostname is an IP address (IPv4 pattern)
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    console.log('Is IP address:', isIpAddress);

    // On localhost or IP address, check for query parameter first (e.g., localhost:3001/?simd-0296)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || isIpAddress) {
      console.log('Using query parameter detection (localhost/IP)');
      // Get the first query parameter key (e.g., "simd-0296" from "?simd-0296")
      const params = Array.from(searchParams.keys());
      console.log('Query param keys:', params);
      if (params.length > 0) {
        detectedNetworkId = params[0];
        console.log('Detected from query param:', detectedNetworkId);
        // Store in localStorage for persistence
        localStorage.setItem('surfnet-network-id', detectedNetworkId);
      } else {
        // Try to restore from localStorage if no query param
        const stored = localStorage.getItem('surfnet-network-id');
        if (stored) {
          detectedNetworkId = stored;
          console.log('Restored from localStorage:', detectedNetworkId);
        }
      }
    } else {
      console.log('Using subdomain detection (domain)');
      // Extract subdomain (e.g., "simd-0296" from "simd-0296.surfnet.dev")
      const parts = hostname.split('.');
      console.log('Domain parts:', parts);
      if (parts.length >= 3) {
        // Has subdomain (e.g., ["simd-0296", "surfnet", "dev"])
        detectedNetworkId = parts[0];
        console.log('Detected from subdomain:', detectedNetworkId);
        // Store in localStorage for persistence
        localStorage.setItem('surfnet-network-id', detectedNetworkId);
      }
    }

    console.log('Final network ID:', detectedNetworkId);
    console.log('===============================');

    setNetworkId(detectedNetworkId);

    // Load config.json and README.md in parallel
    Promise.all([
      fetch(`/${detectedNetworkId}/config.json`)
        .then((res) => {
          if (!res.ok) {
            console.warn(`Config file ${detectedNetworkId}/config.json not found, falling back to default`);
            return fetch('/default/config.json');
          }
          return res;
        })
        .then((res) => res.json()),
      fetch(`/${detectedNetworkId}/README.md`)
        .then((res) => {
          if (!res.ok) {
            console.warn(`Markdown file ${detectedNetworkId}/README.md not found, falling back to default`);
            return fetch('/default/README.md');
          }
          return res;
        })
        .then((res) => res.text())
    ])
      .then(([configData, markdownData]) => {
        setConfig(configData);
        setMarkdown(markdownData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load network configuration:', err);
        setLoading(false);
      });
  }, []);

  // Update page title and meta tags when config loads
  useEffect(() => {
    if (config) {
      const pageTitle = config.network_name.replace(' - ', ' | ');
      const ogImageUrl = `${window.location.origin}/og/${networkId}.png`;

      // Update document title
      document.title = pageTitle;

      // Helper function to update or create meta tag
      const setMetaTag = (property: string, content: string, isProperty = true) => {
        const attribute = isProperty ? 'property' : 'name';
        let element = document.querySelector(`meta[${attribute}="${property}"]`);

        if (!element) {
          element = document.createElement('meta');
          element.setAttribute(attribute, property);
          document.head.appendChild(element);
        }

        element.setAttribute('content', content);
      };

      // Update meta description
      setMetaTag('description', config.network_description, false);

      // Update Open Graph tags
      setMetaTag('og:type', 'website');
      setMetaTag('og:title', config.network_name);
      setMetaTag('og:description', config.network_description);
      setMetaTag('og:image', ogImageUrl);
      setMetaTag('og:image:width', '1200');
      setMetaTag('og:image:height', '630');
      setMetaTag('og:url', window.location.href);

      // Update Twitter Card tags
      setMetaTag('twitter:card', 'summary_large_image', false);
      setMetaTag('twitter:title', config.network_name, false);
      setMetaTag('twitter:description', config.network_description, false);
      setMetaTag('twitter:image', ogImageUrl, false);

      // Track page view
      trackPageView(networkId, config.network_name);
    }
  }, [config, networkId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-lg text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-lg text-red-600">Failed to load network configuration</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Main wrapper with vertical lines */}
      <div className="mx-auto max-w-[1265px] min-h-screen border-x border-zinc-800">
        {/* Banner Header */}
        <div className="relative h-[300px] w-full lg:h-[400px]">
          <img
            src={`/${config.network_banner_image_url}`}
            alt={`${config.network_name} Banner`}
            className="h-full w-full object-cover object-top sm:object-center"
          />
          {/* Slot Widget - Top Right */}
          <div className="absolute right-4 top-4 z-10 lg:right-8 lg:top-8">
            <CompactSlotWidget
              rpcUrl={config.rpc_url}
              wsUrl={config.ws_url}
              solanaWebSocketService={solanaWebSocketService}
            />
          </div>
          {/* Logo - Overlapping banner */}
          <div className="absolute bottom-0 left-4 translate-y-1/2 lg:left-8">
            <img
              src={`/${config.network_logo_image_url}`}
              alt={config.network_name}
              className="h-32 w-32 rounded-xl border-4 border-black lg:h-40 lg:w-40"
            />
          </div>
        </div>

        {/* Horizontal line after banner */}
        <div className="border-b border-zinc-800" />

        {/* Profile Section */}
        <div className="relative px-4">
          {/* Name and Handle */}
          <div className="mt-20 px-4 lg:mt-24 lg:px-8">
            <h1 className="text-xl font-bold lg:text-2xl">{config.network_name}</h1>
            <p className="mt-1 text-zinc-500">@{config.network_handle}</p>

            {/* Description */}
            <p className="mt-3 text-[15px] leading-5">{config.network_description}</p>

            {/* Action Buttons */}
            <div className="mt-4 flex flex-col gap-3 pb-6 sm:flex-row sm:justify-start">
              {config.primary_button && (
                <a
                  href={config.primary_button.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg px-6 py-4 text-center text-base font-semibold text-white transition-colors sm:py-3 sm:text-sm"
                  style={{ backgroundColor: config.primary_button.color }}
                  onClick={() => trackPrimaryButtonClicked(networkId, config.primary_button!.label)}
                >
                  {config.primary_button.label}
                </a>
              )}
              <a
                href={config.explorer_cluster_query ? buildExplorerUrl(config.explorer_cluster_query) : getSolanaExplorerUrl(config.rpc_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-700 bg-transparent px-6 py-4 text-center text-base font-semibold text-white transition-colors hover:bg-zinc-900 sm:py-3 sm:text-sm"
                onClick={() => trackExplorerClicked(networkId)}
              >
                Explore Cluster
              </a>
            </div>
          </div>
        </div>

        {/* Horizontal line after profile section */}
        <div className="border-b border-zinc-800" />

        {/* Two-column Layout */}
        <div className="flex flex-col-reverse gap-8 py-8 px-4 lg:grid lg:grid-cols-[1fr_450px] lg:gap-8 bg-zinc-950">
          {/* Main Content */}
          <div className="w-full">
            <div className="space-y-6">
              <div className="rounded-2xl bg-zinc-950 p-6">
                <article className="prose prose-zinc max-w-none prose-invert prose-headings:text-white prose-p:text-zinc-300 prose-a:text-purple-400 prose-code:text-white prose-code:bg-zinc-800 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match;
                        if (match && match[1] === 'mermaid') {
                          return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                        }
                        return !isInline ? (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              borderRadius: '0.5rem',
                              border: '1px solid rgb(39 39 42)',
                            }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {markdown}
                  </ReactMarkdown>
                </article>
              </div>
            </div>
          </div>

          {/* Sidebar - Sticky faucet (desktop only) */}
          <aside className="w-full lg:w-[450px]">
            <div className="lg:sticky lg:top-4">
              {/* Faucet Widget */}
              {config.faucet_enabled && <Faucet rpcUrl={config.rpc_url} primaryColor={config.primary_color} explorerClusterQuery={config.explorer_cluster_query} />}
            </div>
          </aside>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
