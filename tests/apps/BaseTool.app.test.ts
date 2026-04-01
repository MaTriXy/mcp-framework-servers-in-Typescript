import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';
import type { MCPInput } from '../../src/tools/BaseTool.js';
import type { ToolAppConfig } from '../../src/apps/types.js';
import { MCP_APP_MIME_TYPE } from '../../src/apps/types.js';
import { logger } from '../../src/core/Logger.js';

jest.spyOn(logger, 'warn').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
});

const testSchema = z.object({
  message: z.string().describe('Test message'),
});

class BasicTool extends MCPTool {
  name = 'basic_tool';
  description = 'A basic tool';
  schema = testSchema;
  async execute(input: MCPInput<this>) {
    return `Got: ${input.message}`;
  }
}

class AppTool extends MCPTool {
  name = 'app_tool';
  description = 'A tool with app';
  schema = testSchema;
  app: ToolAppConfig = {
    resourceUri: 'ui://test/view',
    resourceName: 'Test View',
    resourceDescription: 'Test view description',
    content: '<html>test content</html>',
  };
  async execute(input: MCPInput<this>) {
    return `Got: ${input.message}`;
  }
}

class AppToolWithVisibility extends MCPTool {
  name = 'vis_tool';
  description = 'A tool with app visibility';
  schema = testSchema;
  app: ToolAppConfig = {
    resourceUri: 'ui://test/view',
    resourceName: 'Test View',
    content: '<html>test</html>',
    visibility: ['app'],
  };
  async execute(input: MCPInput<this>) {
    return `Got: ${input.message}`;
  }
}

describe('MCPTool app property (Mode B)', () => {
  describe('toolDefinition', () => {
    it('APP-003-U01: tool WITHOUT app property has no _meta', () => {
      const tool = new BasicTool();
      const def = tool.toolDefinition;
      expect(def._meta).toBeUndefined();
    });

    it('APP-003-U02: tool WITH app property includes _meta.ui', () => {
      const tool = new AppTool();
      const def = tool.toolDefinition;
      expect(def._meta).toBeDefined();
      expect((def._meta as any).ui.resourceUri).toBe('ui://test/view');
    });

    it('APP-003-U03: tool with app + custom visibility sets _meta.ui.visibility', () => {
      const tool = new AppToolWithVisibility();
      const def = tool.toolDefinition;
      expect((def._meta as any).ui.visibility).toEqual(['app']);
    });

    it('APP-003-U04: tool with app + no explicit visibility omits visibility from _meta', () => {
      const tool = new AppTool();
      const def = tool.toolDefinition;
      expect((def._meta as any).ui.visibility).toBeUndefined();
    });
  });

  describe('validate()', () => {
    it('APP-003-U05: passes for tool with valid app config', () => {
      const tool = new AppTool();
      expect(() => tool.validate()).not.toThrow();
    });

    it('APP-003-U06: throws for tool with invalid app URI', () => {
      class BadUriTool extends MCPTool {
        name = 'bad';
        description = 'bad';
        schema = testSchema;
        app: ToolAppConfig = {
          resourceUri: 'https://bad',
          resourceName: 'Bad',
          content: '<html></html>',
        };
        async execute() { return 'ok'; }
      }
      expect(() => new BadUriTool().validate()).toThrow('must start with "ui://"');
    });

    it('APP-003-U07: throws for tool with empty resourceName', () => {
      class NoNameTool extends MCPTool {
        name = 'noname';
        description = 'noname';
        schema = testSchema;
        app: ToolAppConfig = {
          resourceUri: 'ui://test/view',
          resourceName: '',
          content: '<html></html>',
        };
        async execute() { return 'ok'; }
      }
      expect(() => new NoNameTool().validate()).toThrow('must have a resourceName');
    });

    it('APP-003-U08: still validates schema (existing behavior preserved)', () => {
      class NoDescTool extends MCPTool {
        name = 'nodesc';
        description = 'nodesc';
        schema = z.object({ bad: z.string() }); // missing .describe()
        async execute() { return 'ok'; }
      }
      expect(() => new NoDescTool().validate()).toThrow('Missing descriptions');
    });
  });

  describe('hasApp', () => {
    it('APP-003-U09: returns true when app is set', () => {
      expect(new AppTool().hasApp).toBe(true);
    });

    it('APP-003-U10: returns false when app is not set', () => {
      expect(new BasicTool().hasApp).toBe(false);
    });
  });

  describe('appResourceDefinition', () => {
    it('APP-003-U11: returns correct shape', () => {
      const tool = new AppTool();
      const def = tool.appResourceDefinition;
      expect(def).toEqual({
        uri: 'ui://test/view',
        name: 'Test View',
        description: 'Test view description',
        mimeType: MCP_APP_MIME_TYPE,
      });
    });

    it('APP-003-U12: returns undefined when no app', () => {
      expect(new BasicTool().appResourceDefinition).toBeUndefined();
    });
  });

  describe('readAppContent()', () => {
    it('APP-003-U13: returns HTML string when content is string', async () => {
      const tool = new AppTool();
      const html = await tool.readAppContent();
      expect(html).toBe('<html>test content</html>');
    });

    it('APP-003-U14: calls function when content is function', async () => {
      class FnTool extends MCPTool {
        name = 'fn';
        description = 'fn';
        schema = testSchema;
        app: ToolAppConfig = {
          resourceUri: 'ui://fn/view',
          resourceName: 'Fn',
          content: () => '<html>dynamic</html>',
        };
        async execute() { return 'ok'; }
      }
      const html = await new FnTool().readAppContent();
      expect(html).toBe('<html>dynamic</html>');
    });

    it('APP-003-U15: handles async function', async () => {
      class AsyncTool extends MCPTool {
        name = 'async';
        description = 'async';
        schema = testSchema;
        app: ToolAppConfig = {
          resourceUri: 'ui://async/view',
          resourceName: 'Async',
          content: async () => '<html>async</html>',
        };
        async execute() { return 'ok'; }
      }
      const html = await new AsyncTool().readAppContent();
      expect(html).toBe('<html>async</html>');
    });

    it('APP-003-U16: throws when no app config', async () => {
      const tool = new BasicTool();
      await expect(tool.readAppContent()).rejects.toThrow('has no app configuration');
    });
  });

  describe('backward compatibility', () => {
    it('APP-003-U17: existing tools without app compile and work identically', async () => {
      const tool = new BasicTool();
      const response = await tool.toolCall({
        params: { name: 'basic_tool', arguments: { message: 'hello' } },
      });
      expect(response.content[0]).toEqual({
        type: 'text',
        text: '"Got: hello"',
      });
      expect(response.isError).toBeUndefined();
    });
  });
});
