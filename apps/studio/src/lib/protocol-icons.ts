// Protocol definitions
export interface Protocol {
  id: string;
  name: string;
  icon: string;
}

export const PROTOCOLS: Protocol[] = [
  { id: 'pyth', name: 'Pyth', icon: '/assets/pyth.svg' },
  { id: 'switchboard', name: 'Switchboard', icon: '/assets/switchboard.svg' },
  { id: 'jupiter', name: 'Jupiter', icon: '/assets/jupiter.svg' },
  { id: 'raydium', name: 'Raydium', icon: '/assets/raydium.svg' },
  { id: 'whirlpool', name: 'Whirlpool', icon: '/assets/whirlpool.svg' },
  { id: 'drift', name: 'Drift', icon: '/assets/drift.svg' },
  { id: 'kamino', name: 'Kamino', icon: '/assets/kamino.svg' },
  { id: 'meteora', name: 'Meteora', icon: '/assets/meteora.svg' },
  { id: 'pump', name: 'Pump', icon: '/assets/pump.svg' },
  { id: 'pumpswap', name: 'PumpSwap', icon: '/assets/pumpswap.svg' },
];

// Shared protocol icon mappings (derived from PROTOCOLS for backwards compatibility)
export const PROTOCOL_ICONS: Record<string, string> = Object.fromEntries(PROTOCOLS.map((p) => [p.id, p.icon]));

export function getProtocolIcon(protocolId: string, fallback = '/assets/surfpool.svg'): string {
  return PROTOCOL_ICONS[protocolId] || fallback;
}
