'use client';

import React, { createContext, useContext, useId, useMemo, useState } from 'react';
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

const ExplorerButtonContext = createContext(true);

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
  showExplorerButton?: boolean;
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
  showExplorerButton,
  className,
}) => {
  const { copiedStates, copyToClipboard } = useCopyState();
  const contextShowExplorer = useContext(ExplorerButtonContext);

  return (
    <AddressDisplay
      address={address}
      rpcUrl={rpcUrl}
      copiedStates={copiedStates}
      copyToClipboard={copyToClipboard}
      truncateAddress={truncateAddressUtil}
      copyId={`address-${address}`}
      aggressiveTruncate={aggressiveTruncate}
      showExplorerButton={showExplorerButton ?? contextShowExplorer}
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

const checkIsExecutable = (
  address: string,
  accountState: AccountState | { type?: string },
  hasChanges: boolean,
  transactionProfile?: TransactionProfile | null,
  selectedTransaction?: { transaction?: { message?: { instructions?: Array<{ programId?: string }> } } } | null,
): boolean => {
  let isExec = false;

  if (hasChanges && (accountState as AccountState).accountChange?.data) {
    const changeData = (accountState as AccountState).accountChange!.data;
    if (Array.isArray(changeData)) {
      isExec = (changeData[0] as AccountData)?.executable || (changeData[1] as AccountData)?.executable;
    } else if (changeData) {
      isExec = (changeData as AccountData).executable;
    }
  } else if (
    !hasChanges &&
    transactionProfile?.readonlyAccountStates?.[address]
  ) {
    isExec = transactionProfile.readonlyAccountStates[address].executable;
  }

  if (!isExec && transactionProfile?.instructionProfiles) {
    for (const instrProfile of transactionProfile.instructionProfiles) {
      if (instrProfile.accountStates?.[address]) {
        const state = instrProfile.accountStates[address];
        if (state.accountChange?.data) {
          if (Array.isArray(state.accountChange.data)) {
            isExec = (state.accountChange.data[0] as AccountData)?.executable || (state.accountChange.data[1] as AccountData)?.executable;
          } else {
            isExec = (state.accountChange.data as AccountData).executable;
          }
        }
        if (isExec) break;
      }
    }
  }

  if (!isExec && selectedTransaction?.transaction?.message?.instructions) {
    for (const instruction of selectedTransaction.transaction.message.instructions) {
      if (instruction.programId === address) {
        isExec = true;
        break;
      }
    }
  }

  return isExec;
};

export const PermissionsBox: React.FC<{
  accountState: AccountState | { type?: string };
  address: string;
  hasChanges: boolean;
  transactionProfile?: TransactionProfile | null;
  selectedTransaction?: { transaction?: { message?: { instructions?: Array<{ programId?: string }> } } } | null;
}> = ({ accountState, address, hasChanges, transactionProfile, selectedTransaction }) => {
  const isExecutable = checkIsExecutable(address, accountState, hasChanges, transactionProfile, selectedTransaction);

  return (
    <div className="mr-3 flex items-center rounded-md bg-clip-border">
      <div className="h-6 rounded-[2px] border border-zinc-600/50 bg-zinc-800/50 font-mono text-xs">
        <span
          className={`inline-block h-full w-6 border-r border-zinc-600/50 text-center ${accountState.type === 'readonly' ? 'bg-zinc-300 text-zinc-900' : 'text-zinc-500'}`}
        >
          R
        </span>
        <span
          className={`inline-block h-full w-6 border-r border-zinc-600/50 text-center ${accountState.type === 'writable' ? 'bg-zinc-300 text-zinc-900' : 'text-zinc-500'}`}
        >
          W
        </span>
        <span
          className={`inline-block h-full w-6 text-center ${isExecutable ? 'bg-zinc-300 text-zinc-900' : 'text-zinc-500'}`}
        >
          X
        </span>
      </div>
    </div>
  );
};

export const AccountLabels: React.FC<{
  address: string;
  accountState: AccountState | { type?: string };
  transactionProfile?: TransactionProfile | null;
  selectedTransaction?: { transaction?: { message?: { instructions?: Array<{ programId?: string }> } } } | null;
}> = ({
  address,
  accountState,
  transactionProfile,
  selectedTransaction,
}) => {
  const changeType = (accountState as AccountState).accountChange?.type ?? accountState.type;
  const hasChanges = changeType === 'create' || changeType === 'update' || changeType === 'delete';
  const isExecutable = checkIsExecutable(address, accountState, hasChanges, transactionProfile, selectedTransaction);
  const programType = getProgramType(address);

  const labels: Array<{ text: string; className: string }> = [];

  if (changeType === 'create') {
    labels.push({ text: 'NEW ACCOUNT', className: 'border-green-500/30 bg-green-900/30 text-green-300' });
  } else if (changeType === 'update') {
    labels.push({ text: 'UPDATED ACCOUNT', className: 'border-yellow-500/30 bg-yellow-900/30 text-yellow-300' });
  } else if (changeType === 'delete') {
    labels.push({ text: 'DELETED ACCOUNT', className: 'border-red-500/30 bg-red-900/30 text-red-300' });
  }

  if (isExecutable && programType) {
    labels.push({ text: programType, className: 'border-gray-400/30 bg-gray-800/30 text-gray-200' });
  } else if (programType) {
    labels.push({ text: programType, className: 'border-gray-400/30 bg-gray-800/30 text-gray-200' });
  }

  if (!hasChanges && !isExecutable && !programType) {
    labels.push({ text: 'READ ACCOUNT', className: 'border-gray-500/30 bg-gray-900/30 text-gray-300' });
  }

  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center">
      {labels.map((label) => (
        <span
          key={label.text}
          className={`mr-2 rounded border px-2 py-0.5 text-[10px] font-medium ${label.className}`}
        >
          {label.text}
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

const DiffHexBlock: React.FC<{
  beforeData: unknown;
  afterData: unknown;
  copyHexButton?: (data: unknown, label: string) => React.ReactNode;
}> = ({ beforeData, afterData, copyHexButton }) => {
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
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold tracking-[0.2em] text-zinc-500">BEFORE</div>
          {copyHexButton?.(beforeData, 'before')}
        </div>
        <HexBlock html={render(beforeBytes, beforeDiffMap as any, 'bg-rose-500/15 text-rose-100')} />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold tracking-[0.2em] text-zinc-500">AFTER</div>
          {copyHexButton?.(afterData, 'after')}
        </div>
        <HexBlock html={render(afterBytes, afterDiffMap as any, 'bg-emerald-500/15 text-emerald-100')} />
      </div>
    </div>
  );
};

const AccountDataBlock: React.FC<{
  data: unknown;
  idlDropZone?: React.ReactNode;
  renderJson?: (data: unknown) => React.ReactNode;
}> = ({ data, idlDropZone, renderJson }) => {
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
        renderJson ? renderJson(parsed) : <PrettyJsonBlock value={parsed} />
      ) : (
        <HexBlock html={getHexData(data)} />
      )}
      {!hasJsonData(data) && idlDropZone}
    </div>
  );
};

const AccountDataDiffBlock: React.FC<{
  beforeData: unknown;
  afterData: unknown;
  idlDropZone?: React.ReactNode;
  renderJsonDiff?: (beforeData: unknown, afterData: unknown) => React.ReactNode;
  copyHexButton?: (data: unknown, label: string) => React.ReactNode;
}> = ({ beforeData, afterData, idlDropZone, renderJsonDiff, copyHexButton }) => {
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
        renderJsonDiff ? renderJsonDiff(beforeParsed, afterParsed) : (
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
        )
      ) : (
        <DiffHexBlock beforeData={beforeData} afterData={afterData} copyHexButton={copyHexButton} />
      )}
      {!hasJsonData(beforeData) && !hasJsonData(afterData) && idlDropZone}
    </div>
  );
};

const AccountDetailsCard: React.FC<{
  address: string;
  accountData: AccountData;
  accountType: 'create' | 'delete' | 'read';
  rpcUrl?: string;
  idlDropZone?: React.ReactNode;
  renderJson?: (data: unknown) => React.ReactNode;
}> = ({ address, accountData, accountType, rpcUrl, idlDropZone, renderJson }) => {
  const getLamportsLabel = () => {
    if (accountType === 'delete') return 'LAMPORTS REMOVED';
    if (accountType === 'read') return 'LAMPORTS';
    return 'LAMPORTS ADDED';
  };

  return (
    <div className="space-y-4 text-xs text-gray-400">
      <div className="flex items-center justify-between">
        <span className="px-5 text-xs font-semibold text-gray-500">{getLamportsLabel()}</span>
        <span className="pr-5 text-right">
          <LamportsDisplay lamports={accountData.lamports} />
        </span>
      </div>
      {accountData.owner && (
        <div className="flex items-center justify-between">
          <span className="px-5 text-xs font-semibold text-gray-500">
            <span className="hidden sm:inline">ACCOUNT OWNER</span>
            <span className="sm:hidden">OWNER</span>
          </span>
          <span className="pr-5">
            <AddressChip address={accountData.owner} rpcUrl={rpcUrl} aggressiveTruncate />
          </span>
        </div>
      )}
      {accountData.executable ? (
        <div className="space-y-0 pb-2" />
      ) : (
        <div className="space-y-0">
          <AccountDataBlock data={accountData} idlDropZone={idlDropZone} renderJson={renderJson} />
        </div>
      )}
    </div>
  );
};

const UpdateAccountDetailsCard: React.FC<{
  address: string;
  accountData: AccountData[];
  rpcUrl?: string;
  idlDropZone?: React.ReactNode;
  renderJsonDiff?: (beforeData: unknown, afterData: unknown) => React.ReactNode;
  copyHexButton?: (data: unknown, label: string) => React.ReactNode;
}> = ({
  address,
  accountData,
  rpcUrl,
  idlDropZone,
  renderJsonDiff,
  copyHexButton,
}) => {
  const [beforeData, afterData] = accountData;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-5">
        <span className={`text-xs font-semibold ${beforeData.lamports !== afterData.lamports ? 'text-yellow-400' : 'text-gray-400'}`}>
          LAMPORTS
        </span>
        <LamportsComparison beforeLamports={beforeData.lamports} afterLamports={afterData.lamports} />
      </div>
      {beforeData.owner && (
        <div className="flex items-center justify-between px-5">
          <span className={`text-xs font-semibold ${beforeData.owner !== afterData.owner ? 'text-yellow-400' : 'text-gray-400'}`}>
            <span className="hidden sm:inline">ACCOUNT OWNER</span>
            <span className="sm:hidden">OWNER</span>
          </span>
          <div className="flex items-center gap-2">
            {beforeData.owner !== afterData.owner && (
              <>
                <AddressChip address={beforeData.owner} rpcUrl={rpcUrl} aggressiveTruncate />
                <span className="text-xs text-gray-500">→</span>
              </>
            )}
            <AddressChip address={afterData.owner} rpcUrl={rpcUrl} aggressiveTruncate />
          </div>
        </div>
      )}
      {beforeData.executable || afterData.executable ? (
        <div className="space-y-0" />
      ) : (
        <div className="space-y-0">
          <AccountDataDiffBlock
            beforeData={beforeData}
            afterData={afterData}
            idlDropZone={idlDropZone}
            renderJsonDiff={renderJsonDiff}
            copyHexButton={copyHexButton}
          />
        </div>
      )}
    </div>
  );
};

export interface AccountChangeCardProps {
  address: string;
  state: AccountState;
  rpcUrl?: string;
  permissionsBox?: React.ReactNode;
  transactionProfile?: TransactionProfile | null;
  selectedTransaction?: { transaction?: { message?: { instructions?: Array<{ programId?: string }> } } } | null;
  idlDropZone?: React.ReactNode;
  renderJson?: (data: unknown) => React.ReactNode;
  renderJsonDiff?: (beforeData: unknown, afterData: unknown) => React.ReactNode;
  copyHexButton?: (data: unknown, label: string) => React.ReactNode;
}

const AccountChangeCard: React.FC<AccountChangeCardProps> = ({
  address,
  state,
  rpcUrl,
  permissionsBox,
  transactionProfile,
  selectedTransaction,
  idlDropZone,
  renderJson,
  renderJsonDiff,
  copyHexButton,
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
          <div className="flex items-center gap-2">
            {permissionsBox}
            <AccountLabels
              address={address}
              accountState={state}
              transactionProfile={transactionProfile}
              selectedTransaction={selectedTransaction}
            />
          </div>
          <AddressChip address={address} rpcUrl={rpcUrl} />
        </div>
        <span className="text-[11px] font-semibold tracking-[0.22em] text-zinc-500">{accountChange.type}</span>
      </summary>
      <div className="border-t border-zinc-800/70 p-4">
        {accountChange.type === 'update' && Array.isArray(accountChange.data) ? (
          <UpdateAccountDetailsCard
            address={address}
            accountData={accountChange.data}
            rpcUrl={rpcUrl}
            idlDropZone={idlDropZone}
            renderJsonDiff={renderJsonDiff}
            copyHexButton={copyHexButton}
          />
        ) : null}
        {accountChange.type === 'create' && !Array.isArray(accountChange.data) && accountChange.data ? (
          <AccountDetailsCard address={address} accountData={accountChange.data} accountType="create" rpcUrl={rpcUrl} idlDropZone={idlDropZone} renderJson={renderJson} />
        ) : null}
        {accountChange.type === 'delete' && !Array.isArray(accountChange.data) && accountChange.data ? (
          <AccountDetailsCard address={address} accountData={accountChange.data} accountType="delete" rpcUrl={rpcUrl} idlDropZone={idlDropZone} renderJson={renderJson} />
        ) : null}
      </div>
    </details>
  );
};

const ReadonlyAccountCard: React.FC<{
  address: string;
  accountState: ReadonlyAccountState;
  rpcUrl?: string;
  permissionsBox?: React.ReactNode;
  transactionProfile?: TransactionProfile | null;
  selectedTransaction?: { transaction?: { message?: { instructions?: Array<{ programId?: string }> } } } | null;
  idlDropZone?: React.ReactNode;
  renderJson?: (data: unknown) => React.ReactNode;
}> = ({
  address,
  accountState,
  rpcUrl,
  permissionsBox,
  transactionProfile,
  selectedTransaction,
  idlDropZone,
  renderJson,
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
          <div className="flex items-center gap-2">
            {permissionsBox}
            <AccountLabels
              address={address}
              accountState={{ type: 'readonly' }}
              transactionProfile={transactionProfile}
              selectedTransaction={selectedTransaction}
            />
          </div>
          <AddressChip address={address} rpcUrl={rpcUrl} />
        </div>
        <LamportsDisplay lamports={accountState.lamports} />
      </summary>
      <div className="border-t border-zinc-800/70 p-4">
        <AccountDetailsCard address={address} accountData={normalizedAccountData} accountType="read" rpcUrl={rpcUrl} idlDropZone={idlDropZone} renderJson={renderJson} />
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

export interface AccountExtensionProps {
  transactionProfile?: TransactionProfile | null;
  selectedTransaction?: { transaction?: { message?: { instructions?: Array<{ programId?: string }> } } } | null;
  idlDropZone?: React.ReactNode;
  renderJson?: (data: unknown) => React.ReactNode;
  renderJsonDiff?: (beforeData: unknown, afterData: unknown) => React.ReactNode;
  copyHexButton?: (data: unknown, label: string) => React.ReactNode;
  renderPermissionsBox?: (address: string, accountState: AccountState | { type?: string }) => React.ReactNode;
}

const getHoverClasses = (accountState: AccountState) => {
  const hasChanges = accountState.accountChange && accountState.accountChange.type !== 'unchanged';
  if (hasChanges && accountState.accountChange!.type === 'create') return 'hover:bg-green-900/40';
  if (hasChanges && accountState.accountChange!.type === 'update') return 'hover:bg-yellow-900/40';
  if (hasChanges && accountState.accountChange!.type === 'delete') return 'hover:bg-red-900/40';
  if (accountState.type === 'readonly') return 'hover:bg-gray-700/40';
  return 'hover:bg-zinc-800/40';
};

const InstructionCard: React.FC<{
  index: number;
  instruction: TransactionProfile['instructionProfiles'][number];
  profile: TransactionProfile;
  rpcUrl?: string;
  extensions?: AccountExtensionProps;
}> = ({
  index,
  instruction,
  profile,
  rpcUrl,
  extensions,
}) => {
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  const toggleAccount = (address: string) => {
    setExpandedAccounts((prev) => ({ ...prev, [address]: !prev[address] }));
  };

  // Get the program ID for this instruction (to sort it first)
  const invokedProgram = instruction.logMessages
    .find((line) => /^Program \w+ invoke \[1\]/.test(line))
    ?.match(/^Program (\w+)/)?.[1];

  // Build sorted account entries: all accounts from accountStates
  const allAccounts = Object.entries(instruction.accountStates ?? {}).sort(([addressA], [addressB]) => {
    if (addressA === invokedProgram) return -1;
    if (addressB === invokedProgram) return 1;
    return 0;
  });

  return (
    <InstructionProfileCard index={index} instruction={instruction} defaultOpen={index < 2}>
        {/* Account State Transitions */}
        {allAccounts.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold text-gray-500">ACCOUNTS STATE TRANSITIONS</div>
            <div className="overflow-hidden rounded border border-zinc-600 bg-zinc-900/30">
              {allAccounts.map(([address, accountState], accountIndex) => {
                const hasChanges = accountState.accountChange && accountState.accountChange.type !== 'unchanged';
                const isLast = accountIndex === allAccounts.length - 1;
                const isExpanded = expandedAccounts[address] ?? false;
                const readonlyData = profile.readonlyAccountStates?.[address];

                return (
                  <div key={address}>
                    <div className={`bg-zinc-900/30 p-3 ${getHoverClasses(accountState)} transition-colors`}>
                      <div
                        className="flex cursor-pointer items-center justify-between px-2 py-1 font-mono text-xs text-gray-400"
                        onClick={() => toggleAccount(address)}
                      >
                        <div className="flex items-center">
                          <AddressChip address={address} rpcUrl={rpcUrl} className="font-semibold text-gray-300" />
                        </div>
                        <AccountLabels
                          address={address}
                          accountState={accountState}
                          transactionProfile={extensions?.transactionProfile ?? profile}
                          selectedTransaction={extensions?.selectedTransaction}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-zinc-950 pt-5">
                        {hasChanges && accountState.accountChange!.type === 'create' && !Array.isArray(accountState.accountChange!.data) && accountState.accountChange!.data && (
                          <AccountDetailsCard
                            address={address}
                            accountData={accountState.accountChange!.data as AccountData}
                            accountType="create"
                            rpcUrl={rpcUrl}
                            idlDropZone={extensions?.idlDropZone}
                            renderJson={extensions?.renderJson}
                          />
                        )}

                        {hasChanges && accountState.accountChange!.type === 'update' && Array.isArray(accountState.accountChange!.data) && (
                          <UpdateAccountDetailsCard
                            address={address}
                            accountData={accountState.accountChange!.data as AccountData[]}
                            rpcUrl={rpcUrl}
                            idlDropZone={extensions?.idlDropZone}
                            renderJsonDiff={extensions?.renderJsonDiff}
                            copyHexButton={extensions?.copyHexButton}
                          />
                        )}

                        {hasChanges && accountState.accountChange!.type === 'delete' && !Array.isArray(accountState.accountChange!.data) && accountState.accountChange!.data && (
                          <AccountDetailsCard
                            address={address}
                            accountData={accountState.accountChange!.data as AccountData}
                            accountType="delete"
                            rpcUrl={rpcUrl}
                            idlDropZone={extensions?.idlDropZone}
                            renderJson={extensions?.renderJson}
                          />
                        )}

                        {!hasChanges && readonlyData && (
                          <AccountDetailsCard
                            address={address}
                            accountData={{
                              lamports: readonlyData.lamports,
                              owner: readonlyData.owner,
                              executable: readonlyData.executable,
                              rentEpoch: readonlyData.rentEpoch,
                              space: readonlyData.space,
                              data: readonlyData.data,
                              json: isStructuredAccountJson(readonlyData.json) ? readonlyData.json : undefined,
                              bytes: readonlyData.bytes ?? (Array.isArray(readonlyData.data) && readonlyData.data.every((item) => typeof item === 'number') ? readonlyData.data : undefined),
                            }}
                            accountType="read"
                            rpcUrl={rpcUrl}
                            idlDropZone={extensions?.idlDropZone}
                            renderJson={extensions?.renderJson}
                          />
                        )}

                        {!hasChanges && !readonlyData && (
                          <div className="rounded border border-gray-500/30 bg-gray-700/20 p-2 text-xs text-gray-400">
                            No changes to this account
                          </div>
                        )}
                      </div>
                    )}

                    {!isLast && <div className="mx-3 h-px bg-zinc-500/20" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Log Messages */}
        <LogsBlock logs={instruction.logMessages} title="LOGS" />

        {/* Error Message */}
        {instruction.errorMessage && (
          <div>
            <div className="mb-2 text-xs font-semibold text-red-400">ERROR</div>
            <div className="rounded border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-300">
              {instruction.errorMessage}
            </div>
          </div>
        )}
    </InstructionProfileCard>
  );
};

export const TransactionDetailPanel: React.FC<{
  entry: TransactionReportEntry;
  profile: TransactionProfile | null;
  rpcUrl?: string;
  showExplorerButton?: boolean;
  extensions?: AccountExtensionProps;
}> = ({ entry, profile, rpcUrl, showExplorerButton = true, extensions }) => {
  const instructionValues = profile?.instructionProfiles?.map((instruction) => instruction.computeUnitsConsumed) ?? [];

  return (
    <ExplorerButtonContext.Provider value={showExplorerButton}>
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
            <InstructionCard key={`instruction-${index}`} index={index} instruction={instruction} profile={profile} rpcUrl={rpcUrl} extensions={extensions} />
          ))}
        </div>
      ) : null}

      <LogsBlock logs={entry.logs} />
    </div>
    </ExplorerButtonContext.Provider>
  );
};
