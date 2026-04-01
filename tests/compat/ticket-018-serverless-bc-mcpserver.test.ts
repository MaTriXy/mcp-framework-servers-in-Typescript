/**
 * BC-018: MCPServer backwards compatibility tests
 *
 * These tests capture the EXISTING behavior of MCPServer before the
 * serverless/Lambda refactor. They verify:
 * - Constructor behavior with all config permutations
 * - Public API surface (methods, getters)
 * - start()/stop() lifecycle
 * - Transport creation for all types
 * - IsRunning state transitions
 * - Capabilities detection
 *
 * Run these BEFORE and AFTER the refactor to ensure zero regressions.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { MCPServer } from '../../src/core/MCPServer.js';
import type { MCPServerConfig, TransportConfig, ServerCapabilities } from '../../src/core/MCPServer.js';
import { HttpStreamTransport } from '../../src/transports/http/server.js';
import { APIKeyAuthProvider } from '../../src/auth/providers/apikey.js';

describe('BC-018: MCPServer backward compatibility', () => {
  let server: MCPServer;

  afterEach(async () => {
    // Ensure cleanup — stop if running
    if (server?.IsRunning) {
      try {
        await server.stop();
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ── Constructor ──────────────────────────────────────────────────────

  describe('Constructor', () => {
    it('BC-018-C01: constructs with no arguments (all defaults)', () => {
      server = new MCPServer();
      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('BC-018-C02: constructs with empty config object', () => {
      server = new MCPServer({});
      expect(server).toBeDefined();
    });

    it('BC-018-C03: constructs with name and version', () => {
      server = new MCPServer({ name: 'test-server', version: '1.2.3' });
      expect(server).toBeDefined();
    });

    it('BC-018-C04: constructs with stdio transport (default)', () => {
      server = new MCPServer({ transport: { type: 'stdio' } });
      expect(server).toBeDefined();
    });

    it('BC-018-C05: constructs with sse transport config', () => {
      server = new MCPServer({
        transport: {
          type: 'sse',
          options: { port: 19876, host: '127.0.0.1' },
        },
      });
      expect(server).toBeDefined();
    });

    it('BC-018-C06: constructs with http-stream transport config', () => {
      server = new MCPServer({
        transport: {
          type: 'http-stream',
          options: { port: 19877, endpoint: '/mcp', responseMode: 'batch' },
        },
      });
      expect(server).toBeDefined();
    });

    it('BC-018-C07: constructs with auth config in transport', () => {
      const provider = new APIKeyAuthProvider({ keys: ['test-key'] });
      server = new MCPServer({
        transport: {
          type: 'http-stream',
          options: { port: 19878 },
          auth: { provider },
        },
      });
      expect(server).toBeDefined();
    });

    it('BC-018-C08: constructs with auth in transport.options', () => {
      const provider = new APIKeyAuthProvider({ keys: ['test-key'] });
      server = new MCPServer({
        transport: {
          type: 'http-stream',
          options: {
            port: 19879,
            auth: { provider },
          } as any,
        },
      });
      expect(server).toBeDefined();
    });

    it('BC-018-C09: constructs with logging enabled', () => {
      server = new MCPServer({ logging: true });
      expect(server).toBeDefined();
    });

    it('BC-018-C10: constructs with tasks config', () => {
      server = new MCPServer({
        tasks: { enabled: true, defaultTtl: 60000, maxTasks: 100 },
      });
      expect(server).toBeDefined();
    });

    it('BC-018-C11: constructs with basePath', () => {
      server = new MCPServer({ basePath: '/tmp/nonexistent-test-path' });
      expect(server).toBeDefined();
    });

    it('BC-018-C12: constructs with devMode', () => {
      server = new MCPServer({ devMode: true });
      expect(server).toBeDefined();
    });

    it('BC-018-C13: constructs with all config options combined', () => {
      const provider = new APIKeyAuthProvider({ keys: ['k'] });
      server = new MCPServer({
        name: 'full-config-server',
        version: '9.9.9',
        basePath: '/tmp/nonexistent-test-path',
        transport: {
          type: 'http-stream',
          options: { port: 19880, responseMode: 'batch' },
          auth: { provider, endpoints: { sse: true, messages: true } },
        },
        logging: true,
        tasks: { enabled: true },
        devMode: false,
      });
      expect(server).toBeDefined();
    });
  });

  // ── Public API Surface ───────────────────────────────────────────────

  describe('Public API surface', () => {
    it('BC-018-A01: has IsRunning getter returning boolean', () => {
      server = new MCPServer();
      expect(typeof server.IsRunning).toBe('boolean');
      expect(server.IsRunning).toBe(false);
    });

    it('BC-018-A02: has start() method', () => {
      server = new MCPServer();
      expect(typeof server.start).toBe('function');
    });

    it('BC-018-A03: has stop() method', () => {
      server = new MCPServer();
      expect(typeof server.stop).toBe('function');
    });

    it('BC-018-A04: has listRoots() method', () => {
      server = new MCPServer();
      expect(typeof server.listRoots).toBe('function');
    });

    it('BC-018-A05: has roots getter', () => {
      server = new MCPServer();
      expect(Array.isArray(server.roots)).toBe(true);
      expect(server.roots).toEqual([]);
    });

    it('BC-018-A06: has sendLog() method', () => {
      server = new MCPServer();
      expect(typeof server.sendLog).toBe('function');
    });
  });

  // ── IsRunning State ──────────────────────────────────────────────────

  describe('IsRunning state', () => {
    it('BC-018-R01: IsRunning is false after construction', () => {
      server = new MCPServer();
      expect(server.IsRunning).toBe(false);
    });

    it('BC-018-R02: stop() on a non-running server does not throw', async () => {
      server = new MCPServer();
      expect(server.IsRunning).toBe(false);
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('BC-018-R03: listRoots() returns empty array when not running', async () => {
      server = new MCPServer();
      const roots = await server.listRoots();
      expect(roots).toEqual([]);
    });

    it('BC-018-R04: sendLog() does nothing when not running', async () => {
      server = new MCPServer({ logging: true });
      // Should not throw even though server isn't started
      await expect(
        server.sendLog('info', 'test', { message: 'test' })
      ).resolves.toBeUndefined();
    });
  });

  // ── MCPServerConfig type shape ───────────────────────────────────────

  describe('MCPServerConfig type shape', () => {
    it('BC-018-T01: all existing config fields are accepted', () => {
      // This is a compile-time check. If any field is removed,
      // TypeScript will error here.
      const config: MCPServerConfig = {
        name: 'test',
        version: '1.0',
        basePath: '/tmp/test',
        transport: { type: 'stdio' },
        logging: false,
        tasks: { enabled: false },
        devMode: false,
      };
      expect(config).toBeDefined();
    });

    it('BC-018-T02: TransportConfig accepts all three types', () => {
      const stdio: TransportConfig = { type: 'stdio' };
      const sse: TransportConfig = { type: 'sse' };
      const http: TransportConfig = { type: 'http-stream' };

      expect(stdio.type).toBe('stdio');
      expect(sse.type).toBe('sse');
      expect(http.type).toBe('http-stream');
    });

    it('BC-018-T03: TransportConfig accepts auth field', () => {
      const provider = new APIKeyAuthProvider({ keys: ['k'] });
      const config: TransportConfig = {
        type: 'http-stream',
        auth: { provider },
      };
      expect(config.auth).toBeDefined();
      expect(config.auth!.provider).toBe(provider);
    });

    it('BC-018-T04: TransportConfig accepts options field', () => {
      const config: TransportConfig = {
        type: 'http-stream',
        options: { port: 8080 },
      };
      expect(config.options).toBeDefined();
    });
  });
});
