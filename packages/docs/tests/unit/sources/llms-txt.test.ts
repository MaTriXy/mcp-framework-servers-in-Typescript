import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LlmsTxtSource } from '../../../src/sources/llms-txt.js';
import { DocFetchError } from '../../../src/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../fixtures');

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

const LLMS_TXT = readFixture('llms-txt-simple.txt');
const LLMS_FULL_TXT = readFixture('llms-full-txt-simple.txt');

// Mock global fetch
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

function mockFetchSuccess(urlMap: Record<string, string>) {
  mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, body] of Object.entries(urlMap)) {
      if (url.includes(pattern)) {
        return new Response(body, { status: 200 });
      }
    }
    return new Response('Not Found', { status: 404, statusText: 'Not Found' });
  });
}

describe('LlmsTxtSource', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('constructor validates baseUrl', () => {
    expect(() => new LlmsTxtSource({ baseUrl: '' })).toThrow();
    expect(() => new LlmsTxtSource({ baseUrl: '  ' })).toThrow();
  });

  test('getIndex() fetches from correct URL with headers', async () => {
    mockFetchSuccess({ '/llms.txt': LLMS_TXT });
    const source = new LlmsTxtSource({
      baseUrl: 'https://docs.example.com',
      headers: { 'X-Custom': 'test' },
    });

    const index = await source.getIndex();
    expect(index).toBe(LLMS_TXT);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://docs.example.com/llms.txt',
      expect.objectContaining({ headers: { 'X-Custom': 'test' } })
    );
  });

  test('getIndex() returns cached content on second call', async () => {
    mockFetchSuccess({ '/llms.txt': LLMS_TXT });
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    await source.getIndex();
    await source.getIndex();
    // Only one fetch call — second was served from cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('getFullContent() fetches from correct URL', async () => {
    mockFetchSuccess({ '/llms-full.txt': LLMS_FULL_TXT });
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const full = await source.getFullContent();
    expect(full).toBe(LLMS_FULL_TXT);
  });

  test('listSections() returns parsed section tree', async () => {
    mockFetchSuccess({ '/llms.txt': LLMS_TXT });
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const sections = await source.listSections();
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe('Getting Started');
  });

  test('getPage() returns null for unknown slug', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const page = await source.getPage('nonexistent');
    expect(page).toBeNull();
  });

  test('search() returns results sorted by relevance', async () => {
    mockFetchSuccess({ '/llms-full.txt': LLMS_FULL_TXT });
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('authentication API key');
    expect(results.length).toBeGreaterThan(0);
    // Results should be sorted by score descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  test('search() respects limit parameter', async () => {
    mockFetchSuccess({ '/llms-full.txt': LLMS_FULL_TXT });
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('API', { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test('search() returns empty array for no-match query', async () => {
    mockFetchSuccess({ '/llms-full.txt': LLMS_FULL_TXT });
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('xyznonexistentquery123');
    expect(results).toHaveLength(0);
  });

  test('healthCheck() returns ok:true when endpoint responds 200', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }));
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const health = await source.healthCheck();
    expect(health.ok).toBe(true);
  });

  test('healthCheck() returns ok:false with message when endpoint fails', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }));
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    const health = await source.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain('500');
  });

  test('HTTP errors produce descriptive error messages', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }));
    const source = new LlmsTxtSource({ baseUrl: 'https://docs.example.com' });

    await expect(source.getIndex()).rejects.toThrow(DocFetchError);
    await expect(source.getIndex()).rejects.toThrow(/503/);
  });
});
