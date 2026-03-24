import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TokenAmountDisplay from './token-amount-display';

describe('TokenAmountDisplay', () => {
  it('renders formatted amount with symbol', () => {
    render(<TokenAmountDisplay amount={1000000000} decimals={9} symbol="SOL" />);
    expect(screen.getByText('1 SOL')).toBeInTheDocument();
  });

  it('hides symbol when showSymbol is false', () => {
    render(<TokenAmountDisplay amount={1000000000} decimals={9} symbol="SOL" showSymbol={false} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('SOL')).not.toBeInTheDocument();
  });

  it('renders zero amount', () => {
    render(<TokenAmountDisplay amount={0} decimals={9} symbol="SOL" />);
    expect(screen.getByText('0 SOL')).toBeInTheDocument();
  });

  it('renders fractional amounts', () => {
    render(<TokenAmountDisplay amount={500000000} decimals={9} symbol="SOL" />);
    expect(screen.getByText('0.5 SOL')).toBeInTheDocument();
  });

  it('respects formatOptions', () => {
    render(
      <TokenAmountDisplay
        amount={1000000000}
        decimals={9}
        symbol="SOL"
        formatOptions={{ minimumFractionDigits: 2 }}
      />
    );
    expect(screen.getByText('1.00 SOL')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    const { container } = render(
      <TokenAmountDisplay amount={1000000000} decimals={9} symbol="SOL" />
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-base');
    expect(span?.className).toContain('font-mono');
  });

  it('applies compact variant classes', () => {
    const { container } = render(
      <TokenAmountDisplay amount={1000000000} decimals={9} symbol="SOL" variant="compact" />
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-sm');
  });

  it('applies badge variant classes', () => {
    const { container } = render(
      <TokenAmountDisplay amount={1000000000} decimals={9} symbol="SOL" variant="badge" />
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-[12px]');
    expect(span?.className).toContain('rounded');
  });

  it('applies custom className', () => {
    const { container } = render(
      <TokenAmountDisplay amount={1000000000} decimals={9} symbol="SOL" className="my-custom" />
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('my-custom');
  });

  it('formats large amounts with grouping', () => {
    render(<TokenAmountDisplay amount={1000000000000} decimals={9} symbol="SOL" />);
    expect(screen.getByText('1,000 SOL')).toBeInTheDocument();
  });
});
