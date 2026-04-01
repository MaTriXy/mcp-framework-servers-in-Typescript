/**
 * E2E backward-compatibility tests for multi-transport (Issue #124)
 *
 * These tests verify that:
 * 1. All public exports remain intact after multi-transport changes
 * 2. Type shapes are preserved (MCPServerConfig, TransportConfig)
 * 3. MCPServer constructs correctly with both old and new config styles
 * 4. No regressions in existing features (auth, logging, tasks, devMode)
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Import verification ─────────────────────────────────────────────

import {
  MCPServer,
  MCPTool,
  MCPPrompt,
  MCPResource,
  Logger,
  defineSchema,
  APIKeyAuthProvider,
  JWTAuthProvider,
  OAuthAuthProvider,
  HttpStreamTransport,
  requestContext,
  getRequestContext,
  runInRequestContext,
} from '../../src/index.js';

import type {
  MCPServerConfig,
  TransportConfig,
  TransportType,
  ServerCapabilities,
  ToolProtocol,
  ToolInputSchema,
  ToolInput,
  MCPInput,
  InferSchemaType,
  TextContent,
  ToolContent,
  ToolResponse,
  PromptProtocol,
  ResourceProtocol,
  AuthProvider,
  AuthConfig,
  AuthResult,
  SSETransportConfig,
  HttpStreamTransportConfig,
  RequestContextData,
} from '../../src/index.js';

describe('E2E: Multi-transport backward compatibility (ticket-124)', () => {
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  // ─── Export verification ─────────────────────────────────────────

  describe('BC-124-E01: All public class exports remain defined', () => {
    it('core classes are exported', () => {
      expect(MCPServer).toBeDefined();
      expect(typeof MCPServer).toBe('function');
      expect(MCPTool).toBeDefined();
      expect(typeof MCPTool).toBe('function');
      expect(MCPPrompt).toBeDefined();
      expect(typeof MCPPrompt).toBe('function');
      expect(MCPResource).toBeDefined();
      expect(typeof MCPResource).toBe('function');
    });

    it('auth providers are exported', () => {
      expect(APIKeyAuthProvider).toBeDefined();
      expect(JWTAuthProvider).toBeDefined();
      expect(OAuthAuthProvider).toBeDefined();
    });

    it('transport classes are exported', () => {
      expect(HttpStreamTransport).toBeDefined();
      expect(typeof HttpStreamTransport).toBe('function');
    });

    it('utility exports are intact', () => {
      expect(Logger).toBeDefined();
      expect(defineSchema).toBeDefined();
      expect(requestContext).toBeDefined();
      expect(getRequestContext).toBeDefined();
      expect(runInRequestContext).toBeDefined();
    });
  });

  // ─── Type shape verification ───────────────────────────────────────

  describe('BC-124-E02: Type shapes are preserved', () => {
    it('TransportConfig type accepts all original fields', () => {
      const stdioConfig: TransportConfig = { type: 'stdio' };
      const sseConfig: TransportConfig = { type: 'sse' };
      const httpConfig: TransportConfig = { type: 'http-stream' };

      expect(stdioConfig.type).toBe('stdio');
      expect(sseConfig.type).toBe('sse');
      expect(httpConfig.type).toBe('http-stream');
    });

    it('TransportConfig accepts options field', () => {
      const config: TransportConfig = {
        type: 'sse',
        options: { port: 3001 } as SSETransportConfig,
      };
      expect(config.options).toBeDefined();
    });

    it('TransportConfig accepts auth field', () => {
      const mockProvider: AuthProvider = {
        authenticate: async () => true,
        getAuthError: () => ({ status: 401, message: 'Unauthorized' }),
      };
      const config: TransportConfig = {
        type: 'http-stream',
        auth: { provider: mockProvider },
      };
      expect(config.auth).toBeDefined();
    });

    it('MCPServerConfig accepts singular transport (backward compat)', () => {
      const config: MCPServerConfig = {
        name: 'test',
        version: '1.0.0',
        transport: { type: 'stdio' },
      };
      expect(config.transport).toBeDefined();
      expect(config.transport!.type).toBe('stdio');
    });

    it('MCPServerConfig accepts transports array (new)', () => {
      // `transports` is added by the multi-transport implementation;
      // use `as any` until the type is updated
      const config = {
        name: 'test',
        version: '1.0.0',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any as MCPServerConfig;
      expect((config as any).transports).toBeDefined();
      expect((config as any).transports).toHaveLength(2);
    });

    it('TransportType union includes all original values', () => {
      const types: TransportType[] = ['stdio', 'sse', 'http-stream'];
      expect(types).toContain('stdio');
      expect(types).toContain('sse');
      expect(types).toContain('http-stream');
    });

    it('SSETransportConfig type is available', () => {
      const config: SSETransportConfig = { port: 3001 };
      expect(config.port).toBe(3001);
    });

    it('HttpStreamTransportConfig type is available', () => {
      const config: HttpStreamTransportConfig = { port: 8080, responseMode: 'stream' };
      expect(config.port).toBe(8080);
    });
  });

  // ─── MCPServer construction parity ─────────────────────────────────

  describe('BC-124-E03: MCPServer construction works with all config styles', () => {
    it('default config (no args)', () => {
      const server = new MCPServer();
      expect(server).toBeInstanceOf(MCPServer);
      expect(server.IsRunning).toBe(false);
    });

    it('empty config object', () => {
      const server = new MCPServer({});
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('name and version only', () => {
      const server = new MCPServer({ name: 'test', version: '1.0.0' });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('singular transport: stdio', () => {
      const server = new MCPServer({
        name: 'test',
        transport: { type: 'stdio' },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('singular transport: sse with options', () => {
      const server = new MCPServer({
        name: 'test',
        transport: { type: 'sse', options: { port: 3001 } },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('singular transport: http-stream with options', () => {
      const server = new MCPServer({
        name: 'test',
        transport: { type: 'http-stream', options: { port: 8080, responseMode: 'batch' } },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('singular transport with auth', () => {
      const provider = new APIKeyAuthProvider({ keys: ['test-key'] });
      const server = new MCPServer({
        name: 'test',
        transport: {
          type: 'http-stream',
          auth: { provider },
        },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('transports array: single stdio', () => {
      const server = new MCPServer({
        name: 'test',
        transports: [{ type: 'stdio' }],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('transports array: stdio + http-stream', () => {
      const server = new MCPServer({
        name: 'test',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('transports array: all three types', () => {
      const server = new MCPServer({
        name: 'test',
        transports: [
          { type: 'stdio' },
          { type: 'sse', options: { port: 3001 } },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('transports array: with mixed auth', () => {
      const provider = new APIKeyAuthProvider({ keys: ['test-key'] });
      const server = new MCPServer({
        name: 'test',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 }, auth: { provider } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });
  });

  // ─── Feature interop with multi-transport ──────────────────────────

  describe('BC-124-E04: Other config options work with multi-transport', () => {
    it('logging works with singular transport', () => {
      const server = new MCPServer({
        name: 'test',
        logging: true,
        transport: { type: 'stdio' },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('logging works with transports array', () => {
      const server = new MCPServer({
        name: 'test',
        logging: true,
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('tasks config works with singular transport', () => {
      const server = new MCPServer({
        name: 'test',
        tasks: { enabled: true, defaultTtl: 60000 },
        transport: { type: 'stdio' },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('tasks config works with transports array', () => {
      const server = new MCPServer({
        name: 'test',
        tasks: { enabled: true, defaultTtl: 60000 },
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('devMode works with transports array', () => {
      const server = new MCPServer({
        name: 'test',
        devMode: true,
        transports: [{ type: 'stdio' }],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('basePath works with transports array', () => {
      const server = new MCPServer({
        name: 'test',
        basePath: '/tmp/test-base',
        transports: [{ type: 'stdio' }],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });
  });

  // ─── Validation errors ─────────────────────────────────────────────

  describe('BC-124-E05: Config validation errors', () => {
    it('rejects both transport and transports', () => {
      expect(() => {
        new MCPServer({
          name: 'test',
          transport: { type: 'stdio' },
          transports: [{ type: 'sse', options: { port: 3001 } }],
        } as any);
      }).toThrow();
    });

    it('rejects duplicate stdio in transports', () => {
      expect(() => {
        new MCPServer({
          name: 'test',
          transports: [{ type: 'stdio' }, { type: 'stdio' }],
        } as any);
      }).toThrow();
    });

    it('rejects port conflict in transports', () => {
      expect(() => {
        new MCPServer({
          name: 'test',
          transports: [
            { type: 'sse', options: { port: 8080 } },
            { type: 'http-stream', options: { port: 8080 } },
          ],
        } as any);
      }).toThrow();
    });
  });

  // ─── stop() safety ─────────────────────────────────────────────────

  describe('BC-124-E06: stop() is safe in all configurations', () => {
    it('stop() before start() with default config', async () => {
      const server = new MCPServer();
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('stop() before start() with singular transport', async () => {
      const server = new MCPServer({ transport: { type: 'stdio' } });
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('stop() before start() with transports array', async () => {
      const server = new MCPServer({
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('double stop() with transports array', async () => {
      const server = new MCPServer({
        transports: [
          { type: 'stdio' },
          { type: 'sse', options: { port: 3001 } },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      await expect(server.stop()).resolves.toBeUndefined();
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  // ─── HttpStreamTransport standalone (regression guard) ─────────────

  describe('BC-124-E07: HttpStreamTransport standalone usage unaffected', () => {
    it('constructs with defaults', () => {
      const transport = new HttpStreamTransport();
      expect(transport.type).toBe('http-stream');
      expect(transport.isRunning()).toBe(false);
    });

    it('constructs with custom config', () => {
      const transport = new HttpStreamTransport({
        port: 9999,
        endpoint: '/custom',
        responseMode: 'batch',
      });
      expect(transport.type).toBe('http-stream');
    });
  });

  // ─── LOG_LEVEL_SEVERITY export (regression guard) ──────────────────

  describe('BC-124-E08: LOG_LEVEL_SEVERITY export unaffected', () => {
    it('LOG_LEVEL_SEVERITY is exported and correct', async () => {
      const { LOG_LEVEL_SEVERITY } = await import('../../src/core/MCPServer.js');
      expect(LOG_LEVEL_SEVERITY.debug).toBe(0);
      expect(LOG_LEVEL_SEVERITY.emergency).toBe(7);
    });
  });
});
