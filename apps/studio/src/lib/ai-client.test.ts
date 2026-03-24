import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AI_PROVIDERS,
  DEFAULT_MODEL_ID,
  getModelById,
  getProviderById,
  getApiKey,
  setApiKey,
  clearApiKey,
  fetchOllamaStatus,
} from './ai-client';

describe('AI_PROVIDERS', () => {
  it('contains all expected providers', () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(ids).toContain('groq');
    expect(ids).toContain('ollama');
    expect(ids).toContain('openai');
    expect(ids).toContain('claude');
    expect(ids).toContain('gemini');
  });

  it('each provider has required fields', () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.id).toBeTruthy();
      expect(provider.name).toBeTruthy();
      expect(provider.icon).toBeTruthy();
      expect(typeof provider.requiresKey).toBe('boolean');
    }
  });

  it('ollama does not require a key', () => {
    const ollama = AI_PROVIDERS.find((p) => p.id === 'ollama');
    expect(ollama?.requiresKey).toBe(false);
  });

  it('all non-ollama providers require a key', () => {
    const nonOllama = AI_PROVIDERS.filter((p) => p.id !== 'ollama');
    for (const provider of nonOllama) {
      expect(provider.requiresKey).toBe(true);
    }
  });
});

describe('DEFAULT_MODEL_ID', () => {
  it('is a valid model', () => {
    expect(getModelById(DEFAULT_MODEL_ID)).toBeDefined();
  });
});

describe('getModelById', () => {
  it('finds a known static model', () => {
    const model = getModelById('groq-llama-8b');
    expect(model).toBeDefined();
    expect(model?.provider).toBe('groq');
    expect(model?.model).toBe('llama-3.1-8b-instant');
  });

  it('finds claude models', () => {
    const model = getModelById('claude-haiku');
    expect(model).toBeDefined();
    expect(model?.provider).toBe('claude');
  });

  it('returns undefined for unknown model', () => {
    expect(getModelById('nonexistent-model')).toBeUndefined();
  });

  it('handles dynamic ollama models', () => {
    const model = getModelById('ollama-llama3--latest');
    expect(model).toBeDefined();
    expect(model?.provider).toBe('ollama');
    expect(model?.model).toBe('llama3:latest');
    expect(model?.name).toBe('llama3');
    expect(model?.description).toBe('Local');
  });

  it('handles ollama model without tag', () => {
    const model = getModelById('ollama-mistral');
    expect(model).toBeDefined();
    expect(model?.model).toBe('mistral');
  });
});

describe('getProviderById', () => {
  it('finds a known provider', () => {
    const provider = getProviderById('claude');
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('Claude');
  });

  it('returns undefined for unknown provider', () => {
    expect(getProviderById('unknown' as any)).toBeUndefined();
  });
});

describe('API key storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and retrieves API keys', () => {
    setApiKey('groq', 'test-key-123');
    expect(getApiKey('groq')).toBe('test-key-123');
  });

  it('returns null for unset keys', () => {
    expect(getApiKey('openai')).toBeNull();
  });

  it('ollama returns default URL when not set', () => {
    expect(getApiKey('ollama')).toBe('http://localhost:11434');
  });

  it('ollama returns custom URL when set', () => {
    setApiKey('ollama', 'http://custom:1234');
    expect(getApiKey('ollama')).toBe('http://custom:1234');
  });

  it('clears API keys', () => {
    setApiKey('claude', 'sk-test');
    clearApiKey('claude');
    expect(getApiKey('claude')).toBeNull();
  });
});

describe('fetchOllamaStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns available models on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          models: [
            { name: 'llama3:latest', size: 4700000000 },
            { name: 'mistral:7b', size: 7000000000 },
          ],
        }),
    });

    const status = await fetchOllamaStatus('http://localhost:11434');
    expect(status.available).toBe(true);
    expect(status.models).toHaveLength(2);
    expect(status.models[0].id).toBe('ollama-llama3--latest');
    expect(status.models[0].provider).toBe('ollama');
    expect(status.models[0].name).toBe('Llama3');
    expect(status.models[0].description).toContain('Local');
  });

  it('returns unavailable on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));
    const status = await fetchOllamaStatus();
    expect(status.available).toBe(false);
    expect(status.models).toHaveLength(0);
  });

  it('returns unavailable on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const status = await fetchOllamaStatus();
    expect(status.available).toBe(false);
    expect(status.models).toHaveLength(0);
  });
});
