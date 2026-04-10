import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SurfpoolReportViewer from './report-viewer';
import type { SurfpoolReport } from './lib/transaction-profile-utils';

const reportFixture: SurfpoolReport = {
  generated_at: '2026-04-03T12:00:00Z',
  instances: [
    {
      instance_id: 'instance-a',
      test_name: 'sdk::report_viewer',
      rpc_url: 'http://127.0.0.1:8899',
      timestamp: '2026-04-03T12:00:00Z',
      transactions: [
        {
          signature: '5N7K6F6C9p9wW4mTnW8a3yM4i6AqZfFXE3R4G5H6J7K8L9M1N2P3Q4R5S6T7U8V9',
          slot: 42,
          error: null,
          logs: ['Program 11111111111111111111111111111111 invoke [1]', 'Program log: transfer complete'],
          profile_json_parsed: {
            slot: 42,
            transactionProfile: {
              computeUnitsConsumed: 3300,
              accountStates: {},
              logMessages: [],
              errorMessage: null,
            },
            instructionProfiles: [
              {
                computeUnitsConsumed: 3300,
                logMessages: ['Program 11111111111111111111111111111111 invoke [1]', 'Program log: transfer complete'],
                errorMessage: null,
                accountStates: {},
              },
            ],
            readonlyAccountStates: {},
          },
          profile_base64: {
            slot: 42,
            transactionProfile: {
              computeUnitsConsumed: 3300,
              accountStates: {},
            },
            instructionProfiles: [
              {
                computeUnitsConsumed: 3300,
                logMessages: ['Program 11111111111111111111111111111111 invoke [1]'],
                errorMessage: null,
                accountStates: {},
              },
            ],
            readonlyAccountStates: {},
          },
        },
      ],
    },
  ],
};

describe('SurfpoolReportViewer', () => {
  it('renders summary cards and transaction rows', () => {
    render(<SurfpoolReportViewer report={reportFixture} />);

    expect(screen.getByRole('heading', { name: 'surfpool report' })).toBeInTheDocument();
    expect(screen.getByText('sdk::report_viewer')).toBeInTheDocument();
    expect(screen.getByText('1 tests')).toBeInTheDocument();
    expect(screen.getByText('1 transactions')).toBeInTheDocument();
    expect(screen.getByText(reportFixture.generated_at)).toBeInTheDocument();
    expect(screen.getByText('transfer complete')).toBeInTheDocument();
  });

  it('opens and closes the transaction detail modal', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<SurfpoolReportViewer report={reportFixture} />);

    fireEvent.click(screen.getByText(/5N7K6F6C/i));

    expect(screen.getByText('TRANSACTION DETAIL')).toBeInTheDocument();
    expect(screen.getAllByText('Program log: transfer complete').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('TRANSACTION DETAIL')).not.toBeInTheDocument();
    openSpy.mockRestore();
  });
});
