# Surfpool Studio UI

> [!IMPORTANT]
> **This repository is being archived.** The Surfpool documentation has moved to the [Solana developer docs](https://solana.com/docs/tools/surfpool). Please open documentation PRs against [`solana-foundation/solana-com`](https://github.com/solana-foundation/solana-com/tree/main/apps/docs/content/docs/en/tools) instead of this repo.

Monorepo for all Surfpool front-end applications and shared packages. Built with [Turborepo](https://turbo.build/repo), [pnpm](https://pnpm.io/), [Next.js](https://nextjs.org/), and [Tailwind CSS v4](https://tailwindcss.com/).

## Getting Started

```bash
pnpm install
pnpm dev        # start all apps in development
pnpm build      # build all apps and packages
pnpm lint       # lint everything
```

## Repository Structure

```
surfpool-studio-ui/
├── apps/
│   ├── studio/     # Developer dashboard (embedded in Surfpool CLI)
│   ├── surfnet/    # Public network profile pages
│   ├── www/        # Marketing site (surfpool.run)
│   └── docs/       # Documentation site (docs.surfpool.run)
├── packages/
│   ├── ui/         # Design system & component library (+ Storybook)
│   ├── svm/        # Solana-specific React components
│   └── shared/     # Shared utilities and types
├── turbo.json      # Turborepo task config
└── pnpm-workspace.yaml
```

## Apps

### `apps/studio` — Surfpool Studio

The primary developer dashboard, served by the Surfpool CLI at `http://localhost:18488`. Provides a full-featured UI for interacting with a local Solana validator.

- **Transaction inspector** with hex-level account diffs and compute unit profiling
- **Real-time slot/transaction feed** via WebSocket
- **Embedded GraphQL explorer** (GraphiQL)
- **Account browser** and viewer
- **Scenarios editor** — create, edit, and run test scenarios against the local network
- **Faucet** for airdropping SOL and SPL tokens
- **Time-travel controls** — advance clock, jump to slot/epoch/date
- **Publish to Surfnet** workflow with MoneyMQ payment checkout
- **AI-powered scenario generation** (Anthropic, OpenAI, Google via Vercel AI SDK)

**Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, static export in production.

```bash
cd apps/studio && pnpm dev   # http://localhost:3000
```

### `apps/surfnet` — Surfnet Network Pages

Dynamic profile pages for published Surfpool networks (e.g. `simd-0296.surfnet.dev`). Functions like a landing page for a specific Solana test network.

- Renders a network's README (Markdown with syntax highlighting)
- Live slot progress widget
- Faucet for distributing SOL and SPL tokens
- Dynamic OG image generation (Satori + Sharp)
- Network detection via subdomain (prod) or query param (dev)

**Stack:** Next.js 15, React 19, Tailwind CSS v4, static export in production.

```bash
cd apps/surfnet && pnpm dev   # http://localhost:3001
```

### `apps/www` — Marketing Site

The public-facing website at [surfpool.run](https://surfpool.run). A dark-themed, single-page landing site.

- Animated hero section with terminal preview
- Feature sections: Simulate, Cheatcodes, Deploy, Observe
- Blog with MDX posts (in `content/blog/`)
- GitHub star counter (live API)
- Vercel Analytics

**Stack:** Next.js 16, React 19, Tailwind CSS v4, Motion (Framer Motion), static export.

```bash
cd apps/www && pnpm dev   # http://localhost:3002
```

### `apps/docs` — Documentation Site

Developer documentation at [docs.surfpool.run](https://docs.surfpool.run). Built on [Fumadocs](https://fumadocs.vercel.app/).

- Full MDX documentation system with sidebar navigation
- RPC method reference with interactive JSON schemas
- WebSocket reference documentation
- Search API
- Shiki syntax highlighting

**Stack:** Next.js 16, React 19, Tailwind CSS v4, Fumadocs.

```bash
cd apps/docs && pnpm dev
```

## Packages

### `packages/ui` — Design System

Shared UI component library with two layers:

1. **Surfpool components** — branded `Button` (primary/secondary/ghost/white/yellow variants, multiple sizes), `Link`, `Logo`
2. **Catalyst components** — accessible, Headless UI-powered primitives: `Alert`, `Avatar`, `Badge`, `Checkbox`, `Combobox`, `Dialog`, `Dropdown`, `Input`, `Listbox`, `Navbar`, `Pagination`, `Select`, `Sidebar`, `SidebarLayout`, `Switch`, `Table`, `Textarea`, and more

Import paths:
```ts
import { Button, Logo } from '@surfpool/ui'
import { Dialog, Dropdown } from '@surfpool/ui/catalyst'
```

**Dependencies:** `@headlessui/react`, `@heroicons/react`, Tailwind CSS v4, Inter font.

### `packages/svm` — Solana Components

Solana-specific shared React components and utilities used by `studio` and `surfnet`:

- `CompactSlotWidget` — live slot progress bar via WebSocket
- `Faucet` — multi-token airdrop UI
- `AddressDisplay`, `TokenAmountDisplay`, `TransactionInspector`
- `SolanaWebSocketService` — singleton WebSocket service for slot subscriptions
- Utilities: address formatting, hex diff analysis, transaction stream hooks

**Dependencies:** `@solana/kit`, `@solana/web3.js`, `@solana/spl-token`.

### `packages/shared` — Shared Utilities

Lightweight package with no heavy dependencies. Currently provides Solana Explorer URL builders:

- `getSolanaExplorerUrl(rpcUrl, path?)`
- `getAddressExplorerUrl(address, rpcUrl)`
- `getTransactionExplorerUrl(signature, rpcUrl)`

## Storybook

The component library includes a Storybook setup for developing and documenting UI components in isolation.

```bash
cd packages/ui && pnpm storybook         # dev server at http://localhost:6006
cd packages/ui && pnpm build-storybook   # static build
```

**Setup:** Storybook v10 with `@storybook/react-vite`, Tailwind CSS v4 integration via `@tailwindcss/vite`, and a `next/link` mock for Next.js compatibility.

**Addons:** Chromatic (visual testing), Vitest, Accessibility (a11y), Docs.

## Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| pnpm | 10.14 | Package manager |
| Turborepo | 2.3 | Monorepo build orchestration |
| TypeScript | 5.x | Type checking (`strict`, `bundler` module resolution) |
| Prettier | 3.x | Formatting (`singleQuote`, `printWidth: 120`, Tailwind plugin) |
| Tailwind CSS | v4 | Styling (all apps and packages) |
