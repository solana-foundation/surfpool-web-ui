'use client';

import React, { useMemo, useState } from 'react';
import { TransactionDetailPanel } from './transaction-profile-components';
import {
  getInterestingLogPreview,
  getInstanceSummary,
  getMergedTransactionProfile,
  getProgramName,
  getReportSummary,
  getTransactionComputeUnits,
  getTransactionPrograms,
  type SurfnetReportData,
  type SurfpoolReport,
  type TransactionReportEntry,
} from './lib/transaction-profile-utils';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
};

const shortSignature = (signature: string) => {
  if (signature.length <= 18) {
    return signature;
  }

  return `${signature.slice(0, 8)}..${signature.slice(-8)}`;
};

const DetailModal: React.FC<{
  instance: SurfnetReportData;
  entry: TransactionReportEntry;
  onClose: () => void;
}> = ({ instance, entry, onClose }) => {
  const profile = useMemo(() => getMergedTransactionProfile(entry), [entry]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-6 backdrop-blur-sm">
      <button type="button" aria-label="Close report detail" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative z-10 my-8 w-full max-w-6xl rounded-[2rem] border border-zinc-800 bg-[#09090c] shadow-[0_40px_160px_rgba(0,0,0,0.55)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-[2rem] border-b border-zinc-800 bg-[#09090c]/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.28em] text-cyan-300/80">TRANSACTION DETAIL</div>
            <h2 className="mt-2 text-lg font-semibold text-white">{instance.test_name || 'Unnamed test instance'}</h2>
            <p className="mt-1 text-sm text-zinc-500">{entry.signature}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-b-[2rem] px-6 py-6">
          <TransactionDetailPanel entry={entry} profile={profile} rpcUrl={instance.rpc_url} />
        </div>
      </div>
    </div>
  );
};

const TransactionRow: React.FC<{
  entry: TransactionReportEntry;
  onSelect: () => void;
}> = ({ entry, onSelect }) => {
  const computeUnits = getTransactionComputeUnits(entry);
  const programs = getTransactionPrograms(entry);
  const logPreview = getInterestingLogPreview(entry);

  return (
    <tr
      className="cursor-pointer border-b border-zinc-900/70 transition hover:bg-cyan-500/5"
      onClick={onSelect}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${entry.error ? 'bg-rose-400' : 'bg-emerald-400'}`} />
          <span className="font-mono text-sm text-cyan-100">{shortSignature(entry.signature)}</span>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-zinc-400">{entry.slot.toLocaleString()}</td>
      <td className="px-4 py-3 font-mono text-sm text-cyan-100">
        {computeUnits > 0 ? computeUnits.toLocaleString() : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {programs.length > 0 ? (
            programs.map((program) => (
              <span
                key={program}
                className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-[10px] font-semibold tracking-[0.18em] text-zinc-300"
              >
                {getProgramName(program)}
              </span>
            ))
          ) : (
            <span className="text-sm text-zinc-600">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-500">{logPreview || '—'}</td>
    </tr>
  );
};

const InstanceCard: React.FC<{
  instance: SurfnetReportData;
  defaultOpen?: boolean;
  onSelectTransaction: (instance: SurfnetReportData, entry: TransactionReportEntry) => void;
}> = ({ instance, defaultOpen = false, onSelectTransaction }) => {
  const summary = getInstanceSummary(instance);

  return (
    <details
      open={defaultOpen}
      className="overflow-hidden rounded-[1.8rem] border border-zinc-800 bg-black/35 shadow-[0_16px_48px_rgba(0,0,0,0.18)]"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-5 py-5 marker:hidden">
        <div>
          <div className="text-lg font-semibold text-white">{instance.test_name || 'Unnamed test instance'}</div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>{formatDateTime(instance.timestamp)}</span>
            <span className="font-mono">{instance.instance_id}</span>
            <span className="font-mono">{instance.rpc_url}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-[10px] font-semibold tracking-[0.22em]">
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-300">
            {summary.transactions} TX
          </span>
          <span
            className={`rounded-full border px-3 py-2 ${summary.failed > 0 ? 'border-rose-500/20 bg-rose-500/10 text-rose-200' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'}`}
          >
            {summary.failed > 0 ? `${summary.failed} FAILED` : 'PASS'}
          </span>
          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-cyan-100">
            {summary.computeUnits.toLocaleString()} CU
          </span>
        </div>
      </summary>
      <div className="border-t border-zinc-800/80">
        {instance.transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-zinc-950/70">
                <tr className="text-left text-[10px] font-semibold tracking-[0.24em] text-zinc-500">
                  <th className="px-4 py-3">Signature</th>
                  <th className="px-4 py-3">Slot</th>
                  <th className="px-4 py-3">Compute</th>
                  <th className="px-4 py-3">Programs</th>
                  <th className="px-4 py-3">Logs</th>
                </tr>
              </thead>
              <tbody>
                {instance.transactions.map((entry) => (
                  <TransactionRow
                    key={entry.signature}
                    entry={entry}
                    onSelect={() => onSelectTransaction(instance, entry)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">No transactions recorded for this Surfnet instance.</div>
        )}
      </div>
    </details>
  );
};

export const SurfpoolReportViewer: React.FC<{ report: SurfpoolReport }> = ({ report }) => {
  const summary = useMemo(() => getReportSummary(report), [report]);
  const [selected, setSelected] = useState<{
    instance: SurfnetReportData;
    entry: TransactionReportEntry;
  } | null>(null);

  return (
    <div className="min-h-screen bg-[#06070a] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="px-1 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            <span className="text-cyan-400">surfpool</span>{' '}
            <span className="text-zinc-100">report</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-zinc-500">
            <span>{summary.tests} tests</span>
            <span className="text-zinc-700">•</span>
            <span>{summary.transactions} transactions</span>
            <span className="text-zinc-700">•</span>
            <span>{report.generated_at}</span>
          </div>
        </header>

        <section className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-[#0a0c10]/90 px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Tests</div>
            <div className="mt-1.5 text-xl font-semibold tracking-tight text-cyan-400">{summary.tests}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0a0c10]/90 px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Transactions</div>
            <div className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-100">{summary.transactions}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0a0c10]/90 px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Failed</div>
            <div className={`mt-1.5 text-xl font-semibold tracking-tight ${summary.failed > 0 ? 'text-rose-300' : 'text-zinc-100'}`}>
              {summary.failed}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0a0c10]/90 px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">Total CU</div>
            <div className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-100">{summary.computeUnits.toLocaleString()}</div>
          </div>
        </section>

        <main className="mt-6 space-y-4 pb-12">
          {report.instances.map((instance, index) => (
            <InstanceCard
              key={instance.instance_id}
              instance={instance}
              defaultOpen={index === 0}
              onSelectTransaction={(selectedInstance, entry) => setSelected({ instance: selectedInstance, entry })}
            />
          ))}
        </main>
      </div>

      {selected && (
        <DetailModal instance={selected.instance} entry={selected.entry} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

export default SurfpoolReportViewer;
