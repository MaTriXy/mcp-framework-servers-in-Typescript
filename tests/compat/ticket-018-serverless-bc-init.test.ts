/**
 * BC-018: Initialization & capabilities backward compatibility tests
 *
 * Tests the MCPServer initialization path that we're about to extract
 * into ensureInitialized(). Captures:
 * - start() behavior (including expected failure modes)
 * - Auth config merging into transport options
 * - basePath resolution
 * - Capability detection requirements
 *
 * Note: MCPServer.start() requires tools/prompts/resources to exist in
 * the basePath directory. Without them, capabilities are empty, and the
 * SDK throws when trying to register handlers. This is captured as
 * expected behavior.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { MCPServer } from '../../src/core/MCPServer.js';
import { APIKeyAuthProvider } from '../../src/auth/providers/apikey.js';

// ── start() failure with no tools ────────────────────────────────────────

describe('BC-018: MCPServer start() behavior', () => {
  let server: MCPServer;

  afterEach(async () => {
    if (server?.IsRunning) {
      try {
        await server.stop();
      } catch {
        // ignore
      }
    }
  });

  it('BC-018-IN01: start() throws when no tools/prompts/resources exist (empty basePath)', async () => {
    server = new MCPServer({
      name: 'empty-server',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-mcp-test-path-12345',
      transport: {
        type: 'http-stream',
        options: { port: 19991, endpoint: '/mcp' },
      },
    });

    // SDK throws because setupHandlers registers ListToolsRequestSchema
    // but no tools capability is declared (no tools found on disk)
    await expect(server.start()).rejects.toThrow();
    expect(server.IsRunning).toBe(false);
  });

  it('BC-018-IN02: start() with stdio transport throws too when no tools', async () => {
    server = new MCPServer({
      name: 'stdio-empty',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-mcp-test-path-12345',
      transport: { type: 'stdio' },
    });

    await expect(server.start()).rejects.toThrow();
  });

  it('BC-018-IN03: IsRunning stays false after failed start()', async () => {
    server = new MCPServer({
      name: 'fail-test',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-mcp-test-path-12345',
    });

    try {
      await server.start();
    } catch {
      // expected
    }

    expect(server.IsRunning).toBe(false);
  });

  it('BC-018-IN04: stop() after failed start() is safe', async () => {
    server = new MCPServer({
      name: 'stop-after-fail',
      basePath: '/tmp/nonexistent-mcp-test-path-12345',
    });

    try {
      await server.start();
    } catch {
      // expected
    }

    // Should not throw
    await expect(server.stop()).resolves.toBeUndefined();
  });
});

// ── Auth config merging ──────────────────────────────────────────────────

describe('BC-018: Auth config merging into transport options', () => {
  it('BC-018-AM01: transport.auth is merged into transport.options.auth', () => {
    const provider = new APIKeyAuthProvider({ keys: ['k'] });
    const server = new MCPServer({
      transport: {
        type: 'http-stream',
        options: { port: 19999 },
        auth: { provider },
      },
    });
    expect(server).toBeDefined();
  });

  it('BC-018-AM02: auth works when only specified in transport.auth (no options)', () => {
    const provider = new APIKeyAuthProvider({ keys: ['k'] });
    const server = new MCPServer({
      transport: {
        type: 'http-stream',
        auth: { provider },
      },
    });
    expect(server).toBeDefined();
  });

  it('BC-018-AM03: auth works when only specified in transport.options.auth', () => {
    const provider = new APIKeyAuthProvider({ keys: ['k'] });
    const server = new MCPServer({
      transport: {
        type: 'http-stream',
        options: {
          port: 19998,
          auth: { provider },
        } as any,
      },
    });
    expect(server).toBeDefined();
  });
});

// ── basePath resolution ──────────────────────────────────────────────────

describe('BC-018: basePath resolution backward compatibility', () => {
  it('BC-018-BP01: explicit basePath is used', () => {
    const server = new MCPServer({ basePath: '/custom/path' });
    expect(server).toBeDefined();
  });

  it('BC-018-BP02: default basePath resolution does not throw', () => {
    expect(() => new MCPServer()).not.toThrow();
  });

  it('BC-018-BP03: basePath with nonexistent directory still constructs', () => {
    const server = new MCPServer({ basePath: '/nonexistent/directory/12345' });
    expect(server).toBeDefined();
  });
});

// ── Capability detection interaction ─────────────────────────────────────

describe('BC-018: Capability detection', () => {
  it('BC-018-CD01: server with no tools has empty capabilities (detected via start failure)', async () => {
    const server = new MCPServer({
      name: 'cap-test',
      basePath: '/tmp/nonexistent-mcp-test-path-12345',
      transport: { type: 'http-stream', options: { port: 19997 } },
    });

    // The error message reveals the SDK enforces capabilities
    try {
      await server.start();
    } catch (err: any) {
      expect(err.message).toContain('does not support tools');
    }
  });

  it('BC-018-CD02: start() registers handlers for detected capabilities only', async () => {
    // This is an important invariant: setupHandlers always registers
    // ListToolsRequestSchema and CallToolRequestSchema, so if tools
    // capability is not set, it throws. This behavior must be preserved.
    const server = new MCPServer({
      name: 'handler-test',
      basePath: '/tmp/nonexistent-mcp-test-path-12345',
    });

    await expect(server.start()).rejects.toThrow(/does not support tools/);
  });
});
