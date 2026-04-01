import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { MCPApp } from '../../src/apps/BaseApp.js';
import type { AppUIConfig } from '../../src/apps/BaseApp.js';
import type { AppToolDefinition } from '../../src/apps/types.js';
import { MCP_APP_MIME_TYPE } from '../../src/apps/types.js';
import { logger } from '../../src/core/Logger.js';

jest.spyOn(logger, 'warn').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
});

function createTestApp(overrides: {
  name?: string;
  ui?: Partial<AppUIConfig>;
  tools?: AppToolDefinition[];
  content?: string;
} = {}): MCPApp {
  const defaults = {
    name: 'test-app',
    ui: {
      resourceUri: 'ui://test-app/view',
      resourceName: 'Test App',
      resourceDescription: 'A test app',
      ...overrides.ui,
    } as AppUIConfig,
    tools: overrides.tools ?? [
      {
        name: 'test_tool',
        description: 'A test tool',
        schema: z.object({ query: z.string().describe('Query') }),
        execute: async (input: any) => ({ result: input.query }),
      },
    ],
    content: overrides.content ?? '<html><body>Test</body></html>',
  };

  return new (class extends MCPApp {
    name = overrides.name ?? defaults.name;
    ui = defaults.ui;
    tools = defaults.tools;
    getContent() {
      return defaults.content;
    }
  })();
}

describe('MCPApp', () => {
  describe('validate()', () => {
    it('APP-002-U01: valid config validates successfully', () => {
      const app = createTestApp();
      expect(() => app.validate()).not.toThrow();
    });

    it('APP-002-U02: throws if ui.resourceUri is invalid', () => {
      const app = createTestApp({ ui: { resourceUri: 'https://foo', resourceName: 'Test' } });
      expect(() => app.validate()).toThrow('must start with "ui://"');
    });

    it('APP-002-U03: throws if ui.resourceName is empty', () => {
      const app = createTestApp({ ui: { resourceUri: 'ui://test/view', resourceName: '' } });
      expect(() => app.validate()).toThrow('must have a ui.resourceName');
    });

    it('APP-002-U04: throws if tools array is empty', () => {
      const app = createTestApp({ tools: [] });
      expect(() => app.validate()).toThrow('must define at least one tool');
    });

    it('APP-002-U05: throws on duplicate tool names', () => {
      const tool: AppToolDefinition = {
        name: 'dup',
        description: 'Dup',
        schema: z.object({ x: z.string().describe('X') }),
        execute: async () => 'ok',
      };
      const app = createTestApp({ tools: [tool, { ...tool }] });
      expect(() => app.validate()).toThrow('duplicate tool name');
    });

    it('APP-002-U06: throws if tool missing required fields', () => {
      const app = createTestApp({
        tools: [{ name: 'bad', description: 'Bad', schema: null as any, execute: null as any }],
      });
      expect(() => app.validate()).toThrow('must have name, description, schema, and execute');
    });

    it('APP-002-U07: validates tool visibility', () => {
      const app = createTestApp({
        tools: [
          {
            name: 'vis',
            description: 'Vis',
            schema: z.object({ x: z.string().describe('X') }),
            execute: async () => 'ok',
            visibility: ['invalid' as any],
          },
        ],
      });
      expect(() => app.validate()).toThrow('Invalid visibility');
    });
  });

  describe('resourceDefinition', () => {
    it('APP-002-U08: returns correct shape', () => {
      const app = createTestApp();
      const def = app.resourceDefinition;
      expect(def).toEqual({
        uri: 'ui://test-app/view',
        name: 'Test App',
        description: 'A test app',
        mimeType: MCP_APP_MIME_TYPE,
      });
    });
  });

  describe('resourceMeta', () => {
    it('APP-002-U09: returns CSP/permissions when configured', () => {
      const app = createTestApp({
        ui: {
          resourceUri: 'ui://test/view',
          resourceName: 'Test',
          csp: { connectDomains: ['https://api.example.com'] },
        },
      });
      expect(app.resourceMeta).toEqual({
        csp: { connectDomains: ['https://api.example.com'] },
      });
    });

    it('APP-002-U10: returns undefined when no CSP/permissions', () => {
      const app = createTestApp();
      expect(app.resourceMeta).toBeUndefined();
    });
  });

  describe('readResource()', () => {
    it('APP-002-U11: returns HTML with correct structure', async () => {
      const app = createTestApp({ content: '<html>test</html>' });
      const result = await app.readResource();
      expect(result).toHaveLength(1);
      expect(result[0].uri).toBe('ui://test-app/view');
      expect(result[0].mimeType).toBe(MCP_APP_MIME_TYPE);
      expect(result[0].text).toBe('<html>test</html>');
    });

    it('APP-002-U12: includes _meta.ui when CSP is configured', async () => {
      const app = createTestApp({
        ui: {
          resourceUri: 'ui://test/view',
          resourceName: 'Test',
          csp: { connectDomains: ['https://api.example.com'] },
        },
      });
      const result = await app.readResource();
      expect((result[0] as any)._meta?.ui?.csp).toEqual({
        connectDomains: ['https://api.example.com'],
      });
    });

    it('APP-002-U13: omits _meta when no metadata', async () => {
      const app = createTestApp();
      const result = await app.readResource();
      expect((result[0] as any)._meta).toBeUndefined();
    });
  });

  describe('getToolMeta()', () => {
    it('APP-002-U14: returns correct _meta for tool with visibility', () => {
      const app = createTestApp({
        tools: [
          {
            name: 'foo',
            description: 'Foo',
            schema: z.object({ x: z.string().describe('X') }),
            execute: async () => 'ok',
            visibility: ['app'],
          },
        ],
      });
      const meta = app.getToolMeta('foo');
      expect(meta.ui.resourceUri).toBe('ui://test-app/view');
      expect(meta.ui.visibility).toEqual(['app']);
    });

    it('APP-002-U15: defaults visibility to ["model", "app"]', () => {
      const app = createTestApp();
      const meta = app.getToolMeta('test_tool');
      expect(meta.ui.visibility).toEqual(['model', 'app']);
    });
  });
});
