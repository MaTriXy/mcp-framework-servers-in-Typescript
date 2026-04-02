/**
 * Multi-transport configuration validation tests (Issue #124)
 *
 * These tests establish the behavioral contract BEFORE implementation.
 * They validate:
 * - Backward compatibility: singular `transport` config still works
 * - New `transports` array config
 * - Validation: mutual exclusion, stdio singleton, port conflicts
 * - Config normalization to internal transportConfigs array
 *
 * NOTE: Tests use `as any` casts for the `transports` field since it does not
 * yet exist on MCPServerConfig. Remove the casts after implementation.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPServer } from '../../src/core/MCPServer.js';

describe('Multi-transport configuration', () => {
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    // Suppress logger output during tests
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  // ─── Backward compatibility: singular transport config ──────────────

  describe('Singular transport config (backward compat)', () => {
    it('should accept default config (no transport specified)', () => {
      const server = new MCPServer();
      expect(server).toBeInstanceOf(MCPServer);
      expect(server.IsRunning).toBe(false);
    });

    it('should accept transport: { type: "stdio" }', () => {
      const server = new MCPServer({
        name: 'test',
        transport: { type: 'stdio' },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transport: { type: "sse" }', () => {
      const server = new MCPServer({
        name: 'test',
        transport: { type: 'sse' },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transport: { type: "http-stream" }', () => {
      const server = new MCPServer({
        name: 'test',
        transport: { type: 'http-stream' },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transport with options', () => {
      const server = new MCPServer({
        name: 'test',
        transport: {
          type: 'sse',
          options: { port: 4000, host: '0.0.0.0' },
        },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transport with auth config', () => {
      const mockProvider = {
        authenticate: async () => true,
        getAuthError: () => ({ status: 401, message: 'Unauthorized' }),
      };
      const server = new MCPServer({
        name: 'test',
        transport: {
          type: 'http-stream',
          auth: { provider: mockProvider },
        },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });
  });

  // ─── New: transports array config ──────────────────────────────────

  describe('Plural transports array config', () => {
    it('should accept transports with a single entry', () => {
      const server = new MCPServer({
        name: 'test',
        transports: [{ type: 'stdio' }],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transports with stdio + http-stream', () => {
      const server = new MCPServer({
        name: 'test',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transports with stdio + sse + http-stream', () => {
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

    it('should accept transports with per-transport auth', () => {
      const mockProvider = {
        authenticate: async () => true,
        getAuthError: () => ({ status: 401, message: 'Unauthorized' }),
      };
      const server = new MCPServer({
        name: 'test',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 }, auth: { provider: mockProvider } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept two HTTP-based transports on different ports', () => {
      const server = new MCPServer({
        name: 'test',
        transports: [
          { type: 'sse', options: { port: 3001 } },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });
  });

  // ─── Validation: mutual exclusion ──────────────────────────────────

  describe('Mutual exclusion: transport vs transports', () => {
    it('should throw when both transport and transports are provided', () => {
      expect(() => {
        new MCPServer({
          name: 'test',
          transport: { type: 'stdio' },
          transports: [{ type: 'sse', options: { port: 3001 } }],
        } as any);
      }).toThrow(/cannot.*both.*transport.*transports/i);
    });
  });

  // ─── Validation: stdio singleton ───────────────────────────────────

  describe('stdio singleton enforcement', () => {
    it('should throw when transports contains two stdio entries', () => {
      expect(() => {
        new MCPServer({
          name: 'test',
          transports: [
            { type: 'stdio' },
            { type: 'stdio' },
          ],
        } as any);
      }).toThrow(/stdio/i);
    });

    it('should allow exactly one stdio among multiple transports', () => {
      const server = new MCPServer({
        name: 'test',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });
  });

  // ─── Validation: port conflicts ────────────────────────────────────

  describe('Port conflict detection', () => {
    it('should throw when two HTTP-based transports use the same port', () => {
      expect(() => {
        new MCPServer({
          name: 'test',
          transports: [
            { type: 'sse', options: { port: 8080 } },
            { type: 'http-stream', options: { port: 8080 } },
          ],
        } as any);
      }).toThrow(/port/i);
    });

    it('should throw when two SSE transports use the same port', () => {
      expect(() => {
        new MCPServer({
          name: 'test',
          transports: [
            { type: 'sse', options: { port: 3001 } },
            { type: 'sse', options: { port: 3001 } },
          ],
        } as any);
      }).toThrow(/port/i);
    });

    it('should throw when two transports use the same default port', () => {
      // Both SSE and HTTP Stream default to the same port if none specified
      // This test ensures defaults are considered in conflict detection
      expect(() => {
        new MCPServer({
          name: 'test',
          transports: [
            { type: 'sse' },
            { type: 'http-stream' },
          ],
        } as any);
      }).toThrow(/port/i);
    });
  });

  // ─── Config with other MCPServerConfig options ─────────────────────

  describe('Multi-transport with other config options', () => {
    it('should accept transports alongside name and version', () => {
      const server = new MCPServer({
        name: 'multi-server',
        version: '2.0.0',
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 9090 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transports alongside logging', () => {
      const server = new MCPServer({
        name: 'multi-server',
        logging: true,
        transports: [
          { type: 'stdio' },
          { type: 'sse', options: { port: 3001 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transports alongside tasks config', () => {
      const server = new MCPServer({
        name: 'multi-server',
        tasks: { enabled: true },
        transports: [
          { type: 'stdio' },
          { type: 'http-stream', options: { port: 8080 } },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should accept transports alongside devMode', () => {
      const server = new MCPServer({
        name: 'multi-server',
        devMode: true,
        transports: [
          { type: 'stdio' },
        ],
      } as any);
      expect(server).toBeInstanceOf(MCPServer);
    });
  });
});
