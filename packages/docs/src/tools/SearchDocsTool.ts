import { z } from 'zod';
import { MCPTool } from 'mcp-framework';
import type { DocSource } from '../sources/types.js';
import { DocSourceError } from '../errors.js';
import { formatSearchResults } from '../utils/tokens.js';

const schema = z.object({
  query: z.string().describe('Search query — keywords or phrase to find in the documentation'),
  section: z.string().optional().describe('Filter results to a specific documentation section'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe('Maximum number of results to return (default 10, max 25)'),
});

type SearchDocsInput = z.infer<typeof schema>;

export class SearchDocsTool extends MCPTool<SearchDocsInput> {
  name = 'search_docs';
  description =
    'Search the documentation by keyword or phrase. Returns a ranked list of matching pages with relevant excerpts.';
  protected schema = schema;

  protected override useStringify = false;
  private source: DocSource;

  constructor(source: DocSource) {
    super();
    this.source = source;
  }

  protected async execute(input: SearchDocsInput): Promise<string> {
    try {
      const results = await this.source.search(input.query, {
        section: input.section,
        limit: input.limit ?? 10,
      });

      return formatSearchResults(results, 4000);
    } catch (error) {
      if (error instanceof DocSourceError) {
        return `Search failed: ${error.message}. Try again or use list_sections to browse available documentation.`;
      }
      throw error;
    }
  }
}
