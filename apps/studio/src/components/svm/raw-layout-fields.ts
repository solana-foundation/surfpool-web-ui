type RawLayoutProperty = {
  path: string;
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
