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
      'A Kamino obligation worth ~$300k became unhealthy. Whirlpool and Raydium AMM pools are set up to create a profitable liquidation arbitrage path',
    icon: '💰',
    protocols: ['kamino', 'whirlpool', 'raydium'],
  },
  {
    label: 'Triangular Arbitrage',
    prompt:
      'Create a triangular arbitrage opportunity across BTC/USD, ETH/USD, and ETH/BTC price feeds that yields a profitable trading cycle',
    icon: '🔄',
    protocols: ['pyth'],
  },
];
