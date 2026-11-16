import { LosslessNumber } from 'lossless-json';
import { describe, expect, it, vi } from 'vitest';
import { buildPmmFairValueScenario, createTemplateScenario, type PmmFairValueAdapter } from './pmm-fair-value';

describe('createTemplateScenario', () => {
  it('posts the scenario losslessly and returns its id', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'scenario-id' }) }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createTemplateScenario('http://studio', { id: 'scenario-id', value: new LosslessNumber('9975062344139650') })
    ).resolves.toEqual({ id: 'scenario-id' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://studio/v1/scenarios');
    expect(init).toMatchObject({ method: 'POST', body: '{"id":"scenario-id","value":9975062344139650}' });
    vi.unstubAllGlobals();
  });
});

describe('buildPmmFairValueScenario', () => {
  it('keeps an integer an adapter gives as bigint exact and leaves other values as given', () => {
    const adapter: PmmFairValueAdapter = {
      protocol: 'test',
      label: 'Test',
      marketTemplateId: 'test-price',
      markets: [],
      readMarket: vi.fn(),
      buildOverrides: () => [
        {
          templateId: 'test-price',
          label: 'Test price',
          account: { pubkey: 'market' },
          values: { small: BigInt(42), large: BigInt('18446744073709551615'), ratio: '7', oracle: 'oracle' },
        },
      ],
    };

    const [override] = buildPmmFairValueScenario(adapter, { label: 'A / B', value: 'market' }, '1').overrides;
    expect(override.values).toEqual({
      small: 42,
      large: new LosslessNumber('18446744073709551615'),
      ratio: '7',
      oracle: 'oracle',
    });
  });
});
