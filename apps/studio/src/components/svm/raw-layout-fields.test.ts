import { describe, expect, it } from 'vitest';
import { decodeRawLayoutAccountData, getFieldsFromRawLayout } from './raw-layout-fields';

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

describe('decodeRawLayoutAccountData', () => {
  const writeLittleEndian = (bytes: Uint8Array, offset: number, width: number, value: bigint) => {
    const modulus = BigInt(1) << BigInt(width * 8);
    let remaining = value < BigInt(0) ? modulus + value : value;
    for (let index = 0; index < width; index++) {
      bytes[offset + index] = Number(remaining & BigInt(255));
      remaining >>= BigInt(8);
    }
  };

  it('decodes BisonFi scalar and strided values without losing integer precision', () => {
    const bytes = new Uint8Array(64);
    writeLittleEndian(bytes, 8, 16, BigInt('3094850098213450687247810560'));
    writeLittleEndian(bytes, 32, 8, BigInt('22008930770'));
    writeLittleEndian(bytes, 48, 4, BigInt(-25600));

    expect(
      decodeRawLayoutAccountData(
        {
          rawLayout: true,
          properties: [
            { path: 'fair_value', offset: 8, encoding: 'u128' },
            { path: 'quote_reserve', offset: 32, encoding: 'u64' },
            {
              path: 'working_levels.0.tick_offset',
              offset: 48,
              encoding: { i32_strided: { count: 4, stride: 16 } },
            },
          ],
        },
        bytes
      )
    ).toEqual({
      fair_value: '3094850098213450687247810560',
      quote_reserve: '22008930770',
      working_levels: { 0: { tick_offset: -25600 } },
    });
  });

  it('does not present a stored absolute slot as the slot-relative freshness input', () => {
    const bytes = new Uint8Array(16);
    writeLittleEndian(bytes, 0, 8, BigInt(1234));

    expect(
      decodeRawLayoutAccountData(
        {
          rawLayout: true,
          properties: [{ path: 'last_update_slot', offset: 0, encoding: { slot: { lead: 0 } } }],
        },
        bytes
      )
    ).toEqual({});
  });
});
