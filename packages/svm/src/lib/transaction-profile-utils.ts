import { analyzeHexDiff } from './hex-diff-analyzer';

export interface AccountData {
  lamports: number;
  json?:
    | {
        program: string;
        parsed: Record<string, unknown>;
        space: number;
      }
    | [string, string];
  bytes?: number[];
  owner: string;
  executable: boolean;
  rentEpoch: number;
  space: number;
  data?: unknown;
}

export interface AccountChange {
  type: 'create' | 'update' | 'delete' | 'unchanged';
  data?: AccountData | AccountData[];
}

export interface AccountState {
  type: 'writable' | 'readonly';
  accountChange?: AccountChange;
}

export interface InstructionProfile {
  accountStates: Record<string, AccountState>;
  computeUnitsConsumed: number;
  logMessages: string[];
  errorMessage: string | null;
}

export interface TransactionProfileData {
  accountStates: Record<string, AccountState>;
  computeUnitsConsumed: number;
  logMessages: string[];
  errorMessage: string | null;
}

export interface ReadonlyAccountState {
  lamports: number;
  data: [string, string] | number[];
  json?: unknown;
  bytes?: number[];
  owner: string;
  executable: boolean;
  rentEpoch: number;
  space: number;
}

export interface TransactionProfile {
  slot: number;
  key?: string;
  instructionProfiles: InstructionProfile[];
  transactionProfile: TransactionProfileData;
  readonlyAccountStates: Record<string, ReadonlyAccountState>;
}

export interface TransactionReportEntry {
  signature: string;
  slot: number;
  error?: string | null;
  logs: string[];
  profile_json_parsed?: unknown | null;
  profile_base64?: unknown | null;
}

export interface SurfnetReportData {
  instance_id: string;
  test_name?: string | null;
  rpc_url: string;
  transactions: TransactionReportEntry[];
  timestamp: string;
}

export interface SurfpoolReport {
  instances: SurfnetReportData[];
  generated_at: string;
}

export interface ReportSummary {
  tests: number;
  transactions: number;
  failed: number;
  computeUnits: number;
}

export const getProgramType = (address: string): string | undefined => {
  switch (address) {
    case '11111111111111111111111111111111':
      return 'SYSTEM PROGRAM';
    case 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA':
      return 'TOKEN PROGRAM';
    case 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL':
      return 'ASSOCIATED TOKEN PROGRAM';
    case 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4':
      return 'JUP PROGRAM';
    case 'ComputeBudget111111111111111111111111111111':
      return 'COMPUTE BUDGET PROGRAM';
    case 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb':
      return 'TOKEN-2022 PROGRAM';
    default:
      return undefined;
  }
};

export const getProgramName = (address: string): string => {
  return getProgramType(address) ?? address;
};

export const decodeAccountData = (data: unknown): unknown => {
  if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
    return data;
  }

  if (
    Array.isArray(data) &&
    data.length === 2 &&
    typeof data[0] === 'string' &&
    typeof data[1] === 'string'
  ) {
    const [encodedData, encoding] = data;

    try {
      switch (encoding) {
        case 'base64': {
          const bytes = atob(encodedData);
          return Array.from(bytes, (char) => char.charCodeAt(0));
        }
        case 'base58':
          return encodedData;
        default:
          return data;
      }
    } catch {
      return data;
    }
  }

  return data;
};

const mergeAccountData = (jsonParsedData: any, base64Data: any): any => {
  if (!jsonParsedData || !base64Data) {
    return jsonParsedData || base64Data;
  }

  const merged = { ...jsonParsedData };

  if (jsonParsedData.data) {
    merged.json = jsonParsedData.data;
  }

  if (base64Data.data) {
    merged.bytes = decodeAccountData(base64Data.data);
  }

  return merged;
};

const mergeAccountStates = (jsonParsedStates: any, base64States: any): any => {
  if (!jsonParsedStates || !base64States) {
    return jsonParsedStates || base64States;
  }

  const mergedStates = { ...jsonParsedStates };

  Object.keys(base64States).forEach((address) => {
    if (!mergedStates[address]) {
      return;
    }

    const jsonParsedState = mergedStates[address];
    const base64State = base64States[address];

    if (!jsonParsedState.accountChange?.data || !base64State.accountChange?.data) {
      return;
    }

    if (Array.isArray(jsonParsedState.accountChange.data)) {
      mergedStates[address].accountChange.data = jsonParsedState.accountChange.data.map(
        (item: any, index: number) => {
          const base64Item = Array.isArray(base64State.accountChange.data)
            ? base64State.accountChange.data[index]
            : base64State.accountChange.data;
          return mergeAccountData(item, base64Item);
        }
      );
    } else {
      mergedStates[address].accountChange.data = mergeAccountData(
        jsonParsedState.accountChange.data,
        base64State.accountChange.data
      );
    }
  });

  return mergedStates;
};

export const mergeTransactionProfiles = (jsonParsedProfile: any, base64Profile: any): any => {
  if (!jsonParsedProfile) {
    return base64Profile ?? null;
  }

  if (!base64Profile) {
    return jsonParsedProfile;
  }

  const mergedProfile = JSON.parse(JSON.stringify(jsonParsedProfile));

  if (mergedProfile.instructionProfiles && base64Profile.instructionProfiles) {
    mergedProfile.instructionProfiles = mergedProfile.instructionProfiles.map((instruction: any, index: number) => {
      const base64Instruction = base64Profile.instructionProfiles[index];
      if (!base64Instruction) {
        return instruction;
      }

      return {
        ...instruction,
        accountStates: mergeAccountStates(instruction.accountStates, base64Instruction.accountStates),
      };
    });
  }

  const txAccountStates = mergedProfile.transactionProfile?.accountStates;
  const base64TxAccountStates = base64Profile.transactionProfile?.accountStates ?? {};

  if (txAccountStates && mergedProfile.instructionProfiles?.length) {
    const lastInstructionIndex = mergedProfile.instructionProfiles.length - 1;

    mergedProfile.instructionProfiles = mergedProfile.instructionProfiles.map((instruction: any, index: number) => {
      const nextInstruction = {
        ...instruction,
        accountStates: { ...(instruction.accountStates ?? {}) },
      };

      if (index === lastInstructionIndex) {
        Object.keys(txAccountStates).forEach((address) => {
          const txState = txAccountStates[address];
          const base64TxState = base64TxAccountStates[address];

          if (!txState?.accountChange || txState.accountChange.type === 'unchanged') {
            return;
          }

          const existingState = nextInstruction.accountStates[address];
          const existingChange = existingState?.accountChange;
          if (existingState && existingChange && existingChange.type !== 'unchanged') {
            return;
          }

          let mergedData = txState.accountChange.data;
          if (Array.isArray(txState.accountChange.data) && base64TxState?.accountChange?.data) {
            mergedData = txState.accountChange.data.map((item: any, itemIndex: number) => {
              const base64Item = Array.isArray(base64TxState.accountChange.data)
                ? base64TxState.accountChange.data[itemIndex]
                : base64TxState.accountChange.data;
              return mergeAccountData(item, base64Item);
            });
          } else if (txState.accountChange.data && base64TxState?.accountChange?.data) {
            mergedData = mergeAccountData(txState.accountChange.data, base64TxState.accountChange.data);
          }

          nextInstruction.accountStates[address] = {
            type: txState.type || 'writable',
            accountChange: {
              ...txState.accountChange,
              data: mergedData,
            },
          };
        });
      } else {
        Object.keys(nextInstruction.accountStates).forEach((address) => {
          const instructionState = nextInstruction.accountStates[address];
          const txState = txAccountStates[address];
          const base64TxState = base64TxAccountStates[address];

          if (
            !instructionState?.accountChange ||
            instructionState.accountChange.type !== 'unchanged' ||
            !txState?.accountChange ||
            txState.accountChange.type === 'unchanged'
          ) {
            return;
          }

          let mergedData = txState.accountChange.data;
          if (Array.isArray(txState.accountChange.data) && base64TxState?.accountChange?.data) {
            mergedData = txState.accountChange.data.map((item: any, itemIndex: number) => {
              const base64Item = Array.isArray(base64TxState.accountChange.data)
                ? base64TxState.accountChange.data[itemIndex]
                : base64TxState.accountChange.data;
              return mergeAccountData(item, base64Item);
            });
          } else if (txState.accountChange.data && base64TxState?.accountChange?.data) {
            mergedData = mergeAccountData(txState.accountChange.data, base64TxState.accountChange.data);
          }

          nextInstruction.accountStates[address] = {
            type: txState.type || instructionState.type || 'writable',
            accountChange: {
              ...txState.accountChange,
              data: mergedData,
            },
          };
        });
      }

      return nextInstruction;
    });
  }

  if (mergedProfile.readonlyAccountStates && base64Profile.readonlyAccountStates) {
    Object.keys(base64Profile.readonlyAccountStates).forEach((address) => {
      if (mergedProfile.readonlyAccountStates[address]) {
        mergedProfile.readonlyAccountStates[address] = mergeAccountData(
          mergedProfile.readonlyAccountStates[address],
          base64Profile.readonlyAccountStates[address]
        );
      }
    });
  }

  return mergedProfile;
};

export const processTransactionProfile = (profile: any): TransactionProfile => {
  const processedProfile = JSON.parse(JSON.stringify(profile));

  if (processedProfile.instructionProfiles) {
    processedProfile.instructionProfiles.forEach((instruction: any) => {
      if (!instruction.accountStates) {
        return;
      }

      Object.keys(instruction.accountStates).forEach((address) => {
        const accountState = instruction.accountStates[address];
        if (!accountState.accountChange?.data) {
          return;
        }

        if (Array.isArray(accountState.accountChange.data)) {
          accountState.accountChange.data = accountState.accountChange.data.map((item: any) => {
            if (item.data) {
              item.data = decodeAccountData(item.data);
            }
            return item;
          });
        } else if (accountState.accountChange.data.data) {
          accountState.accountChange.data.data = decodeAccountData(accountState.accountChange.data.data);
        }
      });
    });
  }

  if (processedProfile.readonlyAccountStates) {
    Object.keys(processedProfile.readonlyAccountStates).forEach((address) => {
      const readonlyAccount = processedProfile.readonlyAccountStates[address];
      if (readonlyAccount.data) {
        readonlyAccount.data = decodeAccountData(readonlyAccount.data);
      }
    });
  }

  return processedProfile;
};

export const getMergedTransactionProfile = (entry: TransactionReportEntry): TransactionProfile | null => {
  if (!entry.profile_json_parsed) {
    return null;
  }

  return processTransactionProfile(
    mergeTransactionProfiles(entry.profile_json_parsed, entry.profile_base64 ?? null)
  );
};

export const computeHexDiff = (beforeBytes: number[], afterBytes: number[]) => {
  const diffResult = analyzeHexDiff(beforeBytes, afterBytes);
  const beforeDiffMap = new Map<number, { type: 'removal' | 'update'; range?: { start: number; end: number } }>();
  const afterDiffMap = new Map<number, { type: 'addition' | 'update'; range?: { start: number; end: number } }>();

  diffResult.removals.forEach((removal) => {
    for (let index = removal.beforeRange.start; index <= removal.beforeRange.end; index += 1) {
      beforeDiffMap.set(index, { type: 'removal', range: removal.beforeRange });
    }
  });

  diffResult.additions.forEach((addition) => {
    for (let index = addition.afterRange.start; index <= addition.afterRange.end; index += 1) {
      afterDiffMap.set(index, { type: 'addition', range: addition.afterRange });
    }
  });

  diffResult.updates.forEach((update) => {
    for (let index = update.beforeRange.start; index <= update.beforeRange.end; index += 1) {
      beforeDiffMap.set(index, { type: 'update', range: update.beforeRange });
    }

    for (let index = update.afterRange.start; index <= update.afterRange.end; index += 1) {
      afterDiffMap.set(index, { type: 'update', range: update.afterRange });
    }
  });

  return { beforeDiffMap, afterDiffMap, diffResult };
};

const byteArrayToString = (data: unknown): string => {
  if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
    return String.fromCharCode(...data);
  }

  if (typeof data === 'object' && data !== null) {
    const value = data as Record<string, unknown>;

    if (Array.isArray(value.bytes)) {
      return String.fromCharCode(...(value.bytes as number[]));
    }

    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        return atob(String(data[0]));
      } catch {
        return String(data[0] ?? '');
      }
    }

    return JSON.stringify(data);
  }

  return String(data ?? '');
};

const formatHex = (data: string, includeAscii: boolean): string => {
  const bytes = Array.from(data).map((char) => char.charCodeAt(0));
  const lines: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const lineBytes = bytes.slice(offset, offset + 16);
    const hexPart = lineBytes
      .map((byte) => `<span>${byte.toString(16).padStart(2, '0').toUpperCase()}</span>`)
      .join('');
    const label = offset.toString(16).padStart(4, '0').toUpperCase();

    if (!includeAscii) {
      lines.push(`${label}: <span class="hex-grid">${hexPart}</span>`);
      continue;
    }

    const ascii = lineBytes
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('');

    lines.push(
      `<div class="flex justify-between items-start"><div><span class="text-zinc-500">${label}:</span> <span class="hex-grid">${hexPart}</span></div><div><span class="text-zinc-600">|${ascii}|</span></div></div>`
    );
  }

  return lines.join(includeAscii ? '' : '\n');
};

export const getHexData = (data: unknown): string => {
  const value = byteArrayToString(data);
  if (!value || value === 'null' || value === 'undefined') {
    return '<none>';
  }
  return formatHex(value, true);
};

export const getHexDataForUpdates = (data: unknown): string => {
  const value = byteArrayToString(data);
  if (!value || value === 'null' || value === 'undefined' || value === '{}' || value === '[]') {
    return '<none>';
  }
  return formatHex(value, false);
};

export const hasJsonData = (data: unknown): boolean => {
  if (typeof data === 'object' && data !== null) {
    const value = data as Record<string, unknown>;
    if (value.json) {
      return true;
    }

    if (value.parsed && typeof value.parsed === 'object') {
      return true;
    }

    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        return atob(String(data[0])) !== '';
      } catch {
        return String(data[0] ?? '') !== '';
      }
    }

    return Object.keys(value).length > 0;
  }

  const stringValue = String(data ?? '');
  return stringValue !== '' && stringValue !== 'null' && stringValue !== 'undefined' && stringValue !== '<none>';
};

export const extractProgramData = (data: unknown): unknown => {
  if (typeof data === 'object' && data !== null) {
    const value = data as Record<string, unknown>;

    if (value.json) {
      return value.json;
    }

    if (value.parsed && typeof value.parsed === 'object') {
      return value.parsed;
    }

    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        const decoded = atob(String(data[0]));
        return decoded === '' ? '<none>' : decoded;
      } catch {
        return data[0] === '' ? '<none>' : data[0];
      }
    }

    if (Array.isArray(data) && data.length === 0) {
      return '<none>';
    }

    if (Object.keys(value).length === 0) {
      return '<none>';
    }

    return value;
  }

  const stringValue = String(data ?? '');
  return stringValue === '' || stringValue === 'null' || stringValue === 'undefined' ? '<none>' : stringValue;
};

export const findChangedPaths = (beforeObj: unknown, afterObj: unknown, currentPath: string[] = []): Set<string> => {
  const changedPaths = new Set<string>();

  if (typeof beforeObj !== typeof afterObj) {
    changedPaths.add(currentPath.join('.'));
    return changedPaths;
  }

  if (typeof beforeObj !== 'object' || beforeObj === null || afterObj === null) {
    if (beforeObj !== afterObj) {
      changedPaths.add(currentPath.join('.'));
    }
    return changedPaths;
  }

  if (Array.isArray(beforeObj) !== Array.isArray(afterObj)) {
    changedPaths.add(currentPath.join('.'));
    return changedPaths;
  }

  if (Array.isArray(beforeObj) && Array.isArray(afterObj)) {
    const length = Math.max(beforeObj.length, afterObj.length);
    for (let index = 0; index < length; index += 1) {
      const nested = findChangedPaths(beforeObj[index], afterObj[index], [...currentPath, index.toString()]);
      nested.forEach((path) => changedPaths.add(path));
    }
    return changedPaths;
  }

  const beforeRecord = beforeObj as Record<string, unknown>;
  const afterRecord = afterObj as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);

  allKeys.forEach((key) => {
    const nextPath = [...currentPath, key];
    if (!(key in beforeRecord) || !(key in afterRecord)) {
      changedPaths.add(nextPath.join('.'));
      return;
    }

    const nested = findChangedPaths(beforeRecord[key], afterRecord[key], nextPath);
    nested.forEach((path) => changedPaths.add(path));
  });

  return changedPaths;
};

export const getTransactionComputeUnits = (entry: TransactionReportEntry): number => {
  const profile = entry.profile_json_parsed as Record<string, any> | null | undefined;
  return profile?.transactionProfile?.computeUnitsConsumed ?? 0;
};

export const getTransactionPrograms = (entry: TransactionReportEntry): string[] => {
  const seen = new Set<string>();
  const profile = entry.profile_json_parsed as Record<string, any> | null | undefined;
  const instructionProfiles = profile?.instructionProfiles;

  if (Array.isArray(instructionProfiles)) {
    instructionProfiles.forEach((instruction: any) => {
      (instruction?.logMessages ?? []).forEach((logLine: string) => {
        const match = /^Program (\w+) invoke/.exec(logLine);
        if (match) {
          seen.add(match[1]);
        }
      });
    });
  }

  entry.logs.forEach((logLine) => {
    const match = /^Program (\w+) invoke/.exec(logLine);
    if (match) {
      seen.add(match[1]);
    }
  });

  return Array.from(seen);
};

export const getInterestingLogPreview = (entry: TransactionReportEntry): string => {
  const interestingLog = entry.logs.find((line) => {
    return line.startsWith('Program log:') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('error');
  });

  if (!interestingLog) {
    return entry.logs.length > 0 ? `${entry.logs.length} log lines` : '';
  }

  if (interestingLog.startsWith('Program log:')) {
    return interestingLog.replace('Program log: ', '');
  }

  return interestingLog;
};

export const getInstanceSummary = (instance: SurfnetReportData) => {
  return {
    transactions: instance.transactions.length,
    failed: instance.transactions.filter((transaction) => transaction.error).length,
    computeUnits: instance.transactions.reduce((sum, transaction) => sum + getTransactionComputeUnits(transaction), 0),
  };
};

export const getReportSummary = (report: SurfpoolReport): ReportSummary => {
  return report.instances.reduce<ReportSummary>(
    (summary, instance) => {
      const instanceSummary = getInstanceSummary(instance);
      summary.tests += 1;
      summary.transactions += instanceSummary.transactions;
      summary.failed += instanceSummary.failed;
      summary.computeUnits += instanceSummary.computeUnits;
      return summary;
    },
    {
      tests: 0,
      transactions: 0,
      failed: 0,
      computeUnits: 0,
    }
  );
};
