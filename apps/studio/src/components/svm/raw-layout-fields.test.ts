import { describe, expect, it } from 'vitest';
import { getFieldsFromRawLayout } from './raw-layout-fields';

describe('getFieldsFromRawLayout', () => {
  it('returns no fields for an IDL-only template', () => {
    expect(getFieldsFromRawLayout({ properties: [{ path: 'value', encoding: 'u64' }] })).toEqual([]);
  });

  it('turns scalar encodings into editable fields', () => {
    expect(
      getFieldsFromRawLayout({
        rawLayout: true,
        properties: [
          { path: 'amount', encoding: 'u64' },
          { path: 'owner', encoding: 'bytes32' },
        ],
      })
    ).toEqual([
      { name: 'amount', type: 'u64' },
      { name: 'owner', type: 'bytes32' },
    ]);
  });

  it('uses the scalar type behind a strided encoding', () => {
    expect(
      getFieldsFromRawLayout({
        rawLayout: true,
        properties: [{ path: 'levels', encoding: { i32_strided: { count: 3, stride: 16 } } }],
      })
    ).toEqual([{ name: 'levels', type: 'i32' }]);
  });
});
