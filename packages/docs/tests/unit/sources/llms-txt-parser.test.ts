import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseLlmsTxt } from '../../../src/sources/llms-txt-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../fixtures');

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('parseLlmsTxt', () => {
  test('parses well-formed llms.txt with multiple sections', () => {
    const content = readFixture('llms-txt-simple.txt');
    const { sections, pages } = parseLlmsTxt(content, 'https://docs.myapi.com');

    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe('Getting Started');
    expect(sections[1].name).toBe('Authentication');
    expect(sections[2].name).toBe('API Reference');
  });

  test('extracts page title, url, description from link lines', () => {
    const content = readFixture('llms-txt-simple.txt');
    const { pages } = parseLlmsTxt(content, 'https://docs.myapi.com');

    expect(pages).toHaveLength(8);
    expect(pages[0].title).toBe('Introduction');
    expect(pages[0].url).toBe('https://docs.myapi.com/docs/introduction');
    expect(pages[0].description).toBe('Overview of MyAPI and its core concepts');
  });

  test('derives slug from url by stripping base url', () => {
    const content = readFixture('llms-txt-simple.txt');
    const { pages } = parseLlmsTxt(content, 'https://docs.myapi.com');

    expect(pages[0].slug).toBe('docs/introduction');
    expect(pages[3].slug).toBe('docs/auth/api-keys');
  });

  test('tracks page counts per section', () => {
    const content = readFixture('llms-txt-simple.txt');
    const { sections } = parseLlmsTxt(content, 'https://docs.myapi.com');

    expect(sections[0].pageCount).toBe(3); // Getting Started
    expect(sections[1].pageCount).toBe(2); // Authentication
    expect(sections[2].pageCount).toBe(3); // API Reference
  });

  test('assigns section name to pages', () => {
    const content = readFixture('llms-txt-simple.txt');
    const { pages } = parseLlmsTxt(content, 'https://docs.myapi.com');

    expect(pages[0].section).toBe('Getting Started');
    expect(pages[3].section).toBe('Authentication');
    expect(pages[5].section).toBe('API Reference');
  });

  test('handles empty input', () => {
    const { sections, pages } = parseLlmsTxt('');
    expect(sections).toHaveLength(0);
    expect(pages).toHaveLength(0);
  });

  test('handles input with no sections (flat list of links)', () => {
    const content = `# My Docs

- [Page One](https://example.com/one): First page
- [Page Two](https://example.com/two): Second page
`;
    const { sections, pages } = parseLlmsTxt(content);

    expect(sections).toHaveLength(0);
    expect(pages).toHaveLength(2);
    expect(pages[0].section).toBeUndefined();
  });

  test('handles malformed links gracefully', () => {
    const content = readFixture('llms-txt-malformed.txt');
    const { sections, pages } = parseLlmsTxt(content, 'https://example.com');

    // Should parse the valid entries and skip malformed ones
    expect(sections).toHaveLength(2);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.some(p => p.title === 'Valid Page')).toBe(true);
    expect(pages.some(p => p.title === 'Another Valid')).toBe(true);
  });

  test('preserves section ordering from source', () => {
    const content = `# Docs

## Zebra Section

- [Z Page](https://example.com/z): Z page

## Alpha Section

- [A Page](https://example.com/a): A page
`;
    const { sections } = parseLlmsTxt(content);
    expect(sections[0].name).toBe('Zebra Section');
    expect(sections[1].name).toBe('Alpha Section');
  });

  test('handles pages with no description', () => {
    const content = `## Section

- [No Desc](https://example.com/no-desc)
`;
    const { pages } = parseLlmsTxt(content);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('No Desc');
    expect(pages[0].description).toBeUndefined();
  });
});
