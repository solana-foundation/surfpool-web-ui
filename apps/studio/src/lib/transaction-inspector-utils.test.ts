import { describe, it, expect } from 'vitest';
import {
  getProgramType,
  getProgramName,
  decodeAccountData,
  computeHexDiff,
  formatHexDump,
  formatHexOnly,
  getHexData,
  getHexDataForUpdates,
  hasJsonData,
  extractProgramData,
  findChangedPaths,
} from './transaction-inspector-utils';

describe('getProgramType', () => {
  it('returns SYSTEM PROGRAM for system program address', () => {
    expect(getProgramType('11111111111111111111111111111111')).toBe('SYSTEM PROGRAM');
  });

  it('returns TOKEN PROGRAM for token program address', () => {
    expect(getProgramType('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toBe('TOKEN PROGRAM');
  });

  it('returns ASSOCIATED TOKEN PROGRAM', () => {
    expect(getProgramType('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')).toBe('ASSOCIATED TOKEN PROGRAM');
  });

  it('returns JUP PROGRAM', () => {
    expect(getProgramType('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')).toBe('JUP PROGRAM');
  });

  it('returns COMPUTE BUDGET PROGRAM', () => {
    expect(getProgramType('ComputeBudget111111111111111111111111111111')).toBe('COMPUTE BUDGET PROGRAM');
  });

  it('returns undefined for unknown address', () => {
    expect(getProgramType('unknown-address')).toBeUndefined();
  });
});

describe('getProgramName', () => {
  it('returns program type label for known programs', () => {
    expect(getProgramName('11111111111111111111111111111111')).toBe('SYSTEM PROGRAM');
  });

  it('returns the address itself for unknown programs', () => {
    const addr = 'SomeUnknownProgram1111111111111111111111111';
    expect(getProgramName(addr)).toBe(addr);
  });
});

describe('decodeAccountData', () => {
  it('returns numeric arrays as-is', () => {
    const data = [1, 2, 3, 4];
    expect(decodeAccountData(data)).toEqual([1, 2, 3, 4]);
  });

  it('decodes base64 data to byte array', () => {
    // "AQID" is base64 for bytes [1, 2, 3]
    const result = decodeAccountData(['AQID', 'base64']);
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns base58 data as string', () => {
    const result = decodeAccountData(['someBase58Data', 'base58']);
    expect(result).toBe('someBase58Data');
  });

  it('returns unknown encoding as-is', () => {
    const data = ['data', 'unknown'];
    expect(decodeAccountData(data)).toEqual(data);
  });

  it('returns parsed JSON objects as-is', () => {
    const data = { program: 'spl-token', parsed: { type: 'account' } };
    expect(decodeAccountData(data)).toEqual(data);
  });

  it('returns strings as-is', () => {
    expect(decodeAccountData('hello')).toBe('hello');
  });
});

describe('computeHexDiff', () => {
  it('returns empty maps for identical arrays', () => {
    const bytes = [1, 2, 3];
    const { beforeDiffMap, afterDiffMap } = computeHexDiff(bytes, bytes);
    expect(beforeDiffMap.size).toBe(0);
    expect(afterDiffMap.size).toBe(0);
  });

  it('marks additions in afterDiffMap', () => {
    const { afterDiffMap } = computeHexDiff([1, 2], [1, 2, 3]);
    expect(afterDiffMap.size).toBeGreaterThan(0);
    const entry = afterDiffMap.get(2);
    expect(entry?.type).toBe('addition');
  });

  it('marks removals in beforeDiffMap', () => {
    const { beforeDiffMap } = computeHexDiff([1, 2, 3], [1, 2]);
    expect(beforeDiffMap.size).toBeGreaterThan(0);
    const entry = beforeDiffMap.get(2);
    expect(entry?.type).toBe('removal');
  });

  it('marks updates in both maps', () => {
    const { beforeDiffMap, afterDiffMap } = computeHexDiff([1, 2, 3], [1, 9, 3]);
    // byte at index 1 changed from 2 to 9
    expect(beforeDiffMap.get(1)?.type).toBe('update');
    expect(afterDiffMap.get(1)?.type).toBe('update');
  });
});

describe('formatHexDump', () => {
  it('returns HTML with hex values and ASCII', () => {
    const result = formatHexDump('AB');
    expect(result).toContain('41'); // hex for 'A'
    expect(result).toContain('42'); // hex for 'B'
    expect(result).toContain('|AB|'); // ASCII section
  });

  it('replaces non-printable chars with dots in ASCII', () => {
    const result = formatHexDump('\x01');
    expect(result).toContain('|.|');
  });

  it('includes offset', () => {
    const result = formatHexDump('A');
    expect(result).toContain('0000');
  });
});

describe('formatHexOnly', () => {
  it('returns hex values without ASCII column', () => {
    const result = formatHexOnly('AB');
    expect(result).toContain('41');
    expect(result).toContain('42');
    expect(result).not.toContain('|AB|');
  });
});

describe('getHexData', () => {
  it('converts base64 array data', () => {
    // 'QUI=' is base64 for 'AB'
    const result = getHexData(['QUI=', 'base64']);
    expect(result).toContain('41'); // hex for 'A'
    expect(result).toContain('42'); // hex for 'B'
  });

  it('converts byte arrays', () => {
    const result = getHexData([65, 66]); // 'A', 'B'
    expect(result).toContain('41');
  });

  it('converts data with bytes field', () => {
    const result = getHexData({ bytes: [65, 66] });
    expect(result).toContain('41');
  });

  it('returns <none> for empty/null values', () => {
    expect(getHexData('')).toBe('<none>');
    expect(getHexData('null')).toBe('<none>');
    expect(getHexData('undefined')).toBe('<none>');
  });

  it('converts objects to hex via JSON', () => {
    const result = getHexData({ key: 'value' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getHexDataForUpdates', () => {
  it('returns <none> for empty byte arrays', () => {
    expect(getHexDataForUpdates({ bytes: [] })).toBe('<none>');
    expect(getHexDataForUpdates([])).toBe('<none>');
  });

  it('converts base64 data using formatHexOnly', () => {
    const result = getHexDataForUpdates(['QUI=', 'base64']);
    expect(result).toContain('41');
    // formatHexOnly doesn't include ASCII, so no pipe characters
    expect(result).not.toContain('|');
  });

  it('returns <none> for empty objects', () => {
    expect(getHexDataForUpdates({})).toBe('<none>');
  });
});

describe('hasJsonData', () => {
  it('returns true for objects with json field', () => {
    expect(hasJsonData({ json: { program: 'spl-token' } })).toBe(true);
  });

  it('returns true for objects with parsed.info.programData', () => {
    expect(hasJsonData({ parsed: { info: { programData: 'data' } } })).toBe(true);
  });

  it('returns true for non-empty base64 arrays', () => {
    expect(hasJsonData(['AQID', 'base64'])).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(hasJsonData('')).toBe(false);
  });

  it('returns false for null/undefined strings', () => {
    expect(hasJsonData('null')).toBe(false);
    expect(hasJsonData('undefined')).toBe(false);
  });

  it('returns true for objects with content', () => {
    expect(hasJsonData({ key: 'value' })).toBe(true);
  });

  it('returns false for empty objects', () => {
    // JSON.stringify({}) === '{}' — but hasJsonData actually returns true
    // because it checks typeof === 'object' and then tries JSON.stringify
    // which returns '{}' and that !== '{}' is false, so returns false
    expect(hasJsonData({})).toBe(false);
  });
});

describe('extractProgramData', () => {
  it('extracts json field', () => {
    const data = { json: { program: 'spl-token', parsed: {} } };
    expect(extractProgramData(data)).toEqual(data.json);
  });

  it('extracts parsed.info.programData', () => {
    const data = { parsed: { info: { programData: 'some-data' } } };
    expect(extractProgramData(data)).toBe('some-data');
  });

  it('decodes base64 data', () => {
    const result = extractProgramData(['AQID', 'base64']);
    expect(typeof result).toBe('string');
    expect(result).not.toBe('<none>');
  });

  it('returns <none> for empty base64', () => {
    expect(extractProgramData(['', 'base64'])).toBe('<none>');
  });

  it('returns <none> for empty arrays', () => {
    expect(extractProgramData([])).toBe('<none>');
  });

  it('returns <none> for empty objects', () => {
    expect(extractProgramData({})).toBe('<none>');
  });

  it('pretty-prints JSON objects', () => {
    const result = extractProgramData({ key: 'value' });
    expect(result).toContain('"key"');
    expect(result).toContain('"value"');
  });

  it('returns <none> for empty/null strings', () => {
    expect(extractProgramData('')).toBe('<none>');
    expect(extractProgramData('null')).toBe('<none>');
  });
});

describe('findChangedPaths', () => {
  it('returns empty set for identical objects', () => {
    const obj = { a: 1, b: 'hello' };
    expect(findChangedPaths(obj, obj).size).toBe(0);
  });

  it('finds changed primitive values', () => {
    const before = { a: 1, b: 2 };
    const after = { a: 1, b: 3 };
    const paths = findChangedPaths(before, after);
    expect(paths.has('b')).toBe(true);
    expect(paths.size).toBe(1);
  });

  it('finds nested changes', () => {
    const before = { a: { b: { c: 1 } } };
    const after = { a: { b: { c: 2 } } };
    const paths = findChangedPaths(before, after);
    expect(paths.has('a.b.c')).toBe(true);
  });

  it('detects added properties', () => {
    const before = { a: 1 };
    const after = { a: 1, b: 2 };
    const paths = findChangedPaths(before, after);
    expect(paths.has('b')).toBe(true);
  });

  it('detects removed properties', () => {
    const before = { a: 1, b: 2 };
    const after = { a: 1 };
    const paths = findChangedPaths(before, after);
    expect(paths.has('b')).toBe(true);
  });

  it('handles array differences', () => {
    const before = { arr: [1, 2, 3] };
    const after = { arr: [1, 9, 3] };
    const paths = findChangedPaths(before, after);
    expect(paths.has('arr.1')).toBe(true);
  });

  it('handles type mismatches', () => {
    const paths = findChangedPaths({ a: 'string' }, { a: 123 });
    expect(paths.has('a')).toBe(true);
  });

  it('handles null values', () => {
    const paths = findChangedPaths({ a: null }, { a: 'value' });
    expect(paths.has('a')).toBe(true);
  });
});
