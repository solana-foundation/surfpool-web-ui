export type TokenSelectorOption = {
  id: string;
  label?: string;
  value?: string | number;
  metadata?: {
    symbol?: string;
    logo_uri?: string;
  };
  description?: string;
};

export const BISONFI_MARKET_OPTIONS: TokenSelectorOption[] = [
  {
    id: 'sol-usdc-pool-2',
    label: 'SOL / USDC',
    value: '8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo',
    description: 'SOL-USDC-Pool2',
  },
  {
    id: 'desecz-usdc-pool-1',
    label: 'deSECZ / USDC',
    value: 'Hv8FoJFsrQhoyrR6Lcz4KFcpqNHU1Kxj2yaFDKU6vJdp',
    description: 'deSECZ-USDC-Pool1',
  },
  {
    id: 'cbbtc-usdc-pool-1',
    label: 'cbBTC / USDC',
    value: '2vPjbPRnz7V1SLGr56CmLLc7JspzfSfccWp3Th5KbrMJ',
    description: 'cbBTC-USDC-Pool1',
  },
  {
    id: 'sol-usdt-pool-2',
    label: 'SOL / USDT',
    value: 'FJnaiidSLXFweWkgbinxEHRykVHsnkzDcYbNDR3RF5LN',
    description: 'SOL-USDT-Pool2',
  },
];

const getBisonFiAiContext = () =>
  [
    'Featured BisonFi markets available in Studio:',
    ...BISONFI_MARKET_OPTIONS.map(
      (market) => `- ${market.label}: pool ${market.value}; account name ${market.description}.`
    ),
  ].join('\n');

const PROTOCOL_AI_CONTEXT: Partial<Record<string, () => string>> = {
  bisonfi: getBisonFiAiContext,
};

export const getProtocolAiContext = (protocolId: string): string | undefined =>
  PROTOCOL_AI_CONTEXT[protocolId]?.();

export const isBisonFiTemplate = (templateId: unknown) =>
  typeof templateId === 'string' && templateId.startsWith('bisonfi-');

export const resolveBisonFiAccount = (templateId: unknown, templateAddress: unknown, selectedPubkey: string) => {
  if (!isBisonFiTemplate(templateId)) return templateAddress;
  const pubkey = selectedPubkey.trim();
  return pubkey ? { pubkey } : undefined;
};

export const resolveTokenSelectorOptions = (
  catalogOptions: TokenSelectorOption[],
  currentValue: string | number | undefined
) => {
  const currentValueString = currentValue != null ? String(currentValue) : '';
  const catalogOption = catalogOptions.find((option) =>
    currentValueString.startsWith('0x')
      ? String(option.value).toLowerCase() === currentValueString.toLowerCase()
      : option.value === currentValueString
  );
  const customOption =
    !catalogOption && currentValueString
      ? {
          id: `custom-${currentValueString}`,
          label: 'Custom value',
          value: currentValueString,
          metadata: { symbol: `Custom · ${currentValueString}` },
        }
      : null;

  return {
    options: customOption ? [customOption, ...catalogOptions] : catalogOptions,
    selectedOption: catalogOption || customOption,
  };
};
