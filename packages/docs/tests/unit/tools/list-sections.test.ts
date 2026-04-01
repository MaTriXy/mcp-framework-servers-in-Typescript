import { describe, test, expect, jest } from '@jest/globals';
import { ListSectionsTool } from '../../../src/tools/ListSectionsTool.js';
import type { DocSource, DocSection } from '../../../src/sources/types.js';
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

const MOCK_SECTIONS: DocSection[] = [
  {
    name: 'Getting Started',
    slug: 'getting-started',
    url: 'https://docs.example.com/getting-started',
    children: [],
    pageCount: 3,
  },
  {
    name: 'Authentication',
    slug: 'authentication',
    url: 'https://docs.example.com/authentication',
    children: [
      {
        name: 'OAuth',
        slug: 'oauth',
        url: 'https://docs.example.com/authentication/oauth',
        children: [],
        pageCount: 2,
      },
    ],
    pageCount: 1,
  },
  {
    name: 'API Reference',
    slug: 'api-reference',
    url: 'https://docs.example.com/api-reference',
    children: [],
    pageCount: 5,
  },
];

describe('ListSectionsTool', () => {
  test('returns formatted tree for all sections', async () => {
    const source = createMockSource({
      listSections: jest.fn<any>().mockResolvedValue(MOCK_SECTIONS),
    });
    const tool = new ListSectionsTool(source);

    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: {} },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Getting Started');
    expect(text).toContain('Authentication');
    expect(text).toContain('API Reference');
    expect(text).toContain('3 pages');
  });

  test('filters to specific section when section param provided', async () => {
    const source = createMockSource({
      listSections: jest.fn<any>().mockResolvedValue(MOCK_SECTIONS),
    });
    const tool = new ListSectionsTool(source);

    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: { section: 'Authentication' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Authentication');
    expect(text).toContain('OAuth');
    expect(text).not.toContain('Getting Started');
    expect(text).not.toContain('API Reference');
  });

  test('returns "not found" message for unknown section name', async () => {
    const source = createMockSource({
      listSections: jest.fn<any>().mockResolvedValue(MOCK_SECTIONS),
    });
    const tool = new ListSectionsTool(source);

    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: { section: 'Nonexistent' } },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('not found');
    expect(text).toContain('Getting Started');
  });

  test('handles nested sections with proper indentation', async () => {
    const source = createMockSource({
      listSections: jest.fn<any>().mockResolvedValue(MOCK_SECTIONS),
    });
    const tool = new ListSectionsTool(source);

    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: {} },
    });

    const text = (result.content[0] as any).text;
    const lines = text.split('\n');
    const oauthLine = lines.find((l: string) => l.includes('OAuth'));
    const authLine = lines.find((l: string) => l.includes('Authentication'));
    expect(oauthLine).toBeDefined();
    expect(authLine).toBeDefined();
    const oauthIndent = oauthLine!.match(/^(\s*)/)?.[1]?.length ?? 0;
    const authIndent = authLine!.match(/^(\s*)/)?.[1]?.length ?? 0;
    expect(oauthIndent).toBeGreaterThan(authIndent);
  });

  test('returns "no sections" message when source returns empty', async () => {
    const source = createMockSource({
      listSections: jest.fn<any>().mockResolvedValue([]),
    });
    const tool = new ListSectionsTool(source);

    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: {} },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('No sections found');
  });

  test('handles source.listSections() throwing an error', async () => {
    const source = createMockSource({
      listSections: jest.fn<any>().mockRejectedValue(new DocSourceError('Fetch failed')),
    });
    const tool = new ListSectionsTool(source);

    const result = await tool.toolCall({
      params: { name: 'list_sections', arguments: {} },
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain('Failed to list sections');
  });
});
