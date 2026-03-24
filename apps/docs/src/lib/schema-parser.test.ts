import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the JSON imports before importing the module under test
vi.mock('@/data/rpc-schema.json', () => ({
  default: {
    $defs: {
      Commitment: {
        type: 'string',
        enum: ['finalized', 'confirmed', 'processed'],
        description: 'The commitment level',
      },
      AccountConfig: {
        type: 'object',
        properties: {
          encoding: { type: 'string', description: 'Encoding format' },
          commitment: { $ref: '#/$defs/Commitment' },
        },
        required: ['encoding'],
        description: 'Account configuration',
      },
      SimpleRef: {
        type: 'string',
        description: 'A simple referenced type',
      },
    },
  },
}));

vi.mock('@/data/response_schema.json', () => ({
  default: {
    $defs: {
      BasicResult: {
        type: 'object',
        properties: {
          value: { type: 'integer' },
        },
      },
    },
  },
}));

import {
  extractParametersFromSchema,
  generateSampleFromSchema,
  formatResponseSchema,
} from './schema-parser';

describe('generateSampleFromSchema', () => {
  const schemaSource = {
    $defs: {
      Commitment: {
        type: 'string',
        enum: ['finalized', 'confirmed', 'processed'],
      },
      NestedObj: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
    },
  };

  it('returns null for null/undefined input', () => {
    expect(generateSampleFromSchema(null, schemaSource)).toBeNull();
    expect(generateSampleFromSchema(undefined, schemaSource)).toBeNull();
  });

  it('handles const values', () => {
    expect(generateSampleFromSchema({ const: '2.0' }, schemaSource)).toBe('2.0');
  });

  it('returns first enum value', () => {
    const schema = { enum: ['finalized', 'confirmed', 'processed'] };
    expect(generateSampleFromSchema(schema, schemaSource)).toBe('finalized');
  });

  it('resolves $ref', () => {
    const schema = { $ref: '#/$defs/Commitment' };
    expect(generateSampleFromSchema(schema, schemaSource)).toBe('finalized');
  });

  it('handles anyOf by picking first non-null', () => {
    const schema = {
      anyOf: [{ type: 'null' }, { type: 'string' }],
    };
    expect(generateSampleFromSchema(schema, schemaSource)).toBe('string');
  });

  it('handles oneOf by picking first non-null', () => {
    const schema = {
      oneOf: [{ type: 'null' }, { type: 'integer' }],
    };
    expect(generateSampleFromSchema(schema, schemaSource)).toBe(0);
  });

  it('generates object samples from properties', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
      },
    };
    const result = generateSampleFromSchema(schema, schemaSource);
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('count');
    expect(typeof result.count).toBe('number');
  });

  it('generates array samples', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
    };
    const result = generateSampleFromSchema(schema, schemaSource);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('generates contextual string for pubkey field', () => {
    const schema = { type: 'string' };
    const result = generateSampleFromSchema(schema, schemaSource, 'pubkey');
    expect(result).toBe('83astBRguLMdt2h5U1Tpdq5tjFoJ6noeGwaY3mDLVcri');
  });

  it('generates contextual string for signature field', () => {
    const schema = { type: 'string' };
    const result = generateSampleFromSchema(schema, schemaSource, 'signature');
    expect(result).toContain('5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW');
  });

  it('returns boolean true for boolean type', () => {
    expect(generateSampleFromSchema({ type: 'boolean' }, schemaSource)).toBe(true);
  });

  it('returns default value when present', () => {
    expect(generateSampleFromSchema({ default: 42 }, schemaSource)).toBe(42);
  });
});

describe('extractParametersFromSchema', () => {
  it('returns empty array for null input', () => {
    expect(extractParametersFromSchema(null, 'test')).toEqual([]);
  });

  it('extracts flat object properties', () => {
    const schema = {
      properties: {
        address: { type: 'string', description: 'The account address' },
        slot: { type: 'integer', description: 'Slot number' },
      },
      required: ['address'],
    };
    const params = extractParametersFromSchema(schema, 'getAccountInfo');
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe('address');
    expect(params[0].required).toBe(true);
    expect(params[1].name).toBe('slot');
    expect(params[1].required).toBe(false);
  });

  it('extracts nested object via $ref', () => {
    const schema = {
      properties: {
        config: { $ref: '#/$defs/AccountConfig' },
      },
      required: ['config'],
    };
    const params = extractParametersFromSchema(schema, 'getAccountInfo');
    // Should have the object header + nested properties
    expect(params.length).toBeGreaterThanOrEqual(2);
    expect(params[0].name).toBe('config');
    expect(params[0].isObjectHeader).toBe(true);
  });

  it('handles simple $ref types', () => {
    const schema = {
      properties: {
        commitment: { $ref: '#/$defs/SimpleRef' },
      },
      required: [],
    };
    const params = extractParametersFromSchema(schema, 'test');
    expect(params).toHaveLength(1);
    expect(params[0].name).toBe('commitment');
    expect(params[0].type).toBe('string');
  });

  it('handles inline object properties', () => {
    const schema = {
      properties: {
        options: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: 'Max results' },
          },
          required: ['limit'],
        },
      },
      required: [],
    };
    const params = extractParametersFromSchema(schema, 'test');
    expect(params.length).toBeGreaterThanOrEqual(2);
    expect(params[0].isObjectHeader).toBe(true);
  });
});

describe('formatResponseSchema', () => {
  it('wraps result in JSON-RPC envelope', () => {
    const schema = { type: 'integer' };
    const responseSchemaSource = { $defs: {} };
    const result = formatResponseSchema(schema);
    const parsed = JSON.parse(result);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe(1);
    expect(parsed).toHaveProperty('result');
  });

  it('returns error object for null schema', () => {
    const result = formatResponseSchema(null);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBe('Schema not found');
  });
});
