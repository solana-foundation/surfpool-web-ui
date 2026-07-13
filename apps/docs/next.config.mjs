import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const NEW_DOCS_BASE = 'https://solana.com/docs/tools/surfpool';

// Pages whose path is unchanged under the new docs base.
const unchangedPaths = [
  'iac/getting-started',
  'iac/language',
  'iac/std/actions',
  'iac/std/functions',
  'iac/std/overview',
  'iac/svm/actions',
  'iac/svm/functions',
  'iac/svm/overview',
  'iac/svm/signers',
  'resources/video-tutorials',
  'rpc/accounts',
  'rpc/admin',
  'rpc/cheatcodes',
  'rpc/network',
  'rpc/node',
  'rpc/overview',
  'rpc/transactions',
  'rpc/websockets',
  'sdk/cheatcodes',
  'sdk/configuration',
  'sdk/events',
  'sdk/installation',
  'sdk/js-reference',
  'sdk/overview',
  'sdk/programs',
  'sdk/rust-reference',
  'sdk/time-travel',
  'toolchain/cli',
  'toolchain/getting-started',
  'toolchain/tui',
];

// Pages that were flattened under the new docs base (old path -> new path).
const movedPaths = {
  'iac/std/actions/http': 'iac/std/http',
  'iac/std/functions/assertions': 'iac/std/assertions',
  'iac/std/functions/base58': 'iac/std/base58',
  'iac/std/functions/base64': 'iac/std/base64',
  'iac/std/functions/crypto': 'iac/std/crypto',
  'iac/std/functions/hash': 'iac/std/hash',
  'iac/std/functions/hex': 'iac/std/hex',
  'iac/std/functions/json': 'iac/std/json',
  'iac/std/functions/list': 'iac/std/list',
  'iac/std/functions/operators': 'iac/std/operators',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@surfpool/ui', '@surfpool/shared'],
  async redirects() {
    return [
      { source: '/', destination: NEW_DOCS_BASE, permanent: true },
      ...unchangedPaths.map((path) => ({
        source: `/${path}`,
        destination: `${NEW_DOCS_BASE}/${path}`,
        permanent: true,
      })),
      ...Object.entries(movedPaths).map(([from, to]) => ({
        source: `/${from}`,
        destination: `${NEW_DOCS_BASE}/${to}`,
        permanent: true,
      })),
    ];
  },
  turbopack: {
    rules: {
      // Only apply SVGR to SVGs from packages/ui, not public assets
      '../../packages/ui/**/*.svg': {
        loaders: [
          {
            loader: '@svgr/webpack',
            options: {
              svgoConfig: {
                plugins: [
                  {
                    name: 'removeViewBox',
                    active: false,
                  },
                  {
                    name: 'removeDimensions',
                    active: true,
                  },
                ],
              },
            },
          },
        ],
        as: '*.js',
      },
    },
  },
};

export default withMDX(nextConfig);
