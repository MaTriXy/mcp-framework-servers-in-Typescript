import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FumadocsRemoteSource } from '../../src/sources/fumadocs-remote.js';
import { SearchDocsTool } from '../../src/tools/SearchDocsTool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

const LLMS_TXT = readFileSync(join(fixturesDir, 'llms-txt-simple.txt'), 'utf-8');
const LLMS_FULL_TXT = readFileSync(join(fixturesDir, 'llms-full-txt-simple.txt'), 'utf-8');
const SEARCH_RESPONSE = readFileSync(join(fixturesDir, 'fumadocs-search-response.json'), 'utf-8');

let server: ReturnType<typeof createServer>;
let port: number;
let searchEnabled = true;

function startMockServer(): Promise<number> {
  return new Promise((resolve) => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || '/';
      const parsedUrl = new URL(url, `http://localhost`);

      // Fumadocs search API
      if (parsedUrl.pathname === '/api/search' && searchEnabled) {
        const query = parsedUrl.searchParams.get('query') || '';
        if (query) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(SEARCH_RESPONSE);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        }
        return;
      }

      if (parsedUrl.pathname === '/api/search' && !searchEnabled) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      if (parsedUrl.pathname === '/llms.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(LLMS_TXT);
        return;
      }

      if (parsedUrl.pathname === '/llms-full.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(LLMS_FULL_TXT);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    server.listen(0, () => {
      const addr = server.address();
      const assignedPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(assignedPort);
    });
  });
}

describe('Integration: FumadocsRemoteSource with search API', () => {
  let source: FumadocsRemoteSource;

  beforeAll(async () => {
    port = await startMockServer();
    source = new FumadocsRemoteSource({
      baseUrl: `http://localhost:${port}`,
      refreshInterval: 60_000,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test('search_docs uses Fumadocs search API', async () => {
    searchEnabled = true;
    const tool = new SearchDocsTool(source);
    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'authentication' } },
    });

    const text = (result.content[0] as any).text;
    // Should get results from the Fumadocs search response fixture
    expect(text).toContain('API Keys');
    expect(text).toContain('OAuth');
  });

  test('search results are normalized to DocSearchResult shape', async () => {
    searchEnabled = true;
    const results = await source.search('authentication');
    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(r).toHaveProperty('slug');
      expect(r).toHaveProperty('url');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('snippet');
      expect(r).toHaveProperty('score');
      expect(typeof r.score).toBe('number');
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  test('search handles empty results', async () => {
    searchEnabled = true;
    // The mock returns [] for empty query
    const results = await source.search('');
    expect(Array.isArray(results)).toBe(true);
  });

  test('search falls back to local search when API fails', async () => {
    searchEnabled = false;
    // Create fresh source to avoid cached results
    const freshSource = new FumadocsRemoteSource({
      baseUrl: `http://localhost:${port}`,
      refreshInterval: 60_000,
    });

    const results = await freshSource.search('API');
    expect(Array.isArray(results)).toBe(true);
    // Should still get results from local search against llms-full.txt
    expect(results.length).toBeGreaterThan(0);

    // Re-enable for other tests
    searchEnabled = true;
  });

  test('listSections works via llms.txt', async () => {
    const sections = await source.listSections();
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe('Getting Started');
    expect(sections[1].name).toBe('Authentication');
    expect(sections[2].name).toBe('API Reference');
  });

  test('getIndex returns llms.txt content', async () => {
    const index = await source.getIndex();
    expect(index).toContain('## Getting Started');
    expect(index).toContain('## Authentication');
  });

  test('getFullContent returns llms-full.txt content', async () => {
    const full = await source.getFullContent();
    expect(full).toContain('# Introduction');
    expect(full).toContain('# Webhooks');
  });
});
