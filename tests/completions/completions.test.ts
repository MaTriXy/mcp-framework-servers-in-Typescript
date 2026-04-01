import { describe, it, expect, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { MCPPrompt } from '../../src/prompts/BasePrompt.js';
import { MCPResource } from '../../src/resources/BaseResource.js';

describe('Completions', () => {
  describe('Prompt Completions', () => {
    class TestPrompt extends MCPPrompt<{ language: string }> {
      name = 'test_prompt';
      description = 'Test prompt with completion';
      schema = {
        language: {
          type: z.string(),
          description: 'Programming language',
          required: true as const,
        },
      };

      async complete(argumentName: string, value: string) {
        if (argumentName === 'language') {
          const languages = ['python', 'typescript', 'rust', 'go'];
          const matches = languages.filter((l) => l.startsWith(value.toLowerCase()));
          return { values: matches, total: matches.length, hasMore: false };
        }
        return { values: [] };
      }

      async generateMessages(args: { language: string }) {
        return [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: `Review ${args.language} code` },
          },
        ];
      }
    }

    let prompt: TestPrompt;
    beforeEach(() => {
      prompt = new TestPrompt();
    });

    it('should return matching completions', async () => {
      const result = await prompt.complete('language', 'py');
      expect(result.values).toEqual(['python']);
    });

    it('should return empty for no matches', async () => {
      const result = await prompt.complete('language', 'xyz');
      expect(result.values).toEqual([]);
    });

    it('should return all values for empty input', async () => {
      const result = await prompt.complete('language', '');
      expect(result.values).toHaveLength(4);
    });

    it('should return empty for unknown argument', async () => {
      const result = await prompt.complete('unknown', 'test');
      expect(result.values).toEqual([]);
    });

    it('should include total and hasMore', async () => {
      const result = await prompt.complete('language', 't');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
    });
  });

  describe('Default Prompt Completion', () => {
    class BasicPrompt extends MCPPrompt<{ name: string }> {
      name = 'basic';
      description = 'Basic prompt without custom completion';
      schema = {
        name: {
          type: z.string(),
          description: 'Name',
          required: true as const,
        },
      };
      async generateMessages(args: { name: string }) {
        return [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: args.name },
          },
        ];
      }
    }

    it('should return empty values by default', async () => {
      const prompt = new BasicPrompt();
      const result = await prompt.complete('name', 'test');
      expect(result.values).toEqual([]);
    });
  });

  describe('Resource Templates', () => {
    class TemplateResource extends MCPResource {
      uri = 'config://app/theme';
      name = 'App Config';
      description = 'Application configuration';
      mimeType = 'application/json';

      protected template = {
        uriTemplate: 'config://app/{section}',
        description: 'Access config by section',
      };

      async complete(argumentName: string, value: string) {
        if (argumentName === 'section') {
          const sections = ['theme', 'network', 'auth'];
          return {
            values: sections.filter((s) => s.startsWith(value)),
            total: sections.length,
          };
        }
        return { values: [] };
      }

      async read() {
        return [{ uri: this.uri, text: '{}', mimeType: this.mimeType }];
      }
    }

    let resource: TemplateResource;
    beforeEach(() => {
      resource = new TemplateResource();
    });

    it('should expose template definition', () => {
      const tmpl = resource.templateDefinition;
      expect(tmpl).toBeDefined();
      expect(tmpl!.uriTemplate).toBe('config://app/{section}');
      expect(tmpl!.name).toBe('App Config');
      expect(tmpl!.mimeType).toBe('application/json');
    });

    it('should use template description over resource description', () => {
      const tmpl = resource.templateDefinition;
      expect(tmpl!.description).toBe('Access config by section');
    });

    it('should fall back to resource description when template has none', () => {
      class FallbackResource extends MCPResource {
        uri = 'fallback://test';
        name = 'Fallback';
        description = 'Resource description';
        protected template = { uriTemplate: 'fallback://{id}' };
        async read() {
          return [{ uri: this.uri, text: 'data' }];
        }
      }
      const r = new FallbackResource();
      expect(r.templateDefinition!.description).toBe('Resource description');
    });

    it('should return undefined templateDefinition when no template', () => {
      class PlainResource extends MCPResource {
        uri = 'plain://test';
        name = 'Plain';
        async read() {
          return [{ uri: this.uri, text: 'data' }];
        }
      }
      const plain = new PlainResource();
      expect(plain.templateDefinition).toBeUndefined();
    });

    it('should provide completions for template arguments', async () => {
      const result = await resource.complete('section', 'th');
      expect(result.values).toEqual(['theme']);
    });

    it('should return empty for unknown template argument', async () => {
      const result = await resource.complete('unknown', 'test');
      expect(result.values).toEqual([]);
    });
  });

  describe('Default Resource Completion', () => {
    class BasicResource extends MCPResource {
      uri = 'basic://test';
      name = 'Basic';
      async read() {
        return [{ uri: this.uri, text: 'data' }];
      }
    }

    it('should return empty values by default', async () => {
      const resource = new BasicResource();
      const result = await resource.complete('arg', 'val');
      expect(result.values).toEqual([]);
    });
  });
});
