import { z } from 'zod';
import { MCPTool } from 'mcp-framework';
import type { DocSource, DocSection } from '../sources/types.js';
import { DocSourceError } from '../errors.js';

const schema = z.object({
  section: z
    .string()
    .optional()
    .describe("Filter to a specific section's children by section name"),
});

type ListSectionsInput = z.infer<typeof schema>;

export class ListSectionsTool extends MCPTool<ListSectionsInput> {
  name = 'list_sections';
  description =
    'List the documentation structure showing all sections and their page counts. Use this to discover what documentation is available before searching.';
  protected schema = schema;

  protected override useStringify = false;
  private source: DocSource;

  constructor(source: DocSource) {
    super();
    this.source = source;
  }

  protected async execute(input: ListSectionsInput): Promise<string> {
    try {
      const sections = await this.source.listSections();

      if (sections.length === 0) {
        return 'No sections found in the documentation.';
      }

      if (input.section) {
        const target = this.findSection(sections, input.section);
        if (!target) {
          return `Section "${input.section}" not found. Available sections:\n${sections.map(s => `  - ${s.name}`).join('\n')}`;
        }
        return this.formatTree([target], 0);
      }

      return this.formatTree(sections, 0);
    } catch (error) {
      if (error instanceof DocSourceError) {
        return `Failed to list sections: ${error.message}`;
      }
      throw error;
    }
  }

  private findSection(sections: DocSection[], name: string): DocSection | null {
    const nameLower = name.toLowerCase();
    for (const section of sections) {
      if (section.name.toLowerCase() === nameLower || section.slug === nameLower) {
        return section;
      }
      const found = this.findSection(section.children, name);
      if (found) return found;
    }
    return null;
  }

  private formatTree(sections: DocSection[], depth: number): string {
    const lines: string[] = [];
    const indent = '  '.repeat(depth);

    for (const section of sections) {
      lines.push(`${indent}- **${section.name}** (${section.pageCount} pages) [${section.slug}]`);
      if (section.children.length > 0) {
        lines.push(this.formatTree(section.children, depth + 1));
      }
    }

    return lines.join('\n');
  }
}
