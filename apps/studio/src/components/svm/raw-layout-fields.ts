type RawLayoutProperty = {
  path: string;
  offset?: number;
  encoding?: string | Record<string, unknown>;
};

type RawLayoutTemplate = {
  rawLayout?: boolean;
  properties?: RawLayoutProperty[];
};

export function getFieldsFromRawLayout(template: RawLayoutTemplate | null | undefined) {
  if (!template?.rawLayout || !Array.isArray(template.properties)) return [];

  return template.properties.map((property) => ({
    name: property.path,
    type:
      typeof property.encoding === 'string'
        ? property.encoding
        : Object.keys(property.encoding ?? {})[0]?.replace(/_strided$/, '') || 'u64',
  }));
}

const readUnsignedLittleEndian = (bytes: Uint8Array, offset: number, width: number) => {
  if (offset < 0 || offset + width > bytes.length) return null;

  let value = BigInt(0);
  for (let index = width - 1; index >= 0; index--) {
    value = (value << BigInt(8)) | BigInt(bytes[offset + index]);
  }
  return value;
};

const setPath = (target: Record<string, unknown>, path: string, value: unknown) => {
  const segments = path.split('.');
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
};

const integerWidth = (encoding: string) => {
  switch (encoding) {
    case 'u8':
      return 1;
    case 'u16':
      return 2;
    case 'u32':
    case 'i32':
    case 'i32_strided':
      return 4;
    case 'u64':
    case 'i64':
      return 8;
    case 'u128':
    case 'i128':
      return 16;
    default:
      return null;
  }
};

/** Decodes the editable integer fields exposed by a raw-layout template. */
export function decodeRawLayoutAccountData(
  template: RawLayoutTemplate | null | undefined,
  bytes: Uint8Array
): Record<string, unknown> {
  if (!template?.rawLayout || !Array.isArray(template.properties)) return {};

  const decoded: Record<string, unknown> = {};
  for (const property of template.properties) {
    if (typeof property.offset !== 'number' || property.encoding === undefined) continue;

    const encoding = typeof property.encoding === 'string' ? property.encoding : Object.keys(property.encoding)[0];
    const width = integerWidth(encoding);
    if (width === null) continue;

    const unsigned = readUnsignedLittleEndian(bytes, property.offset, width);
    if (unsigned === null) continue;

    const signed = encoding.startsWith('i');
    const signBit = BigInt(1) << BigInt(width * 8 - 1);
    const value = signed && (unsigned & signBit) !== BigInt(0) ? unsigned - (BigInt(1) << BigInt(width * 8)) : unsigned;

    // Keep wide integers as strings so JavaScript cannot round account values silently.
    setPath(decoded, property.path, width >= 8 ? value.toString() : Number(value));
  }

  return decoded;
}
