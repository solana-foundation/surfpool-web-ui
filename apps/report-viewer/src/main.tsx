import React from 'react';
import ReactDOM from 'react-dom/client';
import SurfpoolReportViewer from '@surfpool/svm/report-viewer';
import type { SurfpoolReport } from '@surfpool/svm/transaction-profile-utils';
import './index.css';

const REPORT_PLACEHOLDER = '__SURFPOOL_REPORT_DATA_PLACEHOLDER__';

const parseReport = (): SurfpoolReport => {
  const raw = document.getElementById('__SURFPOOL_REPORT_DATA__')?.textContent?.trim();

  if (!raw || raw === REPORT_PLACEHOLDER) {
    return {
      generated_at: new Date().toISOString(),
      instances: [],
    };
  }

  return JSON.parse(raw) as SurfpoolReport;
};

const report = parseReport();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SurfpoolReportViewer report={report} />
  </React.StrictMode>
);
