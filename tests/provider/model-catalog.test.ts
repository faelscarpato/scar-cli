import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelCatalog } from '../../src/provider/model-catalog.js';

describe('ModelCatalog', () => {
  it('should identify free models with :free suffix', () => {
    const catalog = new ModelCatalog({
      baseUrl: 'https://openrouter.ai/api/v1',
      providerName: 'openrouter',
    });

    expect(catalog.isModelFree('google/gemini-2.5-flash:free')).toBe(true);
    expect(catalog.isModelFree('deepseek/deepseek-r1:free')).toBe(true);
    expect(catalog.isModelFree('openai/gpt-4o')).toBe(false);
  });

  it('should treat all Ollama and localhost models as free', () => {
    const ollamaCatalog = new ModelCatalog({
      baseUrl: 'http://localhost:11434/v1',
      providerName: 'ollama',
    });

    expect(ollamaCatalog.isModelFree('qwen2.5-coder:7b')).toBe(true);
    expect(ollamaCatalog.isModelFree('llama3.3:70b')).toBe(true);
  });

  it('should treat zero-cost models as free based on pricing payload', () => {
    const catalog = new ModelCatalog({
      baseUrl: 'https://custom.ai/v1',
      providerName: 'custom',
    });

    expect(
      catalog.isModelFree('custom-fast', {
        id: 'custom-fast',
        pricing: { prompt: '0', completion: '0' },
      }),
    ).toBe(true);

    expect(
      catalog.isModelFree('custom-paid', {
        id: 'custom-paid',
        pricing: { prompt: '0.0001', completion: '0.0002' },
      }),
    ).toBe(false);
  });

  it('should detect Groq free tier models', () => {
    const groqCatalog = new ModelCatalog({
      baseUrl: 'https://api.groq.com/openai/v1',
      providerName: 'groq',
    });

    expect(groqCatalog.isModelFree('llama-3.3-70b-versatile')).toBe(true);
    expect(groqCatalog.isModelFree('llama-3.1-8b-instant')).toBe(true);
  });

  it('should parse GET /models response and prioritize free models', async () => {
    const mockApiResponse = {
      data: [
        { id: 'anthropic/claude-3-haiku', pricing: { prompt: '0.00025', completion: '0.00125' } },
        { id: 'google/gemini-2.5-flash:free', pricing: { prompt: '0', completion: '0' } },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', pricing: { prompt: '0', completion: '0' } },
        { id: 'openai/gpt-4o-mini', pricing: { prompt: '0.00015', completion: '0.0006' } },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as unknown as Response);

    const catalog = new ModelCatalog({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      providerName: 'openrouter',
    });

    const models = await catalog.fetchAvailableModels();

    expect(fetchSpy).toHaveBeenCalled();
    expect(models.length).toBe(4);
    // Free models must come first
    expect(models[0].isFree).toBe(true);
    expect(models[1].isFree).toBe(true);
    expect(models[2].isFree).toBe(false);
    expect(models[3].isFree).toBe(false);

    fetchSpy.mockRestore();
  });

  it('should return curated fallback models when API request fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const catalog = new ModelCatalog({
      baseUrl: 'https://openrouter.ai/api/v1',
      providerName: 'openrouter',
    });

    const models = await catalog.fetchAvailableModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === 'google/gemini-2.5-flash:free')).toBe(true);

    fetchSpy.mockRestore();
  });

  it('should return error without concealing 401 when testing connection', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'No cookie auth credentials found' } }),
    } as unknown as Response);

    const catalog = new ModelCatalog({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      providerName: 'openrouter',
    });

    const res = await catalog.testConnectionAndFetchModels();
    expect(res.success).toBe(false);
    expect(res.error).toContain('401 Unauthorized');
    expect(res.error).toContain('No cookie auth credentials found');

    fetchSpy.mockRestore();
  });
});
