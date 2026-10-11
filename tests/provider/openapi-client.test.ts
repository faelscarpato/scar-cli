import { describe, it, expect, vi } from 'vitest';
import { OpenApiClient, OpenApiError } from '../../src/provider/openapi-client.js';

function createMockSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('OpenApiClient', () => {
  it('should stream text tokens and return complete response', async () => {
    const sseChunks = [
      'data: {"id":"chat-1","choices":[{"index":0,"delta":{"role":"assistant","content":"Olá"},"finish_reason":null}]}\n\n',
      'data: {"id":"chat-1","choices":[{"index":0,"delta":{"content":", como"},"finish_reason":null}]}\n\n',
      'data: {"id":"chat-1","choices":[{"index":0,"delta":{"content":" posso ajudar?"},"finish_reason":null}]}\n\n',
      'data: {"id":"chat-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const mockResponse = {
      ok: true,
      status: 200,
      body: createMockSseStream(sseChunks),
    } as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new OpenApiClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-api-key',
    });

    const tokens: string[] = [];
    const result = await client.streamChat(
      {
        model: 'google/gemini-2.5-flash:free',
        messages: [{ role: 'user', content: 'Olá' }],
      },
      {
        onToken: (tok) => tokens.push(tok),
      },
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(tokens.join('')).toBe('Olá, como posso ajudar?');
    expect(result.content).toBe('Olá, como posso ajudar?');
    expect(result.finishReason).toBe('stop');

    fetchSpy.mockRestore();
  });

  it('should stream and assemble fragmented tool calls correctly', async () => {
    const sseChunks = [
      'data: {"id":"chat-tools","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"read_","arguments":""}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chat-tools","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"file","arguments":"{\\"path\\": "}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chat-tools","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"src/index.ts\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const mockResponse = {
      ok: true,
      status: 200,
      body: createMockSseStream(sseChunks),
    } as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new OpenApiClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
    });

    const result = await client.streamChat({
      model: 'google/gemini-2.5-flash:free',
      messages: [{ role: 'user', content: 'leia o index' }],
    });

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls?.length).toBe(1);
    expect(result.toolCalls?.[0].id).toBe('call_abc');
    expect(result.toolCalls?.[0].function.name).toBe('read_file');
    expect(result.toolCalls?.[0].function.arguments).toBe('{"path": "src/index.ts"}');
    expect(result.finishReason).toBe('tool_calls');

    fetchSpy.mockRestore();
  });

  it('should throw OpenApiError on 401 Unauthorized', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'Invalid API key provided' } }),
    } as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new OpenApiClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'bad-key',
    });

    await expect(
      client.streamChat({
        model: 'google/gemini-2.5-flash:free',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow(/401 Unauthorized/);

    fetchSpy.mockRestore();
  });

  it('should throw OpenApiError on 429 Rate Limit', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: { message: 'Rate limit reached' } }),
    } as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new OpenApiClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
    });

    await expect(
      client.streamChat({
        model: 'google/gemini-2.5-flash:free',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow(/429 Rate Limit/);

    fetchSpy.mockRestore();
  });

  it('should handle UTF-8 multibyte characters split across binary chunks', async () => {
    // String com acentuação e emoji: 'Ação 🚀 completa'
    const fullSseString =
      'data: {"choices":[{"index":0,"delta":{"content":"Ação 🚀 completa"}}]}\n\ndata: [DONE]\n\n';
    const encoder = new TextEncoder();
    const allBytes = encoder.encode(fullSseString);

    // Divide exatamente no meio de um caractere multibyte
    const half = Math.floor(allBytes.length / 2);
    const chunk1 = allBytes.subarray(0, half);
    const chunk2 = allBytes.subarray(half);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    const mockResponse = {
      ok: true,
      status: 200,
      body: stream,
    } as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new OpenApiClient({
      baseUrl: 'https://openrouter.ai/api/v1',
    });

    const result = await client.streamChat({
      model: 'google/gemini-2.5-flash:free',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.content).toBe('Ação 🚀 completa');
    fetchSpy.mockRestore();
  });

  it('should sort multiple tool calls by numerical index', async () => {
    const sseChunks = [
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"second","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"first","arguments":"{}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const mockResponse = {
      ok: true,
      status: 200,
      body: createMockSseStream(sseChunks),
    } as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new OpenApiClient({
      baseUrl: 'https://openrouter.ai/api/v1',
    });

    const result = await client.streamChat({
      model: 'google/gemini-2.5-flash:free',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.toolCalls?.length).toBe(2);
    expect(result.toolCalls?.[0].function.name).toBe('first');
    expect(result.toolCalls?.[1].function.name).toBe('second');
    expect(result.finishReason).toBe('tool_calls');

    fetchSpy.mockRestore();
  });

  it('should support non-streaming createChatCompletion', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'sync-123',
        choices: [
          {
            message: {
              content: 'Resposta sem streaming',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
    } as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new OpenApiClient({
      baseUrl: 'https://openrouter.ai/api/v1',
    });

    const res = await client.createChatCompletion({
      model: 'google/gemini-2.5-flash:free',
      messages: [{ role: 'user', content: 'sync test' }],
    });

    expect(res.id).toBe('sync-123');
    expect(res.content).toBe('Resposta sem streaming');
    expect(res.usage?.totalTokens).toBe(15);

    fetchSpy.mockRestore();
  });
});
