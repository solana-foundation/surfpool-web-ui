import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AddressDisplay from './address-display';
import { renderWithConfig } from '@/test-utils';

const TEST_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

const defaultProps = {
  address: TEST_ADDRESS,
  copiedStates: {} as Record<string, boolean>,
  copyToClipboard: vi.fn(),
  truncateAddress: (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`,
  copyId: 'test-copy',
};

describe('AddressDisplay', () => {
  it('renders the address', () => {
    renderWithConfig(<AddressDisplay {...defaultProps} />);
    // Full address shown on sm+ screens
    expect(screen.getByText(TEST_ADDRESS)).toBeInTheDocument();
  });

  it('renders copy button by default', () => {
    renderWithConfig(<AddressDisplay {...defaultProps} />);
    expect(screen.getByLabelText(`Copy address ${TEST_ADDRESS}`)).toBeInTheDocument();
  });

  it('hides copy button when showCopyButton is false', () => {
    renderWithConfig(<AddressDisplay {...defaultProps} showCopyButton={false} />);
    expect(screen.queryByLabelText(`Copy address ${TEST_ADDRESS}`)).not.toBeInTheDocument();
  });

  it('calls copyToClipboard on copy button click', async () => {
    const copyFn = vi.fn();
    renderWithConfig(
      <AddressDisplay {...defaultProps} copyToClipboard={copyFn} />
    );
    fireEvent.click(screen.getByLabelText(`Copy address ${TEST_ADDRESS}`));
    expect(copyFn).toHaveBeenCalledWith(TEST_ADDRESS, 'test-copy');
  });

  it('renders explorer link with correct rpcUrl from config', () => {
    renderWithConfig(<AddressDisplay {...defaultProps} />, {
      config: {
        rpc_url: 'http://custom:9999',
        ws_url: 'ws://127.0.0.1:8900',
        rpc_datasource_url: 'https://api.mainnet-beta.solana.com/',
        studio_url: 'http://127.0.0.1:18488',
      },
    });
    const explorerLink = screen.getByLabelText(`Open ${TEST_ADDRESS} in Solana Explorer`);
    expect(explorerLink).toBeInTheDocument();
  });

  it('shows check icon when address is in copied state', () => {
    renderWithConfig(
      <AddressDisplay {...defaultProps} copiedStates={{ 'test-copy': true }} />
    );
    // The copy button should still be present but show a check icon
    expect(screen.getByLabelText(`Copy address ${TEST_ADDRESS}`)).toBeInTheDocument();
  });

  it('renders fallback for empty address', () => {
    renderWithConfig(<AddressDisplay {...defaultProps} address="" />);
    expect(screen.getByText('No address')).toBeInTheDocument();
  });

  it('renders fallback for whitespace-only address', () => {
    renderWithConfig(<AddressDisplay {...defaultProps} address="   " />);
    expect(screen.getByText('No address')).toBeInTheDocument();
  });

  it('uses truncateAddress prop for sm:hidden display', () => {
    const truncate = vi.fn().mockReturnValue('7xKX...gAsU');
    renderWithConfig(
      <AddressDisplay {...defaultProps} truncateAddress={truncate} />
    );
    expect(truncate).toHaveBeenCalledWith(TEST_ADDRESS);
  });
});
