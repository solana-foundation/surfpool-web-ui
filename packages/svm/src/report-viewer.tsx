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
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-800 bg-[#09090c]/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.28em] text-cyan-300/80">TRANSACTION DETAIL</div>
            <h2 className="mt-2 text-lg font-semibold text-white">{instance.test_name || 'Unnamed test instance'}</h2>
            <p className="mt-1 text-sm text-zinc-500">{entry.signature}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            CLOSE
          </button>
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-6">
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
        <header className="relative overflow-hidden rounded-[2rem] border border-cyan-500/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_42%),linear-gradient(135deg,rgba(14,17,25,0.96),rgba(8,8,12,0.98))] px-6 py-8 shadow-[0_30px_100px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
          <div className="text-[11px] font-semibold tracking-[0.34em] text-cyan-200/85">SURFPOOL REPORT</div>
          <div className="mt-4 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Static transaction forensics for Surfnet test runs
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
              Consolidated instance reports, transaction timelines, compute-unit breakdowns, account diffs, and raw
              byte inspection in one static artifact.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
            <span>Generated {formatDateTime(report.generated_at)}</span>
            <span>{summary.tests} test instances</span>
            <span>{summary.transactions} transactions</span>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.5rem] border border-zinc-800 bg-black/35 p-5">
            <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500">TESTS</div>
            <div className="mt-3 text-3xl font-semibold text-cyan-100">{summary.tests}</div>
          </div>
          <div className="rounded-[1.5rem] border border-zinc-800 bg-black/35 p-5">
            <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500">TRANSACTIONS</div>
            <div className="mt-3 text-3xl font-semibold text-white">{summary.transactions}</div>
          </div>
          <div className="rounded-[1.5rem] border border-zinc-800 bg-black/35 p-5">
            <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500">FAILED</div>
            <div className={`mt-3 text-3xl font-semibold ${summary.failed > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
              {summary.failed}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-zinc-800 bg-black/35 p-5">
            <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500">COMPUTE UNITS</div>
            <div className="mt-3 text-3xl font-semibold text-cyan-100">{summary.computeUnits.toLocaleString()}</div>
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
