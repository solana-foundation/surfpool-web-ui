import { analyzeHexDiff } from '@/lib/hex-diff-analyzer';

// TypeScript interfaces based on the transaction profile structure
export interface AccountData {
  lamports: number;
  json?:
    | {
        program: string;
        parsed: Record<string, any>;
        space: number;
      }
    | [string, string]; // Can be parsed JSON, [data, encoding], or decoded bytes
  bytes: number[];
  owner: string;
  executable: boolean;
  rentEpoch: number;
  space: number;
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
  data: [string, string]; // [data, encoding]
  owner: string;
  executable: boolean;
  rentEpoch: number;
  space: number;
}

export interface TransactionProfile {
  slot: number;
  key: string;
  instructionProfiles: InstructionProfile[];
  transactionProfile: TransactionProfileData;
  readonlyAccountStates: Record<string, ReadonlyAccountState>;
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
    default:
      return undefined;
  }
};

export const getProgramName = (address: string): string => {
  const programType = getProgramType(address);
  if (programType) {
    return programType;
  }
  return address;
};

// Utility functions for decoding account data
export const decodeAccountData = (data: any): any => {
  // If data is already an array of numbers (decoded bytes), return as is
  if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
    return data;
  }

  // If data is an array with encoding info [data, encoding]
  if (Array.isArray(data) && data.length === 2 && typeof data[0] === 'string' && typeof data[1] === 'string') {
    const [encodedData, encoding] = data;

    try {
      switch (encoding) {
        case 'base64':
          // Decode base64 to bytes
          const base64Bytes = atob(encodedData);
          return Array.from(base64Bytes, (char) => char.charCodeAt(0));

        case 'base58':
          // For base58, we'll keep it as a string for now since it's typically used for addresses
          // If you need actual base58 decoding, you'd need a base58 library
          return encodedData;

        default:
          // Unknown encoding, return as is
          return data;
      }
    } catch (error) {
      console.warn('Failed to decode data:', error);
      return data;
    }
  }

  // If data is already parsed JSON, return as is
  return data;
};

export const mergeTransactionProfiles = (jsonParsedProfile: any, base64Profile: any): any => {
  // Deep clone the jsonParsed profile as the base
  const mergedProfile = JSON.parse(JSON.stringify(jsonParsedProfile));

  // Helper function to merge account data
  const mergeAccountData = (jsonParsedData: any, base64Data: any): any => {
    if (!jsonParsedData || !base64Data) return jsonParsedData || base64Data;

    const merged = { ...jsonParsedData };

    // Set the json field from jsonParsed profile
    if (jsonParsedData.data) {
      merged.json = jsonParsedData.data;
    }

    // Set the bytes field from base64 profile
    if (base64Data.data) {
      merged.bytes = decodeAccountData(base64Data.data);
    }

    return merged;
  };

  // Helper function to merge account states
  const mergeAccountStates = (jsonParsedStates: any, base64States: any): any => {
    if (!jsonParsedStates || !base64States) return jsonParsedStates || base64States;

    const mergedStates = { ...jsonParsedStates };

    Object.keys(base64States).forEach((address) => {
      if (mergedStates[address]) {
        const jsonParsedState = mergedStates[address];
        const base58State = base64States[address];

        // Debug: log all accounts with accountChange
        if (jsonParsedState.accountChange && jsonParsedState.accountChange.type !== 'unchanged') {
          console.log(
            `🔍 Account ${address.slice(0, 8)}... change type:`,
            jsonParsedState.accountChange.type,
            'jsonParsed data:',
            jsonParsedState.accountChange.data,
            'base64 data:',
            base58State?.accountChange?.data
          );
        }

        if (jsonParsedState.accountChange?.data && base58State.accountChange?.data) {
          if (Array.isArray(jsonParsedState.accountChange.data)) {
            // Handle update case where data is an array
            mergedStates[address].accountChange.data = jsonParsedState.accountChange.data.map(
              (item: any, index: number) => {
                const base58Item = Array.isArray(base58State.accountChange.data)
                  ? base58State.accountChange.data[index]
                  : base58State.accountChange.data;
                return mergeAccountData(item, base58Item);
              }
            );
          } else {
            // Handle single data object
            mergedStates[address].accountChange.data = mergeAccountData(
              jsonParsedState.accountChange.data,
              base58State.accountChange.data
            );
          }
        }
      }
    });

    console.log('🔍 Merged states:', mergedStates);
    return mergedStates;
  };

  // Merge instruction profiles
  if (mergedProfile.instructionProfiles && base64Profile.instructionProfiles) {
    mergedProfile.instructionProfiles = mergedProfile.instructionProfiles.map((instruction: any, index: number) => {
      const base64Instruction = base64Profile.instructionProfiles[index];
      if (base64Instruction) {
        return {
          ...instruction,
          accountStates: mergeAccountStates(instruction.accountStates, base64Instruction.accountStates),
        };
      }
      return instruction;
    });
  }

  // Copy account changes from transactionProfile.accountStates to instructionProfiles
  // The transaction-level accountStates contains the actual before/after data
  if (mergedProfile.transactionProfile?.accountStates && mergedProfile.instructionProfiles) {
    const txAccountStates = mergedProfile.transactionProfile.accountStates;
    const base64TxAccountStates = base64Profile.transactionProfile?.accountStates || {};

    // Find the last instruction profile (usually the main instruction) to add changed accounts
    const lastInstructionIndex = mergedProfile.instructionProfiles.length - 1;

    mergedProfile.instructionProfiles = mergedProfile.instructionProfiles.map(
      (instruction: any, instrIndex: number) => {
        if (!instruction.accountStates) {
          instruction.accountStates = {};
        }

        // For the last instruction, add ALL accounts with changes from transaction level
        if (instrIndex === lastInstructionIndex) {
          Object.keys(txAccountStates).forEach((address) => {
            const txState = txAccountStates[address];
            const base64TxState = base64TxAccountStates[address];

            // If the transaction-level state has actual changes, add/update it
            // Only fill in if the instruction doesn't already have specific changes for this account
            if (txState?.accountChange && txState.accountChange.type !== 'unchanged') {
              const existingInstrState = instruction.accountStates[address];
              const existingChange = existingInstrState?.accountChange;
              if (!existingInstrState || !existingChange || existingChange.type === 'unchanged') {
                // Merge the data from jsonParsed and base64
                let mergedData = txState.accountChange.data;
                if (Array.isArray(txState.accountChange.data) && base64TxState?.accountChange?.data) {
                  mergedData = txState.accountChange.data.map((item: any, idx: number) => {
                    const base64Item = Array.isArray(base64TxState.accountChange.data)
                      ? base64TxState.accountChange.data[idx]
                      : base64TxState.accountChange.data;
                    return mergeAccountData(item, base64Item);
                  });
                }

                instruction.accountStates[address] = {
                  type: txState.type || 'writable',
                  accountChange: {
                    ...txState.accountChange,
                    data: mergedData,
                  },
                };
              }
            }
          });
        } else {
          // For other instructions, only update existing accounts that don't have specific changes
          Object.keys(instruction.accountStates).forEach((address) => {
            const txState = txAccountStates[address];
            const base64TxState = base64TxAccountStates[address];

            if (txState?.accountChange && txState.accountChange.type !== 'unchanged') {
              const existingChange = instruction.accountStates[address]?.accountChange;
              if (!existingChange || existingChange.type === 'unchanged') {
                let mergedData = txState.accountChange.data;
                if (Array.isArray(txState.accountChange.data) && base64TxState?.accountChange?.data) {
                  mergedData = txState.accountChange.data.map((item: any, idx: number) => {
                    const base64Item = Array.isArray(base64TxState.accountChange.data)
                      ? base64TxState.accountChange.data[idx]
                      : base64TxState.accountChange.data;
                    return mergeAccountData(item, base64Item);
                  });
                }

                instruction.accountStates[address] = {
                  ...instruction.accountStates[address],
                  accountChange: {
                    ...txState.accountChange,
                    data: mergedData,
                  },
                };
              }
            }
          });
        }
        return instruction;
      }
    );
  }

  // Merge readonly account states
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
  // Deep clone the profile to avoid mutating the original
  const processedProfile = JSON.parse(JSON.stringify(profile));

  // Process instruction profiles
  if (processedProfile.instructionProfiles) {
    processedProfile.instructionProfiles.forEach((instruction: any) => {
      if (instruction.accountStates) {
        Object.keys(instruction.accountStates).forEach((address) => {
          const accountState = instruction.accountStates[address];
          if (accountState.accountChange?.data) {
            if (Array.isArray(accountState.accountChange.data)) {
              // Handle update case where data is an array
              accountState.accountChange.data = accountState.accountChange.data.map((item: any) => {
                if (item.data) {
                  item.data = decodeAccountData(item.data);
                }
                return item;
              });
            } else {
              // Handle single data object
              if (accountState.accountChange.data.data) {
                accountState.accountChange.data.data = decodeAccountData(accountState.accountChange.data.data);
              }
            }
          }
        });
      }
    });
  }

  // Process readonly account states
  if (processedProfile.readonlyAccountStates) {
    Object.keys(processedProfile.readonlyAccountStates).forEach((address) => {
      const accountState = processedProfile.readonlyAccountStates[address];
      if (accountState.data) {
        accountState.data = decodeAccountData(accountState.data);
      }
    });
  }

  return processedProfile;
};

// Enhanced diff algorithm using fast-myers-diff
export const computeHexDiff = (beforeBytes: number[], afterBytes: number[]) => {
  const diffResult = analyzeHexDiff(beforeBytes, afterBytes);

  // Create maps for easy lookup during rendering
  const beforeDiffMap = new Map<number, { type: 'removal' | 'update'; range?: { start: number; end: number } }>();
  const afterDiffMap = new Map<number, { type: 'addition' | 'update'; range?: { start: number; end: number } }>();

  // Mark removals (red highlighting in before view)
  diffResult.removals.forEach((removal) => {
    for (let i = removal.beforeRange.start; i <= removal.beforeRange.end; i++) {
      beforeDiffMap.set(i, { type: 'removal', range: removal.beforeRange });
    }
  });

  // Mark additions (green highlighting in after view)
  diffResult.additions.forEach((addition) => {
    for (let i = addition.afterRange.start; i <= addition.afterRange.end; i++) {
      afterDiffMap.set(i, { type: 'addition', range: addition.afterRange });
    }
  });

  // Mark updates (yellow highlighting in both views)
  diffResult.updates.forEach((update) => {
    for (let i = update.beforeRange.start; i <= update.beforeRange.end; i++) {
      beforeDiffMap.set(i, { type: 'update', range: update.beforeRange });
    }
    for (let i = update.afterRange.start; i <= update.afterRange.end; i++) {
      afterDiffMap.set(i, { type: 'update', range: update.afterRange });
    }
  });

  return { beforeDiffMap, afterDiffMap, diffResult };
};

// --- Helper functions extracted from the component ---

export const formatHexDump = (data: string): string => {
  const bytes = Array.from(data).map((char) => char.charCodeAt(0));
  const lines = [];

  for (let i = 0; i < bytes.length; i += 16) {
    const lineBytes = bytes.slice(i, i + 16);

    // Hex representation - join bytes with span elements for CSS padding
    const hexPart = lineBytes
      .map((byte) => `<span>${byte.toString(16).padStart(2, '0').toUpperCase()}</span>`)
      .join('');

    // ASCII representation
    const asciiPart = lineBytes
      .map((byte) => {
        if (byte >= 32 && byte <= 126) {
          return String.fromCharCode(byte);
        } else {
          return '.';
        }
      })
      .join('');

    // Line number (offset)
    const offset = i.toString(16).padStart(4, '0').toUpperCase();

    // Create line with HTML styling and proper layout - use CSS for spacing
    const hexSection = `<span class="text-gray-500">${offset}:</span> <span class="text-white hex-grid">${hexPart}</span>`;
    const asciiSection = `<span class="text-gray-400">|${asciiPart}|</span>`;

    // Use flexbox layout to push ASCII to the right
    lines.push(
      `<div class="flex justify-between items-start"><div>${hexSection}</div><div>${asciiSection}</div></div>`
    );
  }

  return lines.join('');
};

export const formatHexOnly = (data: string): string => {
  const bytes = Array.from(data).map((char) => char.charCodeAt(0));
  const lines = [];

  for (let i = 0; i < bytes.length; i += 16) {
    const lineBytes = bytes.slice(i, i + 16);

    // Hex representation - join bytes with span elements for CSS padding
    const hexPart = lineBytes
      .map((byte) => `<span>${byte.toString(16).padStart(2, '0').toUpperCase()}</span>`)
      .join('');

    // Line number (offset)
    const offset = i.toString(16).padStart(4, '0').toUpperCase();

    // Create line with only hex (no ASCII) - use CSS for spacing
    lines.push(`${offset}: <span class="hex-grid">${hexPart}</span>`);
  }

  return lines.join('\n');
};

export const getHexData = (data: any): string => {
  if (typeof data === 'object' && data !== null) {
    // If it's a base64 array, decode and convert to hex
    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        const decoded = atob(data[0]);
        return formatHexDump(decoded);
      } catch (error) {
        return data[0] || '<none>';
      }
    }

    // If it's our new data structure with bytes field, use that
    if (data.bytes && Array.isArray(data.bytes)) {
      const bytes = data.bytes;
      const bytesString = String.fromCharCode(...bytes);
      return formatHexDump(bytesString);
    }

    // If it's an array of numbers (decoded bytes), convert to hex
    if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
      const bytesString = String.fromCharCode(...data);
      return formatHexDump(bytesString);
    }

    // For other objects, convert to hex representation
    const jsonStr = JSON.stringify(data);
    return formatHexDump(jsonStr);
  }
  // For strings, convert to hex
  const str = String(data);
  if (str === '' || str === 'null' || str === 'undefined') return '<none>';
  return formatHexDump(str);
};

export const getHexDataForUpdates = (data: any): string => {
  if (typeof data === 'object' && data !== null) {
    // If it's a base64 array, decode and convert to hex
    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        const decoded = atob(data[0]);
        return decoded === '' ? '<none>' : formatHexOnly(decoded);
      } catch (error) {
        return data[0] === '' ? '<none>' : data[0] || '<none>';
      }
    }

    // If it's our new data structure with bytes field, use that
    if (data.bytes && Array.isArray(data.bytes)) {
      if (data.bytes.length === 0) {
        return '<none>';
      }
      const bytes = data.bytes;
      const bytesString = String.fromCharCode(...bytes);
      return formatHexOnly(bytesString);
    }

    // If it's an array of numbers (decoded bytes), convert to hex
    if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
      if (data.length === 0) {
        return '<none>';
      }
      const bytesString = String.fromCharCode(...data);
      return formatHexOnly(bytesString);
    }

    // Check if it's an empty array or empty object
    if (Array.isArray(data) && data.length === 0) {
      return '<none>';
    }

    if (Object.keys(data).length === 0) {
      return '<none>';
    }

    // For other objects, convert to hex representation
    const jsonStr = JSON.stringify(data);
    if (jsonStr === '[]' || jsonStr === '{}' || jsonStr === 'null' || jsonStr === 'undefined') {
      return '<none>';
    }
    return formatHexOnly(jsonStr);
  }
  // For strings, convert to hex
  const str = String(data);
  if (str === '' || str === 'null' || str === 'undefined') return '<none>';
  return formatHexOnly(str);
};

export const hasJsonData = (data: any): boolean => {
  if (typeof data === 'object' && data !== null) {
    // Check if it has the new structure with json field
    if (data.json) {
      return true;
    }

    // Check if it has the parsed structure with programData
    if (data.parsed && data.parsed.info && data.parsed.info.programData) {
      return true;
    }

    // Check if it's a base64 array format: ["base64string", "base64"]
    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        const decoded = atob(data[0]);
        return decoded !== '' && decoded !== '<none>';
      } catch (error) {
        return data[0] !== '' && data[0] !== '<none>';
      }
    }

    // Check if it's a meaningful JSON object (not empty)
    try {
      const jsonStr = JSON.stringify(data);
      return jsonStr !== '{}' && jsonStr !== 'null' && jsonStr !== 'undefined';
    } catch (error) {
      return false;
    }
  }
  const stringValue = String(data);
  return stringValue !== '' && stringValue !== 'null' && stringValue !== 'undefined' && stringValue !== '<none>';
};

export const extractProgramData = (data: any): any => {
  if (typeof data === 'object' && data !== null) {
    // Check if it has the new structure with json field
    if (data.json) {
      return data.json;
    }

    // Check if it has the parsed structure with programData
    if (data.parsed && data.parsed.info && data.parsed.info.programData) {
      return data.parsed.info.programData;
    }

    // Check if it's a base64 array format: ["base64string", "base64"]
    if (Array.isArray(data) && data.length === 2 && data[1] === 'base64') {
      try {
        const decoded = atob(data[0]);
        return decoded === '' ? '<none>' : decoded;
      } catch (error) {
        // If decoding fails, return the original base64 string
        return data[0] === '' ? '<none>' : data[0];
      }
    }

    // Check if it's an empty array or empty object
    if (Array.isArray(data) && data.length === 0) {
      return '<none>';
    }

    if (Object.keys(data).length === 0) {
      return '<none>';
    }

    // Pretty print JSON objects
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      // Check if the JSON string represents empty data
      if (jsonStr === '[]' || jsonStr === '{}' || jsonStr === 'null' || jsonStr === 'undefined') {
        return '<none>';
      }
      return jsonStr;
    } catch (error) {
      return JSON.stringify(data);
    }
  }
  const stringValue = String(data);
  return stringValue === '' || stringValue === 'null' || stringValue === 'undefined' ? '<none>' : stringValue;
};

export const findChangedPaths = (beforeObj: any, afterObj: any, currentPath: string[] = []): Set<string> => {
  const changedPaths = new Set<string>();

  if (typeof beforeObj !== typeof afterObj) {
    // Different types - mark current path as changed
    changedPaths.add(currentPath.join('.'));
    return changedPaths;
  }

  if (typeof beforeObj !== 'object' || beforeObj === null || afterObj === null) {
    // Primitive values - compare directly
    if (beforeObj !== afterObj) {
      changedPaths.add(currentPath.join('.'));
    }
    return changedPaths;
  }

  if (Array.isArray(beforeObj) !== Array.isArray(afterObj)) {
    // One is array, other is object
    changedPaths.add(currentPath.join('.'));
    return changedPaths;
  }

  if (Array.isArray(beforeObj)) {
    // Arrays - compare each element
    const maxLength = Math.max(beforeObj.length, afterObj.length);
    for (let i = 0; i < maxLength; i++) {
      const beforeItem = beforeObj[i];
      const afterItem = afterObj[i];
      const itemPath = [...currentPath, i.toString()];
      const itemChanges = findChangedPaths(beforeItem, afterItem, itemPath);
      itemChanges.forEach((path) => changedPaths.add(path));
    }
  } else {
    // Objects - compare each property
    const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
    for (const key of allKeys) {
      const beforeValue = beforeObj[key];
      const afterValue = afterObj[key];
      const keyPath = [...currentPath, key];

      // Check if property exists in both objects
      const beforeExists = key in beforeObj;
      const afterExists = key in afterObj;

      if (!beforeExists || !afterExists) {
        // Property was added or removed
        changedPaths.add(keyPath.join('.'));
      } else {
        // Property exists in both - compare values
        const keyChanges = findChangedPaths(beforeValue, afterValue, keyPath);
        keyChanges.forEach((path) => changedPaths.add(path));
      }
    }
  }

  return changedPaths;
};
