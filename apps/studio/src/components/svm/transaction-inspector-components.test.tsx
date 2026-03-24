import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithConfig } from '@/test-utils';
import {
  LamportsDisplay,
  LamportsComparison,
  PermissionsBox,
  AccountLabels,
} from './transaction-inspector-components';

describe('LamportsDisplay', () => {
  it('renders SOL amount from lamports', () => {
    renderWithConfig(<LamportsDisplay lamports={1000000000} />);
    expect(screen.getByText('1 SOL')).toBeInTheDocument();
  });

  it('renders fractional amounts', () => {
    renderWithConfig(<LamportsDisplay lamports={500000000} />);
    expect(screen.getByText('0.5 SOL')).toBeInTheDocument();
  });

  it('renders zero lamports', () => {
    renderWithConfig(<LamportsDisplay lamports={0} />);
    expect(screen.getByText('0 SOL')).toBeInTheDocument();
  });

  it('renders small amounts with full precision', () => {
    renderWithConfig(<LamportsDisplay lamports={1} />);
    expect(screen.getByText('0.000000001 SOL')).toBeInTheDocument();
  });
});

describe('LamportsComparison', () => {
  it('renders before and after lamports', () => {
    renderWithConfig(
      <LamportsComparison beforeLamports={1000000000} afterLamports={2000000000} />
    );
    expect(screen.getByText('1 SOL')).toBeInTheDocument();
    expect(screen.getByText('2 SOL')).toBeInTheDocument();
  });

  it('renders equal amounts', () => {
    renderWithConfig(
      <LamportsComparison beforeLamports={1000000000} afterLamports={1000000000} />
    );
    expect(screen.getByText('1 SOL')).toBeInTheDocument();
  });
});

describe('PermissionsBox', () => {
  const defaultProps = {
    accountState: { type: 'writable' as const },
    address: 'some-address',
    hasChanges: false,
    transactionProfile: { readonlyAccountStates: {} },
    selectedTransaction: null,
  };

  it('highlights W for writable accounts', () => {
    const { container } = render(<PermissionsBox {...defaultProps} />);
    const spans = container.querySelectorAll('span');
    // R span should not be highlighted, W should be
    const rSpan = Array.from(spans).find((s) => s.textContent === 'R');
    const wSpan = Array.from(spans).find((s) => s.textContent === 'W');
    expect(rSpan?.className).toContain('text-gray-500');
    expect(wSpan?.className).toContain('bg-gray-300');
  });

  it('highlights R for readonly accounts', () => {
    const { container } = render(
      <PermissionsBox {...defaultProps} accountState={{ type: 'readonly' }} />
    );
    const spans = container.querySelectorAll('span');
    const rSpan = Array.from(spans).find((s) => s.textContent === 'R');
    const wSpan = Array.from(spans).find((s) => s.textContent === 'W');
    expect(rSpan?.className).toContain('bg-gray-300');
    expect(wSpan?.className).toContain('text-gray-500');
  });

  it('highlights X when account is a program', () => {
    const { container } = render(
      <PermissionsBox
        {...defaultProps}
        selectedTransaction={{
          transaction: {
            message: {
              instructions: [{ programId: 'some-address' }],
            },
          },
        }}
      />
    );
    const spans = container.querySelectorAll('span');
    const xSpan = Array.from(spans).find((s) => s.textContent === 'X');
    expect(xSpan?.className).toContain('bg-gray-300');
  });
});

describe('AccountLabels', () => {
  const baseProps = {
    accountState: { type: 'writable' as const, accountChange: { type: 'unchanged' as const } },
    address: 'some-address',
    hasChanges: false,
    transactionProfile: { readonlyAccountStates: {}, instructionProfiles: [] },
    selectedTransaction: { transaction: { message: { instructions: [], header: { numRequiredSignatures: 0 } } } },
  };

  it('shows NEW ACCOUNT label for create changes', () => {
    render(
      <AccountLabels
        {...baseProps}
        hasChanges={true}
        accountState={{ type: 'writable', accountChange: { type: 'create' } }}
      />
    );
    expect(screen.getByText('NEW ACCOUNT')).toBeInTheDocument();
  });

  it('shows UPDATED ACCOUNT label for update changes', () => {
    render(
      <AccountLabels
        {...baseProps}
        hasChanges={true}
        accountState={{ type: 'writable', accountChange: { type: 'update' } }}
      />
    );
    expect(screen.getByText('UPDATED ACCOUNT')).toBeInTheDocument();
  });

  it('shows DELETED ACCOUNT label for delete changes', () => {
    render(
      <AccountLabels
        {...baseProps}
        hasChanges={true}
        accountState={{ type: 'writable', accountChange: { type: 'delete' } }}
      />
    );
    expect(screen.getByText('DELETED ACCOUNT')).toBeInTheDocument();
  });

  it('shows no change label when hasChanges is false', () => {
    render(<AccountLabels {...baseProps} />);
    expect(screen.queryByText('NEW ACCOUNT')).not.toBeInTheDocument();
    expect(screen.queryByText('UPDATED ACCOUNT')).not.toBeInTheDocument();
    expect(screen.queryByText('DELETED ACCOUNT')).not.toBeInTheDocument();
  });

  it('shows READ ACCOUNT label for readonly accounts without changes', () => {
    render(
      <AccountLabels
        {...baseProps}
        accountState={{ type: 'readonly', accountChange: { type: 'unchanged' } }}
      />
    );
    expect(screen.getByText('READ ACCOUNT')).toBeInTheDocument();
  });
});
