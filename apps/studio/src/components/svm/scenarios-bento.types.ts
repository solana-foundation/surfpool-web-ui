import type { Scenario, ScenarioStep } from '@/lib/scenarios-data';
import type { BentoItem } from './generic-bento';

export interface ScenariosBentoProps {
  scenarios: Scenario[];
  onRefresh?: () => void;
  onDetailPaneChange?: (isOpen: boolean) => void;
  initialSelectedId?: string;
  initialTab?: string;
}

export interface GenerationLog {
  timestamp: string;
  prompt: string;
  modelId: string;
  modelName: string;
  providerName: string;
  protocols: string[];
  response: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface ScenarioBentoItem extends BentoItem {
  created_at?: string;
  updated_at?: string;
  steps?: ScenarioStep[];
  tags?: string[];
}

export interface ExampleScenario {
  label: string;
  prompt: string;
  icon: string;
  protocols: string[];
}

export const exampleScenarios: ExampleScenario[] = [
  {
    label: 'Market Crash',
    prompt: 'SOL crashes from $145 to $85 in 10s, then rebounds to $110',
    icon: '📉',
    protocols: ['pyth'],
  },
  {
    label: 'DEX Arbitrage',
    prompt: 'JTO is 1% cheaper on Raydium AMM than on Raydium CLMM, enabling a SOL → JTO → SOL arbitrage',
    icon: '🔺',
    protocols: ['raydium'],
  },
  {
    label: 'Liquidation Arbitrage',
    prompt:
      'Crash a Kamino collateral price in the Scope oracle so an obligation becomes unhealthy, while Whirlpool pools keep their real price - the gap makes liquidating it profitable',
    icon: '💰',
    protocols: ['kamino', 'whirlpool'],
  },
  {
    label: 'Prop AMM Arbitrage',
    prompt:
      'Keep BisonFi quoting while its SOL/USDC mid sits 2% above Orca Whirlpool, so buying on Whirlpool and selling into BisonFi clears the fees on both venues',
    icon: '🐃',
    protocols: ['bisonfi', 'whirlpool'],
  },
  {
    label: 'Triangular Arbitrage',
    prompt:
      'Create a triangular arbitrage opportunity across BTC/USD, ETH/USD, and ETH/BTC price feeds that yields a profitable trading cycle',
    icon: '🔄',
    protocols: ['pyth'],
  },
  {
    label: 'Fresh Launch',
    prompt: "Reset Fartcoin's bonding curve to its fresh launch state so it can be bought from the start again",
    icon: '🚀',
    protocols: ['pump'],
  },
  {
    label: 'Pump Graduation',
    prompt:
      'Create an editable Pump Graduation scenario for token mint <PASTE_TOKEN_MINT_HERE> using the specialized Pump graduation tool. Call the tool exactly once with this tokenMint. If validation fails, report the error and do not retry without tokenMint. Prepare only the three state overrides; do not build buy, migrate, or sell transactions.',
    icon: '🪙',
    protocols: ['pump'],
  },
  {
    label: 'PumpSwap Pool',
    prompt:
      "Set The Official 67 Coin's canonical PumpSwap pool virtual_quote_reserves to 15000000000000 so buying it becomes far more expensive",
    icon: '💧',
    protocols: ['pumpswap'],
  },
  {
    label: 'PumpSwap Price Shock',
    prompt:
      'Create an editable PumpSwap price shock for token mint <PASTE_TOKEN_MINT_HERE>. Fetch the existing override templates, then call create_scenario once with the pump-amm-canonical-pool template, base_mint set to that mint, virtual_quote_reserves set to 15000000000000, slot 1, and fetchBeforeUse enabled. Prepare state only; do not build or execute a swap.',
    icon: '⚡',
    protocols: ['pumpswap'],
  },
];
