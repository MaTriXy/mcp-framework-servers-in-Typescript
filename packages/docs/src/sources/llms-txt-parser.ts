import { DocSection, DocPage } from './types.js';

interface ParseResult {
  sections: DocSection[];
  pages: DocPage[];
}

/**
 * Parse an llms.txt index file into structured sections and pages.
 *
 * Expected format (produced by fumadocs-core/source llms().index()):
 * ```
 * # Project Name
 *
 * > Project description
 *
 * ## Section Name
 *
 * - [Page Title](https://docs.example.com/docs/page-slug): Page description
 *
 * ## Another Section
 *
 * - [Another Page](https://docs.example.com/docs/another): Description
 * ```
 */
export function parseLlmsTxt(content: string, baseUrl?: string): ParseResult {
  if (!content || !content.trim()) {
    return { sections: [], pages: [] };
  }

  const lines = content.split('\n');
  const sections: DocSection[] = [];
  const pages: DocPage[] = [];
  let currentSection: DocSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match ## Section headings (skip # top-level title)
    const sectionMatch = trimmed.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      const slug = slugify(name);
      currentSection = {
        name,
        slug,
        url: baseUrl ? `${baseUrl}/${slug}` : slug,
        children: [],
        pageCount: 0,
      };
      sections.push(currentSection);
      continue;
    }

    // Match ### Subsection headings
    const subsectionMatch = trimmed.match(/^###\s+(.+)$/);
    if (subsectionMatch && currentSection) {
      const name = subsectionMatch[1].trim();
      const slug = slugify(name);
      const subsection: DocSection = {
        name,
        slug,
        url: baseUrl ? `${baseUrl}/${currentSection.slug}/${slug}` : `${currentSection.slug}/${slug}`,
        children: [],
        pageCount: 0,
      };
      currentSection.children.push(subsection);
      continue;
    }

    // Match link lines: - [Title](url): description  OR  - [Title](url)
    const linkMatch = trimmed.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2].trim();
      const description = linkMatch[3]?.trim() || undefined;
      const slug = deriveSlug(url, baseUrl);

      const page: DocPage = {
        slug,
        url,
        title,
        description,
        content: '', // Content not available from index
        section: currentSection?.name,
      };

      pages.push(page);

      if (currentSection) {
        currentSection.pageCount++;
      }
      continue;
    }
  }

  return { sections, pages };
}

/**
 * Derive a slug from a URL by stripping the base URL and leading/trailing slashes.
 */
function deriveSlug(url: string, baseUrl?: string): string {
  let slug = url;

  if (baseUrl) {
    // Strip baseUrl prefix
    const base = baseUrl.replace(/\/+$/, '');
    if (slug.startsWith(base)) {
      slug = slug.slice(base.length);
    }
  }

  // Strip protocol and domain if full URL
  try {
    const parsed = new URL(slug);
    slug = parsed.pathname;
  } catch {
    // Not a full URL, use as-is
  }

  // Clean up slashes
  slug = slug.replace(/^\/+/, '').replace(/\/+$/, '');

  return slug;
}

/**
 * Convert a section name to a URL-friendly slug.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
