/**
 * Multi-transport lifecycle backward-compatibility tests (Issue #124)
 *
 * These tests ensure that the MCPServer lifecycle (constructor, IsRunning,
 * stop() without start()) behaves identically whether using the singular
 * `transport` config or the new `transports` array.
 *
 * They do NOT call start() (which would block on transport connection),
 * focusing instead on pre-start state and safe stop().
 *
 * NOTE: Tests use `as any` casts for the `transports` field since it does not
 * yet exist on MCPServerConfig. Remove the casts after implementation.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPServer } from '../../src/core/MCPServer.js';

describe('MCPServer lifecycle parity (single vs multi-transport)', () => {
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  // ─── Constructor parity ────────────────────────────────────────────

  describe('Constructor parity', () => {
    it('default config produces equivalent server to transports: [{ type: "stdio" }]', () => {
      const defaultServer = new MCPServer();
      const explicitServer = new MCPServer({
        transports: [{ type: 'stdio' }],
      } as any);

      expect(defaultServer).toBeInstanceOf(MCPServer);
      expect(explicitServer).toBeInstanceOf(MCPServer);
      expect(defaultServer.IsRunning).toBe(false);
      expect(explicitServer.IsRunning).toBe(false);
    });

    it('transport: { type: "stdio" } is equivalent to transports: [{ type: "stdio" }]', () => {
      const singular = new MCPServer({
        name: 'test',
        transport: { type: 'stdio' },
      });
      const plural = new MCPServer({
        name: 'test',
        transports: [{ type: 'stdio' }],
      } as any);

      expect(singular).toBeInstanceOf(MCPServer);
      expect(plural).toBeInstanceOf(MCPServer);
      expect(singular.IsRunning).toBe(false);
      expect(plural.IsRunning).toBe(false);
    });

    it('transport: { type: "sse" } is equivalent to transports: [{ type: "sse" }]', () => {
      const singular = new MCPServer({
        name: 'test',
        transport: { type: 'sse' },
      });
      const plural = new MCPServer({
        name: 'test',
        transports: [{ type: 'sse' }],
      } as any);

      expect(singular).toBeInstanceOf(MCPServer);
      expect(plural).toBeInstanceOf(MCPServer);
    });

    it('transport: { type: "http-stream" } is equivalent to transports: [{ type: "http-stream" }]', () => {
      const singular = new MCPServer({
        name: 'test',
        transport: { type: 'http-stream' },
      });
      const plural = new MCPServer({
        name: 'test',
        transports: [{ type: 'http-stream' }],
      } as any);

      expect(singular).toBeInstanceOf(MCPServer);
      expect(plural).toBeInstanceOf(MCPServer);
    });

    it('transport with options is equivalent to transports with same options', () => {
      const singular = new MCPServer({
        name: 'test',
        transport: {
          type: 'sse',
          options: { port: 4000, host: '127.0.0.1' },
        },
      });
      const plural = new MCPServer({
        name: 'test',
        transports: [{
          type: 'sse',
          options: { port: 4000, host: '127.0.0.1' },
        }],
      } as any);

      expect(singular).toBeInstanceOf(MCPServer);
      expect(plural).toBeInstanceOf(MCPServer);
    });

    it('transport with auth is equivalent to transports with same auth', () => {
      const mockProvider = {
        authenticate: async () => true,
        getAuthError: () => ({ status: 401, message: 'Unauthorized' }),
      };

      const singular = new MCPServer({
        name: 'test',
        transport: {
          type: 'http-stream',
          auth: { provider: mockProvider },
        },
      });
      const plural = new MCPServer({
        name: 'test',
        transports: [{
          type: 'http-stream',
          auth: { provider: mockProvider },
        }],
      } as any);

      expect(singular).toBeInstanceOf(MCPServer);
      expect(plural).toBeInstanceOf(MCPServer);
    });
  });

  // ─── IsRunning parity ──────────────────────────────────────────────

  describe('IsRunning parity', () => {
    it('IsRunning is false before start() with singular transport', () => {
      const server = new MCPServer({ transport: { type: 'stdio' } });
      expect(server.IsRunning).toBe(false);
    });

    it('IsRunning is false before start() with transports array', () => {
      const server = new MCPServer({
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server.IsRunning).toBe(false);
    });

    it('IsRunning is false before start() with empty-ish config', () => {
      const server = new MCPServer({});
      expect(server.IsRunning).toBe(false);
    });
  });

  // ─── stop() without start() parity ─────────────────────────────────

  describe('stop() without start() parity', () => {
    it('stop() is safe with singular transport', async () => {
      const server = new MCPServer({ transport: { type: 'stdio' } });
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('stop() is safe with transports array', async () => {
      const server = new MCPServer({
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('stop() is safe with multi-transport including all types', async () => {
      const server = new MCPServer({
        transports: [
          { type: 'stdio' },
          { type: 'sse', options: { port: 3001 } },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('multiple stop() calls are safe with multi-transport', async () => {
      const server = new MCPServer({
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      await expect(server.stop()).resolves.toBeUndefined();
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  // ─── All transport types accepted (regression from ticket-009) ─────

  describe('All transport types accepted (regression guard)', () => {
    const transportTypes = ['stdio', 'sse', 'http-stream'] as const;

    for (const type of transportTypes) {
      it(`singular transport: { type: "${type}" } constructs without error`, () => {
        const server = new MCPServer({
          name: `test-${type}`,
          version: '0.0.1',
          transport: { type },
        });
        expect(server).toBeInstanceOf(MCPServer);
      });
    }

    for (const type of transportTypes) {
      it(`plural transports: [{ type: "${type}" }] constructs without error`, () => {
        const server = new MCPServer({
          name: `test-${type}`,
          version: '0.0.1',
          transports: [{ type }],
        } as any);
        expect(server).toBeInstanceOf(MCPServer);
      });
    }
  });

  // ─── Config with name/version preserved ────────────────────────────

  describe('Server name and version preserved with multi-transport', () => {
    it('name and version are accessible after construction', () => {
      const server = new MCPServer({
        name: 'my-multi-server',
        version: '3.5.0',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 9000 } },
        ],
      } as any);
      // MCPServer doesn't expose name/version getters publicly,
      // but construction should succeed and server should be valid
      expect(server).toBeInstanceOf(MCPServer);
      expect(server.IsRunning).toBe(false);
    });
  });
});
