import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FumadocsRemoteSource } from '../../../src/sources/fumadocs-remote.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../fixtures');

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

const LLMS_TXT = readFixture('llms-txt-simple.txt');
const LLMS_FULL_TXT = readFixture('llms-full-txt-simple.txt');
const SEARCH_RESPONSE = readFixture('fumadocs-search-response.json');

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

describe('FumadocsRemoteSource', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  function setupMocks(overrides?: Record<string, { status: number; body: string; contentType?: string }>) {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Check overrides first
      if (overrides) {
        for (const [pattern, response] of Object.entries(overrides)) {
          if (url.includes(pattern)) {
            return new Response(response.body, {
              status: response.status,
              headers: { 'content-type': response.contentType ?? 'text/plain' },
            });
          }
        }
      }

      // Default responses
      if (url.includes('/api/search')) {
        return new Response(SEARCH_RESPONSE, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/llms.txt')) {
        return new Response(LLMS_TXT, { status: 200 });
      }
      if (url.includes('/llms-full.txt')) {
        return new Response(LLMS_FULL_TXT, { status: 200 });
      }
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    });
  }

  test('search() calls correct Fumadocs search endpoint URL', async () => {
    setupMocks();
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    await source.search('authentication');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/search?query=authentication'),
      expect.anything()
    );
  });

  test('search() maps Fumadocs response to DocSearchResult shape', async () => {
    setupMocks();
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('authentication');
    expect(results.length).toBeGreaterThan(0);

    const first = results[0];
    expect(first).toHaveProperty('slug');
    expect(first).toHaveProperty('url');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('snippet');
    expect(first).toHaveProperty('score');
    expect(first.score).toBeGreaterThan(0);
    expect(first.score).toBeLessThanOrEqual(1);
  });

  test('search() handles empty results array', async () => {
    setupMocks({
      '/api/search': { status: 200, body: '[]', contentType: 'application/json' },
    });
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('nonexistent');
    expect(results).toHaveLength(0);
  });

  test('search() handles search API returning non-JSON gracefully', async () => {
    setupMocks({
      '/api/search': { status: 200, body: 'Not JSON', contentType: 'text/html' },
    });
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    // Should fall back to local search
    const results = await source.search('API');
    // Falls back to LlmsTxtSource.search which returns results
    expect(Array.isArray(results)).toBe(true);
  });

  test('search() falls back to local search when API returns 500', async () => {
    setupMocks({
      '/api/search': { status: 500, body: 'Internal Server Error' },
    });
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('API');
    expect(Array.isArray(results)).toBe(true);
  });

  test('search() falls back to local search when API returns 404', async () => {
    setupMocks({
      '/api/search': { status: 404, body: 'Not Found' },
    });
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('API');
    expect(Array.isArray(results)).toBe(true);
  });

  test('search() respects limit parameter', async () => {
    setupMocks();
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    const results = await source.search('authentication', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('inherited methods work correctly (listSections)', async () => {
    setupMocks();
    const source = new FumadocsRemoteSource({ baseUrl: 'https://docs.example.com' });

    const sections = await source.listSections();
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe('Getting Started');
  });

  test('custom headers are forwarded to all requests', async () => {
    setupMocks();
    const source = new FumadocsRemoteSource({
      baseUrl: 'https://docs.example.com',
      headers: { 'Authorization': 'Bearer test-token' },
    });

    await source.search('test');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer test-token' }),
      })
    );
  });
});
