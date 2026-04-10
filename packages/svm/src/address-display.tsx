'use client';

import { CheckIcon, ClipboardIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import React from 'react';
import { aggressiveTruncateAddress } from './lib/address-utils';
import { getAddressExplorerUrl } from '@surfpool/shared';

interface AddressDisplayProps {
  address: string;
  copiedStates: Record<string, boolean>;
  copyToClipboard: (text: string, id: string) => void;
  truncateAddress: (address: string) => string;
  copyId: string;
  className?: string;
  showCopyButton?: boolean;
  showExplorerButton?: boolean;
  aggressiveTruncate?: boolean;
  rpcUrl?: string;
}

const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  copiedStates,
  copyToClipboard,
  truncateAddress,
  copyId,
  className = "",
  showCopyButton = true,
  showExplorerButton = true,
  aggressiveTruncate = false,
  rpcUrl = ""
}) => {
  
  // Handle edge cases
  if (!address || address.trim() === '') {
    return <span className="text-xs text-gray-500">No address</span>;
  }

  const explorerUrl = getAddressExplorerUrl(address, rpcUrl);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-xs text-gray-300 font-mono">
        {/* Show truncated address when aggressiveTruncate is true, otherwise show full on larger screens */}
        {aggressiveTruncate ? (
          <span className="hidden sm:inline">
            {truncateAddress(address)}
          </span>
        ) : (
          <span className="hidden sm:inline">
            {address}
          </span>
        )}
        <span className="sm:hidden">
          {aggressiveTruncate ? aggressiveTruncateAddress(address) : truncateAddress(address)}
        </span>
      </span>
      {showCopyButton && (
        <button
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            copyToClipboard(address, copyId);
          }}
          aria-label={`Copy address ${address}`}
          className="flex h-4 w-4 items-center justify-center text-gray-400 transition-colors hover:text-gray-300"
        >
          {copiedStates[copyId] ? (
            <CheckIcon className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <ClipboardIcon className="h-2.5 w-2.5" />
          )}
        </button>
      )}
      {showExplorerButton && (
        <button
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            window.open(explorerUrl, '_blank');
          }}
          aria-label={`Open ${address} in Solana Explorer`}
          className="flex h-4 w-4 items-center justify-center text-gray-400 transition-colors hover:text-gray-300"
        >
          <ArrowTopRightOnSquareIcon className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
};

export default AddressDisplay; 