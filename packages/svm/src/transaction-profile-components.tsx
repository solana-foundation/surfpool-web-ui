'use client';

import React, { useId, useMemo, useState } from 'react';
import AddressDisplay from './address-display';
import TokenAmountDisplay from './token-amount-display';
import { truncateAddress as truncateAddressUtil } from './lib/address-utils';
import {
  computeHexDiff,
  extractProgramData,
  findChangedPaths,
  getHexData,
  getProgramName,
  getProgramType,
  hasJsonData,
  type AccountData,
  type AccountState,
  type ReadonlyAccountState,
  type TransactionProfile,
  type TransactionReportEntry,
} from './lib/transaction-profile-utils';

type ViewMode = 'parsed' | 'hex';

const isStructuredAccountJson = (
  value: unknown
): value is { program: string; parsed: Record<string, unknown>; space: number } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.program === 'string' &&
    typeof candidate.parsed === 'object' &&
    candidate.parsed !== null &&
    typeof candidate.space === 'number'
  );
};

interface AddressChipProps {
  address: string;
  rpcUrl?: string;
  aggressiveTruncate?: boolean;
  className?: string;
}

const useCopyState = () => {
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates((current) => ({ ...current, [id]: true }));
      window.setTimeout(() => {
        setCopiedStates((current) => ({ ...current, [id]: false }));
      }, 1500);
    } catch (error) {
      console.error('Failed to copy to clipboard', error);
    }
  };

  return { copiedStates, copyToClipboard };
};

const AddressChip: React.FC<AddressChipProps> = ({
  address,
  rpcUrl,
  aggressiveTruncate = false,
  className,
}) => {
  const { copiedStates, copyToClipboard } = useCopyState();

  return (
    <AddressDisplay
      address={address}
      rpcUrl={rpcUrl}
      copiedStates={copiedStates}
      copyToClipboard={copyToClipboard}
      truncateAddress={truncateAddressUtil}
      copyId={`address-${address}`}
      aggressiveTruncate={aggressiveTruncate}
      className={className}
    />
  );
};

export const LamportsDisplay: React.FC<{ lamports: number; className?: string }> = ({ lamports, className }) => {
  return (
    <TokenAmountDisplay
      amount={lamports}
      decimals={9}
      symbol="SOL"
      className={className}
      variant="badge"
      formatOptions={{
        minimumFractionDigits: 0,
        maximumFractionDigits: 9,
      }}
    />
  );
};

export const LamportsComparison: React.FC<{ beforeLamports: number; afterLamports: number }> = ({
  beforeLamports,
  afterLamports,
}) => {
  const hasChange = beforeLamports !== afterLamports;

  if (!hasChange) {
    return <LamportsDisplay lamports={afterLamports} />;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <LamportsDisplay lamports={beforeLamports} className="border-red-500/30 text-red-300" />
      <span className="text-xs text-zinc-500">→</span>
      <LamportsDisplay lamports={afterLamports} className="border-emerald-500/30 text-emerald-300" />
    </div>
  );
};

export const AccountLabels: React.FC<{ address: string; accountState: AccountState | { type?: string } }> = ({
  address,
  accountState,
}) => {
  const labels: string[] = [];
  const programType = getProgramType(address);
  const changeType = (accountState as AccountState).accountChange?.type ?? accountState.type;

  if (programType) {
    labels.push(programType);
  }

  switch (changeType) {
    case 'create':
      labels.push('NEW ACCOUNT');
      break;
    case 'update':
      labels.push('UPDATED ACCOUNT');
      break;
    case 'delete':
      labels.push('DELETED ACCOUNT');
      break;
    case 'readonly':
    case 'read':
      labels.push('READ ACCOUNT');
      break;
    default:
      break;
  }

  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold tracking-[0.2em] text-cyan-200"
        >
          {label}
        </span>
      ))}
    </div>
  );
};

const FieldRow: React.FC<{ label: string; value: React.ReactNode; highlight?: boolean }> = ({
  label,
  value,
  highlight = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-900/70 px-4 py-3 last:border-b-0">
      <span className={`text-[11px] font-semibold tracking-[0.22em] ${highlight ? 'text-amber-300' : 'text-zinc-500'}`}>
        {label}
      </span>
      <div className="text-right text-xs text-zinc-200">{value}</div>
    </div>
  );
};

const PrettyJsonBlock: React.FC<{ value: unknown; highlightPaths?: Set<string> }> = ({ value, highlightPaths }) => {
  const jsonString = useMemo(() => {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  const lines = jsonString.split('\n');

  return (
    <pre className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 font-mono text-[11px] leading-6 text-zinc-200">
      {lines.map((line, index) => {
        const match = /"([^"]+)"\s*:/.exec(line);
        const path = match?.[1];
        const isChanged = path ? Array.from(highlightPaths ?? []).some((candidate) => candidate.endsWith(path)) : false;
        return (
          <div key={`${path ?? 'line'}-${index}`} className={isChanged ? 'bg-amber-500/10 text-amber-100' : undefined}>
            {line}
          </div>
        );
      })}
    </pre>
  );
};

const HexBlock: React.FC<{ html: string }> = ({ html }) => {
  if (html === '<none>') {
    return <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-500">No byte data</div>;
  }

  return (
    <div
      className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 font-mono text-[11px] leading-6 text-zinc-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const byteArrayFromData = (data: unknown): number[] => {
  if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
    return data as number[];
  }

  if (typeof data === 'object' && data !== null) {
    const value = data as Record<string, unknown>;
    if (Array.isArray(value.bytes) && value.bytes.every((item) => typeof item === 'number')) {
      return value.bytes as number[];
    }

    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        return Array.from(atob(String(data[0]))).map((char) => char.charCodeAt(0));
      } catch {
        return [];
      }
    }
  }

  return Array.from(String(data ?? '')).map((char) => char.charCodeAt(0));
};

const DiffHexBlock: React.FC<{ beforeData: unknown; afterData: unknown }> = ({ beforeData, afterData }) => {
  const beforeBytes = byteArrayFromData(beforeData);
  const afterBytes = byteArrayFromData(afterData);
  const { beforeDiffMap, afterDiffMap } = computeHexDiff(beforeBytes, afterBytes);

  const render = (
    bytes: number[],
    diffMap: Map<number, { type: 'removal' | 'addition' | 'update'; range?: { start: number; end: number } }>,
    additionClass: string
  ) => {
    const lines: string[] = [];

    for (let offset = 0; offset < bytes.length; offset += 16) {
      const lineBytes = bytes.slice(offset, offset + 16);
      const renderedBytes = lineBytes
        .map((byte, index) => {
          const diff = diffMap.get(offset + index);
          const className =
            diff?.type === 'update'
              ? 'bg-amber-500/15 text-amber-100'
              : diff
                ? additionClass
                : '';
          const value = byte.toString(16).padStart(2, '0').toUpperCase();
          return className ? `<span class="${className}">${value}</span>` : `<span>${value}</span>`;
        })
        .join('');

      lines.push(`${offset.toString(16).padStart(4, '0').toUpperCase()}: <span class="hex-grid">${renderedBytes}</span>`);
    }

    return lines.join('\n');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div>
        <div className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-zinc-500">BEFORE</div>
        <HexBlock html={render(beforeBytes, beforeDiffMap as any, 'bg-rose-500/15 text-rose-100')} />
      </div>
      <div>
        <div className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-zinc-500">AFTER</div>
        <HexBlock html={render(afterBytes, afterDiffMap as any, 'bg-emerald-500/15 text-emerald-100')} />
      </div>
    </div>
  );
};

const AccountDataBlock: React.FC<{ data: unknown }> = ({ data }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(hasJsonData(data) ? 'parsed' : 'hex');
  const parsed = extractProgramData(data);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500">ACCOUNT DATA</div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('parsed')}
            className={viewMode === 'parsed' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}
          >
            Pretty
          </button>
          <span className="text-zinc-700">|</span>
          <button
            type="button"
            onClick={() => setViewMode('hex')}
            className={viewMode === 'hex' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}
          >
            Hex
          </button>
        </div>
      </div>
      {viewMode === 'parsed' && hasJsonData(data) ? (
        <PrettyJsonBlock value={parsed} />
      ) : (
        <HexBlock html={getHexData(data)} />
      )}
    </div>
  );
};

const AccountDataDiffBlock: React.FC<{ beforeData: unknown; afterData: unknown }> = ({ beforeData, afterData }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(
    hasJsonData(beforeData) || hasJsonData(afterData) ? 'parsed' : 'hex'
  );
  const beforeParsed = extractProgramData(beforeData);
  const afterParsed = extractProgramData(afterData);
  const changedPaths = useMemo(() => findChangedPaths(beforeParsed, afterParsed), [beforeParsed, afterParsed]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500">ACCOUNT DATA</div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('parsed')}
            className={viewMode === 'parsed' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}
          >
            Pretty
          </button>
          <span className="text-zinc-700">|</span>
          <button
            type="button"
            onClick={() => setViewMode('hex')}
            className={viewMode === 'hex' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}
          >
            Hex
          </button>
        </div>
      </div>
      {viewMode === 'parsed' && (hasJsonData(beforeData) || hasJsonData(afterData)) ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <div className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-zinc-500">BEFORE</div>
            <PrettyJsonBlock value={beforeParsed} highlightPaths={changedPaths} />
          </div>
          <div>
            <div className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-zinc-500">AFTER</div>
            <PrettyJsonBlock value={afterParsed} highlightPaths={changedPaths} />
          </div>
        </div>
      ) : (
        <DiffHexBlock beforeData={beforeData} afterData={afterData} />
      )}
    </div>
  );
};

const AccountDetailsCard: React.FC<{
  address: string;
  accountData: AccountData;
  accountType: 'create' | 'delete' | 'read';
  rpcUrl?: string;
}> = ({ address, accountData, accountType, rpcUrl }) => {
  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-zinc-800 bg-zinc-950/70">
      <FieldRow
        label={accountType === 'delete' ? 'LAMPORTS REMOVED' : accountType === 'read' ? 'LAMPORTS' : 'LAMPORTS ADDED'}
        value={<LamportsDisplay lamports={accountData.lamports} />}
      />
      <FieldRow label="OWNER" value={<AddressChip address={accountData.owner} rpcUrl={rpcUrl} aggressiveTruncate />} />
      <div className="space-y-3 px-4 py-4">
        <AccountLabels
          address={address}
          accountState={
            accountType === 'read'
              ? { type: 'readonly' }
              : {
                  type: 'writable',
                  accountChange: { type: accountType },
                }
          }
        />
        {!accountData.executable && <AccountDataBlock data={accountData} />}
      </div>
    </div>
  );
};

const UpdateAccountDetailsCard: React.FC<{ address: string; accountData: AccountData[]; rpcUrl?: string }> = ({
  address,
  accountData,
  rpcUrl,
}) => {
  const [beforeData, afterData] = accountData;
  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-zinc-800 bg-zinc-950/70">
      <FieldRow
        label="LAMPORTS"
        value={<LamportsComparison beforeLamports={beforeData.lamports} afterLamports={afterData.lamports} />}
        highlight={beforeData.lamports !== afterData.lamports}
      />
      <FieldRow
        label="OWNER"
        value={
          <div className="flex items-center gap-2">
            <AddressChip address={beforeData.owner} rpcUrl={rpcUrl} aggressiveTruncate />
            {beforeData.owner !== afterData.owner && <span className="text-zinc-500">→</span>}
            {beforeData.owner !== afterData.owner && <AddressChip address={afterData.owner} rpcUrl={rpcUrl} aggressiveTruncate />}
            {beforeData.owner === afterData.owner && <span className="text-zinc-500">unchanged</span>}
          </div>
        }
        highlight={beforeData.owner !== afterData.owner}
      />
      <div className="space-y-3 px-4 py-4">
        <AccountLabels
          address={address}
          accountState={{
            type: 'writable',
            accountChange: { type: 'update' },
          }}
        />
        {!beforeData.executable && !afterData.executable && (
          <AccountDataDiffBlock beforeData={beforeData} afterData={afterData} />
        )}
      </div>
    </div>
  );
};

const AccountChangeCard: React.FC<{ address: string; state: AccountState; rpcUrl?: string }> = ({
  address,
  state,
  rpcUrl,
}) => {
  const accountChange = state.accountChange;
  const summaryId = useId();

  if (!accountChange || accountChange.type === 'unchanged') {
    return null;
  }

  return (
    <details className="overflow-hidden rounded-[1.3rem] border border-zinc-800/80 bg-black/30">
      <summary
        id={summaryId}
        className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden"
      >
        <div className="space-y-2">
          <AccountLabels address={address} accountState={state} />
          <AddressChip address={address} rpcUrl={rpcUrl} />
        </div>
        <span className="text-[11px] font-semibold tracking-[0.22em] text-zinc-500">{accountChange.type}</span>
      </summary>
      <div className="border-t border-zinc-800/70 p-4">
        {accountChange.type === 'update' && Array.isArray(accountChange.data) ? (
          <UpdateAccountDetailsCard address={address} accountData={accountChange.data} rpcUrl={rpcUrl} />
        ) : null}
        {accountChange.type === 'create' && !Array.isArray(accountChange.data) && accountChange.data ? (
          <AccountDetailsCard address={address} accountData={accountChange.data} accountType="create" rpcUrl={rpcUrl} />
        ) : null}
        {accountChange.type === 'delete' && !Array.isArray(accountChange.data) && accountChange.data ? (
          <AccountDetailsCard address={address} accountData={accountChange.data} accountType="delete" rpcUrl={rpcUrl} />
        ) : null}
      </div>
    </details>
  );
};

const ReadonlyAccountCard: React.FC<{ address: string; accountState: ReadonlyAccountState; rpcUrl?: string }> = ({
  address,
  accountState,
  rpcUrl,
}) => {
  const normalizedAccountData: AccountData = {
    lamports: accountState.lamports,
    owner: accountState.owner,
    executable: accountState.executable,
    rentEpoch: accountState.rentEpoch,
    space: accountState.space,
    data: accountState.data,
    json:
      Array.isArray(accountState.data) && typeof accountState.data[1] === 'string'
        ? undefined
        : isStructuredAccountJson(accountState.json)
          ? accountState.json
          : undefined,
    bytes:
      accountState.bytes ??
      (Array.isArray(accountState.data) && accountState.data.every((item) => typeof item === 'number')
        ? accountState.data
        : undefined),
  };

  return (
    <details className="overflow-hidden rounded-[1.3rem] border border-zinc-800/80 bg-black/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden">
        <div className="space-y-2">
          <AccountLabels address={address} accountState={{ type: 'readonly' }} />
          <AddressChip address={address} rpcUrl={rpcUrl} />
        </div>
        <LamportsDisplay lamports={accountState.lamports} />
      </summary>
      <div className="border-t border-zinc-800/70 p-4">
        <AccountDetailsCard address={address} accountData={normalizedAccountData} accountType="read" rpcUrl={rpcUrl} />
      </div>
    </details>
  );
};

export const LogsBlock: React.FC<{ logs: string[]; title?: string; className?: string }> = ({
  logs,
  title = 'PROGRAM LOGS',
  className = '',
}) => {
  if (logs.length === 0) {
    return null;
  }

  const getClassName = (line: string) => {
    const lowered = line.toLowerCase();
    if (lowered.includes('failed') || lowered.includes('error')) {
      return 'text-rose-300';
    }
    if (lowered.includes('success')) {
      return 'text-emerald-300';
    }
    if (line.startsWith('Program log:')) {
      return 'text-cyan-200';
    }
    return 'text-zinc-400';
  };

  return (
    <div className={`rounded-[1.4rem] border border-zinc-800 bg-zinc-950/80 p-4 ${className}`}>
      <div className="mb-3 text-[10px] font-semibold tracking-[0.22em] text-zinc-500">{title}</div>
      <div className="max-h-80 overflow-y-auto space-y-2 font-mono text-[11px]">
        {logs.map((line, index) => (
          <div key={`${line}-${index}`} className={getClassName(line)}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};

export const ComputeUnitBar: React.FC<{ values: number[] }> = ({ values }) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  const colors = ['bg-cyan-400', 'bg-emerald-400', 'bg-amber-400', 'bg-fuchsia-400', 'bg-orange-400', 'bg-sky-400'];

  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-900">
        {values.map((value, index) => (
          <div
            key={`${value}-${index}`}
            className={colors[index % colors.length]}
            style={{ width: `${Math.max((value / total) * 100, 3)}%` }}
            title={`Instruction ${index + 1}: ${value.toLocaleString()} CU`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-zinc-400">
        {values.map((value, index) => (
          <div key={`${value}-label-${index}`} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${colors[index % colors.length]}`} />
            <span>{`Ix ${index + 1}: ${value.toLocaleString()} CU`}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const InstructionProfileCard: React.FC<{
  index: number;
  instruction: TransactionProfile['instructionProfiles'][number];
  programId?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  headerExtras?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ index, instruction, programId, defaultOpen = false, open, onToggle, headerExtras, children }) => {
  const changedAccounts = Object.entries(instruction.accountStates ?? {}).filter(([, state]) => {
    return state.accountChange && state.accountChange.type !== 'unchanged';
  });

  const invokedProgram =
    programId ??
    instruction.logMessages
      .find((line) => /^Program \w+ invoke \[1\]/.test(line))
      ?.match(/^Program (\w+)/)?.[1];

  return (
    <details open={open ?? defaultOpen} className="overflow-hidden rounded-[1.55rem] border border-zinc-800 bg-black/30">
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden"
        onClick={
          onToggle
            ? (event) => {
                event.preventDefault();
                onToggle();
              }
            : undefined
        }
      >
        <div>
          <div className="text-sm font-semibold text-zinc-100">Instruction {index + 1}</div>
          {invokedProgram && <div className="mt-1 text-xs text-zinc-500">{getProgramName(invokedProgram)}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
            {instruction.computeUnitsConsumed.toLocaleString()} CU
          </span>
          {changedAccounts.length > 0 && (
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-amber-200">
              {changedAccounts.length} changed
            </span>
          )}
          {headerExtras}
        </div>
      </summary>
      <div className="space-y-4 border-t border-zinc-800/70 p-5">{children}</div>
    </details>
  );
};

const InstructionCard: React.FC<{ index: number; instruction: TransactionProfile['instructionProfiles'][number]; rpcUrl?: string }> = ({
  index,
  instruction,
  rpcUrl,
}) => {
  const changedAccounts = Object.entries(instruction.accountStates ?? {}).filter(([, state]) => {
    return state.accountChange && state.accountChange.type !== 'unchanged';
  });

  return (
    <InstructionProfileCard index={index} instruction={instruction} defaultOpen={index < 2}>
        <LogsBlock logs={instruction.logMessages} />
        {changedAccounts.length > 0 ? (
          <div className="space-y-3">
            {changedAccounts.map(([address, state]) => (
              <AccountChangeCard key={address} address={address} state={state} rpcUrl={rpcUrl} />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-500">
            No account changes recorded for this instruction.
          </div>
        )}
    </InstructionProfileCard>
  );
};

export const TransactionDetailPanel: React.FC<{
  entry: TransactionReportEntry;
  profile: TransactionProfile | null;
  rpcUrl?: string;
}> = ({ entry, profile, rpcUrl }) => {
  const instructionValues = profile?.instructionProfiles?.map((instruction) => instruction.computeUnitsConsumed) ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-[1.75rem] border border-zinc-800 bg-black/40 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldRow label="SIGNATURE" value={<AddressChip address={entry.signature} rpcUrl={rpcUrl} className="justify-end" />} />
          <FieldRow label="SLOT" value={<span className="font-mono">{entry.slot.toLocaleString()}</span>} />
          <FieldRow
            label="STATUS"
            value={
              <span className={entry.error ? 'font-semibold text-rose-300' : 'font-semibold text-emerald-300'}>
                {entry.error ? 'FAILED' : 'SUCCESS'}
              </span>
            }
          />
          <FieldRow
            label="COMPUTE UNITS"
            value={<span className="font-mono">{(profile?.transactionProfile.computeUnitsConsumed ?? 0).toLocaleString()}</span>}
          />
        </div>
        {entry.error && (
          <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            {entry.error}
          </div>
        )}
      </div>

      {instructionValues.length > 0 && (
        <div className="rounded-[1.75rem] border border-zinc-800 bg-black/40 p-5">
          <div className="mb-4 text-[10px] font-semibold tracking-[0.22em] text-zinc-500">COMPUTE UNIT BREAKDOWN</div>
          <ComputeUnitBar values={instructionValues} />
        </div>
      )}

      {profile?.instructionProfiles?.length ? (
        <div className="space-y-4">
          {profile.instructionProfiles.map((instruction, index) => (
            <InstructionCard key={`instruction-${index}`} index={index} instruction={instruction} rpcUrl={rpcUrl} />
          ))}
        </div>
      ) : null}

      {profile?.readonlyAccountStates && Object.keys(profile.readonlyAccountStates).length > 0 && (
        <div className="space-y-4 rounded-[1.75rem] border border-zinc-800 bg-black/40 p-5">
          <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-500">READONLY ACCOUNTS</div>
          {Object.entries(profile.readonlyAccountStates).map(([address, accountState]) => (
            <ReadonlyAccountCard key={address} address={address} accountState={accountState} rpcUrl={rpcUrl} />
          ))}
        </div>
      )}

      <LogsBlock logs={entry.logs} />
    </div>
  );
};
