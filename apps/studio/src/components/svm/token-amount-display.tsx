'use client';

import React from 'react';
import { convertTokenAmount } from '@/lib/address-utils';

interface TokenAmountDisplayProps {
  amount: number;
  decimals: number;
  symbol: string;
  className?: string;
  showSymbol?: boolean;
  formatOptions?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    useGrouping?: boolean;
  };
  variant?: 'default' | 'compact' | 'badge';
}

const TokenAmountDisplay: React.FC<TokenAmountDisplayProps> = ({ 
  amount, 
  decimals, 
  symbol, 
  className = "",
  showSymbol = true,
  formatOptions = {},
  variant = 'default'
}) => {
  // Format the amount with proper decimal places
  const formatAmount = (value: number, options: Intl.NumberFormatOptions) => {
    const {
      minimumFractionDigits = 0,
      maximumFractionDigits = 9,
      useGrouping = true
    } = options;

    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping
    }).format(value);
  };

  const convertedAmount = convertTokenAmount(amount, decimals);
  const formattedAmount = formatAmount(convertedAmount, formatOptions);
  const displayText = showSymbol ? `${formattedAmount} ${symbol}` : formattedAmount;

  // Different styling variants
  const getVariantClasses = () => {
    switch (variant) {
      case 'badge':
        return 'rounded px-2 py-0.5 text-[12px] font-medium border border-gray-500/30 text-gray-300';
      case 'compact':
        return 'text-sm font-mono text-gray-300';
      case 'default':
      default:
        return 'text-base font-mono text-gray-300 border border-gray-500/30 rounded px-2 py-1';
    }
  };

  return (
    <span className={`${getVariantClasses()} ${className}`}>
      {displayText}
    </span>
  );
};

export default TokenAmountDisplay; 