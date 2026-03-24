import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Stat } from './stat';

describe('Stat', () => {
  it('renders title and value', () => {
    render(<Stat title="Total Transactions" value="1,234" />);
    expect(screen.getByText('Total Transactions')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders with different values', () => {
    render(<Stat title="Slot" value="42" />);
    expect(screen.getByText('Slot')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders empty value', () => {
    render(<Stat title="Balance" value="" />);
    expect(screen.getByText('Balance')).toBeInTheDocument();
  });
});
