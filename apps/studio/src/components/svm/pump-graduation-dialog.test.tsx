import { createPumpGraduationScenario } from '@/lib/scenarios-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PumpGraduationDialog from './pump-graduation-dialog';

vi.mock('@/lib/scenarios-api', () => ({
  createPumpGraduationScenario: vi.fn(),
}));

vi.mock('@surfpool/ui', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogActions: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  Input: (props: any) => <input {...props} />,
}));

const createScenarioMock = vi.mocked(createPumpGraduationScenario);

afterEach(() => {
  vi.clearAllMocks();
});

describe('PumpGraduationDialog', () => {
  it('creates a preset for a custom mint without an LLM', async () => {
    const onCreated = vi.fn();
    createScenarioMock.mockResolvedValue({
      id: 'scenario-id',
      tokenMint: 'CustomMintpump',
      completingBuyAmount: 10,
      migrationReserve: 20,
      addresses: { bondingCurve: 'curve', curveVault: 'vault', canonicalPool: 'pool' },
    });
    render(<PumpGraduationDialog open studioUrl="http://studio" onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('Pump token mint'), { target: { value: ' CustomMintpump ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    await waitFor(() => {
      expect(createScenarioMock).toHaveBeenCalledWith('http://studio', 'CustomMintpump');
      expect(onCreated).toHaveBeenCalledWith('scenario-id');
    });
  });

  it('shows backend validation errors', async () => {
    createScenarioMock.mockRejectedValue(new Error('Bonding curve is already complete'));
    render(<PumpGraduationDialog open studioUrl="http://studio" onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Pump token mint'), { target: { value: 'GraduatedMintpump' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create scenario' }));

    expect(await screen.findByText('Bonding curve is already complete')).toBeInTheDocument();
  });
});
