import { createPumpSwapPriceShockScenario } from '@/lib/scenarios-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PumpSwapPriceShockDialog from './pump-swap-price-shock-dialog';

vi.mock('@/lib/scenarios-api', () => ({
  createPumpSwapPriceShockScenario: vi.fn(),
}));

vi.mock('@surfpool/ui', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogActions: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  Input: (props: any) => <input {...props} />,
}));

const createScenarioMock = vi.mocked(createPumpSwapPriceShockScenario);

afterEach(() => {
  vi.clearAllMocks();
});

describe('PumpSwapPriceShockDialog', () => {
  it('creates a validated price shock scenario', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({
      id: 'scenario-id',
      tokenMint: 'MigratedMintpump',
      canonicalPool: 'pool',
      virtualQuoteReserves: '15000000000000',
    });
    render(<PumpSwapPriceShockDialog open studioUrl="http://studio" onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('Token mint'), { target: { value: ' MigratedMintpump ' } });
    fireEvent.change(screen.getByLabelText('Virtual quote reserves'), { target: { value: '15000000000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => {
      expect(createScenarioMock).toHaveBeenCalledWith('http://studio', ' MigratedMintpump ', '15000000000000');
      expect(onCreated).toHaveBeenCalledWith('scenario-id');
    });
  });

  it('rejects a zero reserve amount before calling the backend', () => {
    render(<PumpSwapPriceShockDialog open studioUrl="http://studio" onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Token mint'), { target: { value: 'MigratedMintpump' } });
    fireEvent.change(screen.getByLabelText('Virtual quote reserves'), { target: { value: '0' } });

    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled();
    expect(createScenarioMock).not.toHaveBeenCalled();
  });

  it('shows backend validation errors', async () => {
    createScenarioMock.mockRejectedValue(new Error('Canonical PumpSwap pool not found'));
    render(<PumpSwapPriceShockDialog open studioUrl="http://studio" onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Token mint'), { target: { value: 'LegacyMintpump' } });
    fireEvent.change(screen.getByLabelText('Virtual quote reserves'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    expect(await screen.findByText('Canonical PumpSwap pool not found')).toBeInTheDocument();
  });
});
