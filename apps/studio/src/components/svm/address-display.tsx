'use client';

import { useAppConfig } from '@/hooks/use-app-config';
import { AddressDisplay as BaseAddressDisplay } from '@surfpool/svm';
import React from 'react';

interface AddressDisplayProps {
  address: string;
  copiedStates: Record<string, boolean>;
  copyToClipboard: (text: string, id: string) => void;
  truncateAddress: (address: string) => string;
  copyId: string;
  className?: string;
  showCopyButton?: boolean;
  aggressiveTruncate?: boolean;
}

const AddressDisplay: React.FC<AddressDisplayProps> = (props) => {
  const { rpcUrl } = useAppConfig();
  return <BaseAddressDisplay {...props} rpcUrl={rpcUrl} />;
};

export default AddressDisplay;
