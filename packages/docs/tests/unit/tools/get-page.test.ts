import { describe, test, expect, jest } from '@jest/globals';
import { GetPageTool } from '../../../src/tools/GetPageTool.js';
import type { DocSource } from '../../../src/sources/types.js';
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

describe('GetPageTool', () => {
  test('returns full page content for valid slug', async () => {
    const source = createMockSource({
      getPage: jest.fn<any>().mockResolvedValue({
        slug: 'getting-started',
        url: 'https://docs.example.com/getting-started',
        title: 'Getting Started',
        content: 'This is the getting started guide.',
      }),
    });
    const tool = new GetPageTool(source);

    const result = await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'getting-started' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Getting Started');
    expect(text).toContain('getting started guide');
  });

  test('includes title and URL in output header', async () => {
    const source = createMockSource({
      getPage: jest.fn<any>().mockResolvedValue({
        slug: 'auth',
        url: 'https://docs.example.com/auth',
        title: 'Authentication',
        content: 'Auth content here.',
      }),
    });
    const tool = new GetPageTool(source);

    const result = await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'auth' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('# Authentication');
    expect(text).toContain('https://docs.example.com/auth');
  });

  test('returns "not found" message for unknown slug', async () => {
    const source = createMockSource({
      getPage: jest.fn<any>().mockResolvedValue(null),
    });
    const tool = new GetPageTool(source);

    const result = await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'nonexistent' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('not found');
  });

  test('truncates long content with notice', async () => {
    const longContent = 'x'.repeat(40000);
    const source = createMockSource({
      getPage: jest.fn<any>().mockResolvedValue({
        slug: 'long',
        url: 'https://docs.example.com/long',
        title: 'Long Page',
        content: longContent,
      }),
    });
    const tool = new GetPageTool(source);

    const result = await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'long' } },
    });

    const text = (result.content[0] as any).text;
    expect(text.length).toBeLessThan(40000);
    expect(text).toContain('truncated');
  });

  test('normalizes slug: strips leading slash', async () => {
    const getPageFn = jest.fn<any>().mockResolvedValue(null);
    const source = createMockSource({ getPage: getPageFn });
    const tool = new GetPageTool(source);

    await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: '/getting-started' } },
    });

    expect(getPageFn).toHaveBeenCalledWith('getting-started');
  });

  test('normalizes slug: strips trailing slash', async () => {
    const getPageFn = jest.fn<any>().mockResolvedValue(null);
    const source = createMockSource({ getPage: getPageFn });
    const tool = new GetPageTool(source);

    await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'getting-started/' } },
    });

    expect(getPageFn).toHaveBeenCalledWith('getting-started');
  });

  test('normalizes slug: strips /docs/ prefix', async () => {
    const getPageFn = jest.fn<any>().mockResolvedValue(null);
    const source = createMockSource({ getPage: getPageFn });
    const tool = new GetPageTool(source);

    await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: '/docs/getting-started' } },
    });

    expect(getPageFn).toHaveBeenCalledWith('getting-started');
  });

  test('handles source.getPage() throwing an error', async () => {
    const source = createMockSource({
      getPage: jest.fn<any>().mockRejectedValue(new DocSourceError('Fetch failed')),
    });
    const tool = new GetPageTool(source);

    const result = await tool.toolCall({
      params: { name: 'get_page', arguments: { slug: 'test' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Failed to retrieve page');
  });
});
