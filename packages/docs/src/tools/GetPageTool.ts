import { z } from 'zod';
import { MCPTool } from 'mcp-framework';
import type { DocSource } from '../sources/types.js';
import { DocSourceError } from '../errors.js';
import { truncateToTokenBudget } from '../utils/tokens.js';

const schema = z.object({
  slug: z.string().describe('Page slug or URL path (e.g. "getting-started" or "api/authentication")'),
});

type GetPageInput = z.infer<typeof schema>;

export class GetPageTool extends MCPTool<GetPageInput> {
  name = 'get_page';
  description =
    'Retrieve the full content of a documentation page by its slug or URL path. Returns the page as markdown.';
  protected schema = schema;

  protected override useStringify = false;
  private source: DocSource;

  constructor(source: DocSource) {
    super();
    this.source = source;
  }

  protected async execute(input: GetPageInput): Promise<string> {
    try {
      const slug = this.normalizeSlug(input.slug);
      const page = await this.source.getPage(slug);

      if (!page) {
        return `Page not found: "${input.slug}". Use search_docs to find the correct page or list_sections to browse available documentation.`;
      }

      const header = `# ${page.title}\n${page.url}\n\n`;
      const fullContent = header + page.content;

      const { text } = truncateToTokenBudget(fullContent, 8000);
      return text;
    } catch (error) {
      if (error instanceof DocSourceError) {
        return `Failed to retrieve page: ${error.message}`;
      }
      throw error;
    }
  }

  private normalizeSlug(slug: string): string {
    return slug
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/^docs\//, '');
  }
}
