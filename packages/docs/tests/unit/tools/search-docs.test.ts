import { describe, test, expect, jest } from '@jest/globals';
import { SearchDocsTool } from '../../../src/tools/SearchDocsTool.js';
import type { DocSource, DocSearchResult } from '../../../src/sources/types.js';
import { DocSourceError } from '../../../src/errors.js';

function createMockSource(overrides?: Record<string, any>): DocSource {
  return {
    name: 'test-source',
    search: jest.fn<any>().mockResolvedValue([]),
    getPage: jest.fn<any>().mockResolvedValue(null),
    listSections: jest.fn<any>().mockResolvedValue([]),
    getIndex: jest.fn<any>().mockResolvedValue(''),
    getFullContent: jest.fn<any>().mockResolvedValue(''),
    healthCheck: jest.fn<any>().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as DocSource;
}

function makeResults(count: number): DocSearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    slug: `page-${i}`,
    url: `https://docs.example.com/page-${i}`,
    title: `Page ${i}`,
    snippet: `This is the snippet for page ${i} with some content.`,
    section: 'Test Section',
    score: 1 - i * 0.1,
  }));
}

describe('SearchDocsTool', () => {
  test('returns formatted results for matching query', async () => {
    const source = createMockSource({
      search: jest.fn<any>().mockResolvedValue(makeResults(3)),
    });
    const tool = new SearchDocsTool(source);

    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'test' } },
    });

    expect((result as any).isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');
    const text = (result.content[0] as any).text;
    expect(text).toContain('Page 0');
    expect(text).toContain('Page 1');
    expect(text).toContain('Page 2');
  });

  test('respects limit parameter', async () => {
    const searchFn = jest.fn<any>().mockResolvedValue(makeResults(2));
    const source = createMockSource({ search: searchFn });
    const tool = new SearchDocsTool(source);

    await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'test', limit: 5 } },
    });

    expect(searchFn).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 5 }));
  });

  test('respects section filter', async () => {
    const searchFn = jest.fn<any>().mockResolvedValue(makeResults(1));
    const source = createMockSource({ search: searchFn });
    const tool = new SearchDocsTool(source);

    await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'test', section: 'Auth' } },
    });

    expect(searchFn).toHaveBeenCalledWith('test', expect.objectContaining({ section: 'Auth' }));
  });

  test('returns "no results" message when search returns empty', async () => {
    const source = createMockSource({ search: jest.fn<any>().mockResolvedValue([]) });
    const tool = new SearchDocsTool(source);

    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'nothing' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('No results found');
  });

  test('handles source.search() throwing an error', async () => {
    const source = createMockSource({
      search: jest.fn<any>().mockRejectedValue(new DocSourceError('Connection failed')),
    });
    const tool = new SearchDocsTool(source);

    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'test' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Search failed');
    expect(text).toContain('Connection failed');
  });

  test('schema validates: rejects missing query', async () => {
    const source = createMockSource();
    const tool = new SearchDocsTool(source);

    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: {} },
    });

    // Zod validation errors are caught and returned as error responses
    const text = (result.content[0] as any).text;
    expect(text).toContain('Required');
  });

  test('schema validates: rejects limit > 25', async () => {
    const source = createMockSource();
    const tool = new SearchDocsTool(source);

    const result = await tool.toolCall({
      params: { name: 'search_docs', arguments: { query: 'test', limit: 50 } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toMatch(/too_big|25|max/i);
  });
});
