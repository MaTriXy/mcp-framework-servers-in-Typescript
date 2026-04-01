import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LlmsTxtSource } from '../../src/sources/llms-txt.js';
import { SearchDocsTool } from '../../src/tools/SearchDocsTool.js';
import { GetPageTool } from '../../src/tools/GetPageTool.js';
import { ListSectionsTool } from '../../src/tools/ListSectionsTool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

const LLMS_TXT = readFileSync(join(fixturesDir, 'llms-txt-simple.txt'), 'utf-8');
const LLMS_FULL_TXT = readFileSync(join(fixturesDir, 'llms-full-txt-simple.txt'), 'utf-8');

// Individual page fixtures derived from full content
const PAGE_CONTENT: Record<string, string> = {
  'docs/introduction': '# Introduction\n\nMyAPI is a powerful platform for building integrations.',
  'docs/installation': '# Installation\n\nInstall the MyAPI SDK using npm:\n\n```bash\nnpm install myapi-sdk\n```',
  'docs/quick-start': '# Quick Start\n\nGet started with MyAPI in just a few steps.',
  'docs/auth/api-keys': '# API Keys\n\nAPI keys are the simplest way to authenticate with MyAPI.',
  'docs/auth/oauth': '# OAuth 2.0\n\nOAuth 2.0 is recommended for applications that act on behalf of users.',
  'docs/api/users': '# Users\n\nThe Users API allows you to manage user accounts.',
  'docs/api/projects': '# Projects\n\nThe Projects API allows you to create and manage projects.',
  'docs/api/webhooks': '# Webhooks\n\nWebhooks allow you to receive real-time notifications.',
};

let server: ReturnType<typeof createServer>;
let port: number;

function startMockServer(): Promise<number> {
  return new Promise((resolve) => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || '/';

      if (url === '/llms.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(LLMS_TXT);
        return;
      }

      if (url === '/llms-full.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(LLMS_FULL_TXT);
        return;
      }

      // Handle .mdx page requests
      const mdxMatch = url.match(/^\/(.+)\.mdx$/);
      if (mdxMatch) {
        const slug = mdxMatch[1];
        const content = PAGE_CONTENT[slug];
        if (content) {
          res.writeHead(200, { 'Content-Type': 'text/markdown' });
          res.end(content);
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.listen(0, () => {
      const addr = server.address();
      const assignedPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(assignedPort);
    });
  });
}

describe('Integration: Server lifecycle with LlmsTxtSource', () => {
  let source: LlmsTxtSource;

  beforeAll(async () => {
    port = await startMockServer();
    source = new LlmsTxtSource({
      baseUrl: `http://localhost:${port}`,
      refreshInterval: 60_000,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test('tools are instantiated with source', () => {
    const searchTool = new SearchDocsTool(source);
    const getPageTool = new GetPageTool(source);
    const listSectionsTool = new ListSectionsTool(source);

    expect(searchTool.name).toBe('search_docs');
    expect(getPageTool.name).toBe('get_page');
    expect(listSectionsTool.name).toBe('list_sections');
  });

  test('search_docs returns results for matching query', async () => {
    const tool = new SearchDocsTool(source);
    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'authentication API key' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('API Key');
  });

  test('get_page returns content for known slug', async () => {
    const tool = new GetPageTool(source);
    const result = await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'docs/auth/api-keys' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('API Keys');
    expect(text).toContain('authenticate');
  });

  test('get_page returns not-found for unknown slug', async () => {
    const tool = new GetPageTool(source);
    const result = await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'nonexistent-page' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('not found');
  });

  test('list_sections returns tree with correct sections', async () => {
    const tool = new ListSectionsTool(source);
    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: {} },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Getting Started');
    expect(text).toContain('Authentication');
    expect(text).toContain('API Reference');
  });

  test('list_sections filters by section name', async () => {
    const tool = new ListSectionsTool(source);
    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: { section: 'Authentication' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Authentication');
    expect(text).not.toContain('Getting Started');
  });

  test('source healthCheck returns ok', async () => {
    const health = await source.healthCheck();
    expect(health.ok).toBe(true);
  });

  test('source handles server errors gracefully', async () => {
    // Create source pointing to a port that doesn't exist
    const badSource = new LlmsTxtSource({
      baseUrl: 'http://localhost:1',
      refreshInterval: 60_000,
    });
    const tool = new SearchDocsTool(badSource);

    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'test' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Search failed');
  });
});
