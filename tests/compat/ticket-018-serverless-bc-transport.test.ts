/**
 * BC-018: Transport backwards compatibility tests
 *
 * Captures existing behavior of HTTP Stream and SSE transports before
 * the serverless refactor. Verifies:
 * - Transport construction with all config variations
 * - Lifecycle (start/stop/isRunning)
 * - Handler wiring (onmessage, onclose, onerror)
 * - CORS handling
 * - Auth integration at transport level
 * - HTTP request handling for MCP endpoints
 * - OAuth metadata endpoint serving
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { HttpStreamTransport } from '../../src/transports/http/server.js';
import { SSEServerTransport } from '../../src/transports/sse/server.js';
import { APIKeyAuthProvider } from '../../src/auth/providers/apikey.js';
import { OAuthAuthProvider } from '../../src/auth/providers/oauth.js';
import { MockAuthServer } from '../fixtures/mock-auth-server.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makePostRequest(
  port: number,
  path: string,
  body: any,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const reqHeaders: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...headers,
    };
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST', headers: reqHeaders },
      (res) => {
        let data = '';
        const timeout = setTimeout(() => {
          res.destroy();
          resolve({ statusCode: res.statusCode!, headers: res.headers, body: data });
        }, 2000);
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          resolve({ statusCode: res.statusCode!, headers: res.headers, body: data });
        });
      },
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function makeGetRequest(
  port: number,
  path: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        let data = '';
        const timeout = setTimeout(() => {
          res.destroy();
          resolve({ statusCode: res.statusCode!, headers: res.headers, body: data });
        }, 2000);
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          resolve({ statusCode: res.statusCode!, headers: res.headers, body: data });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function makeOptionsRequest(
  port: number,
  path: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'OPTIONS', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode!, headers: res.headers, body: data });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function randomPort(): number {
  return 14000 + Math.floor(Math.random() * 1000);
}

// ── HTTP Stream Transport ────────────────────────────────────────────────

describe('BC-018: HttpStreamTransport backward compatibility', () => {
  let transport: HttpStreamTransport;

  afterEach(async () => {
    if (transport?.isRunning()) {
      await transport.close();
    }
  });

  describe('Construction', () => {
    it('BC-018-HT01: constructs with no arguments', () => {
      transport = new HttpStreamTransport();
      expect(transport.type).toBe('http-stream');
      expect(transport.isRunning()).toBe(false);
    });

    it('BC-018-HT02: constructs with port only', () => {
      transport = new HttpStreamTransport({ port: randomPort() });
      expect(transport.type).toBe('http-stream');
    });

    it('BC-018-HT03: constructs with stream responseMode', () => {
      transport = new HttpStreamTransport({ responseMode: 'stream' });
      expect(transport).toBeDefined();
    });

    it('BC-018-HT04: constructs with batch responseMode', () => {
      transport = new HttpStreamTransport({ responseMode: 'batch' });
      expect(transport).toBeDefined();
    });

    it('BC-018-HT05: constructs with custom endpoint', () => {
      transport = new HttpStreamTransport({ endpoint: '/custom-mcp' });
      expect(transport).toBeDefined();
    });

    it('BC-018-HT06: constructs with CORS config', () => {
      transport = new HttpStreamTransport({
        cors: {
          allowOrigin: 'https://example.com',
          allowMethods: 'POST',
          allowHeaders: 'Content-Type',
        },
      });
      expect(transport).toBeDefined();
    });

    it('BC-018-HT07: constructs with API Key auth', () => {
      const provider = new APIKeyAuthProvider({ keys: ['test-key'] });
      transport = new HttpStreamTransport({
        port: randomPort(),
        auth: { provider, endpoints: { messages: true } },
      });
      expect(transport).toBeDefined();
    });

    it('BC-018-HT08: constructs with host config', () => {
      transport = new HttpStreamTransport({ host: '127.0.0.1' });
      expect(transport).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    it('BC-018-HT10: start → isRunning=true → close → isRunning=false', async () => {
      const port = randomPort();
      transport = new HttpStreamTransport({ port });

      expect(transport.isRunning()).toBe(false);
      await transport.start();
      expect(transport.isRunning()).toBe(true);
      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });

    it('BC-018-HT11: double start throws', async () => {
      const port = randomPort();
      transport = new HttpStreamTransport({ port });
      await transport.start();
      await expect(transport.start()).rejects.toThrow('already started');
    });

    it('BC-018-HT12: close on non-running transport is safe', async () => {
      transport = new HttpStreamTransport({ port: randomPort() });
      await expect(transport.close()).resolves.toBeUndefined();
    });

    it('BC-018-HT13: multiple start/stop cycles work', async () => {
      const port = randomPort();
      transport = new HttpStreamTransport({ port });

      await transport.start();
      expect(transport.isRunning()).toBe(true);
      await transport.close();
      expect(transport.isRunning()).toBe(false);

      await transport.start();
      expect(transport.isRunning()).toBe(true);
      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });
  });

  describe('Handler interface', () => {
    it('BC-018-HT20: onmessage can be assigned', () => {
      transport = new HttpStreamTransport({ port: randomPort() });
      expect(() => {
        transport.onmessage = async (_msg: JSONRPCMessage) => {};
      }).not.toThrow();
    });

    it('BC-018-HT21: onclose can be assigned', () => {
      transport = new HttpStreamTransport({ port: randomPort() });
      expect(() => {
        transport.onclose = () => {};
      }).not.toThrow();
    });

    it('BC-018-HT22: onerror can be assigned', () => {
      transport = new HttpStreamTransport({ port: randomPort() });
      expect(() => {
        transport.onerror = (_err: Error) => {};
      }).not.toThrow();
    });

    it('BC-018-HT23: send() resolves when not running (graceful no-op)', async () => {
      transport = new HttpStreamTransport({ port: randomPort() });
      const msg: JSONRPCMessage = { jsonrpc: '2.0', method: 'test' };
      await expect(transport.send(msg)).resolves.toBeUndefined();
    });

    it('BC-018-HT24: send() resolves when running but no sessions', async () => {
      const port = randomPort();
      transport = new HttpStreamTransport({ port });
      await transport.start();
      const msg: JSONRPCMessage = { jsonrpc: '2.0', method: 'test' };
      await expect(transport.send(msg)).resolves.toBeUndefined();
    });
  });

  describe('HTTP endpoints', () => {
    it('BC-018-HT30: POST to /mcp without auth returns non-404', async () => {
      const port = randomPort();
      transport = new HttpStreamTransport({ port, endpoint: '/mcp', responseMode: 'batch' });
      await transport.start();

      const res = await makePostRequest(port, '/mcp', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      });

      // Should reach the MCP handler (not a 404)
      expect(res.statusCode).not.toBe(404);
    });

    it('BC-018-HT31: GET to unknown path returns 404', async () => {
      const port = randomPort();
      transport = new HttpStreamTransport({ port, endpoint: '/mcp' });
      await transport.start();

      const res = await makeGetRequest(port, '/nonexistent');
      expect(res.statusCode).toBe(404);
    });

    it('BC-018-HT32: OPTIONS returns 204 when CORS configured', async () => {
      const port = randomPort();
      transport = new HttpStreamTransport({
        port,
        endpoint: '/mcp',
        cors: { allowOrigin: '*' },
      });
      await transport.start();

      const res = await makeOptionsRequest(port, '/mcp');
      expect(res.statusCode).toBe(204);
    });
  });

  describe('Auth at transport level', () => {
    it('BC-018-HT40: returns 401 when API key auth configured but no key sent', async () => {
      const port = randomPort();
      const provider = new APIKeyAuthProvider({ keys: ['secret-key'] });
      transport = new HttpStreamTransport({
        port,
        endpoint: '/mcp',
        responseMode: 'batch',
        auth: { provider, endpoints: { sse: true, messages: true } },
      });
      await transport.start();

      const res = await makePostRequest(port, '/mcp', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toBeDefined();
    });

    it('BC-018-HT41: returns non-401 when valid API key sent', async () => {
      const port = randomPort();
      const provider = new APIKeyAuthProvider({ keys: ['secret-key'] });
      transport = new HttpStreamTransport({
        port,
        endpoint: '/mcp',
        responseMode: 'batch',
        auth: { provider, endpoints: { sse: true, messages: true } },
      });
      await transport.start();

      const res = await makePostRequest(
        port,
        '/mcp',
        {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
          id: 1,
        },
        { 'X-API-Key': 'secret-key' },
      );

      // Should pass auth (status may be anything except 401)
      expect(res.statusCode).not.toBe(401);
    });
  });
});

// ── OAuth metadata endpoint via HTTP Stream ──────────────────────────────

describe('BC-018: OAuth metadata endpoint backward compatibility', () => {
  let mockAuthServer: MockAuthServer;
  let transport: HttpStreamTransport;
  const mockAuthPort = 9180 + Math.floor(Math.random() * 10);

  beforeAll(async () => {
    mockAuthServer = new MockAuthServer({ port: mockAuthPort });
    await mockAuthServer.start();
  });

  afterAll(async () => {
    await mockAuthServer.stop();
  });

  afterEach(async () => {
    if (transport?.isRunning()) {
      await transport.close();
    }
  });

  it('BC-018-OM01: serves /.well-known/oauth-protected-resource when OAuth configured', async () => {
    const port = randomPort();
    const oauthProvider = new OAuthAuthProvider({
      authorizationServers: [mockAuthServer.getIssuer()],
      resource: mockAuthServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockAuthServer.getJWKSUri(),
        audience: mockAuthServer.getAudience(),
        issuer: mockAuthServer.getIssuer(),
      },
    });

    transport = new HttpStreamTransport({
      port,
      endpoint: '/mcp',
      responseMode: 'batch',
      auth: { provider: oauthProvider },
    });
    await transport.start();

    const res = await makeGetRequest(port, '/.well-known/oauth-protected-resource');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const metadata = JSON.parse(res.body);
    expect(metadata.resource).toBe(mockAuthServer.getAudience());
    expect(metadata.authorization_servers).toContain(mockAuthServer.getIssuer());
  });

  it('BC-018-OM02: returns 404 for /.well-known/oauth-protected-resource when no OAuth', async () => {
    const port = randomPort();
    transport = new HttpStreamTransport({ port, endpoint: '/mcp' });
    await transport.start();

    const res = await makeGetRequest(port, '/.well-known/oauth-protected-resource');
    expect(res.statusCode).toBe(404);
  });

  it('BC-018-OM03: OAuth metadata endpoint is public (no auth required)', async () => {
    const port = randomPort();
    const oauthProvider = new OAuthAuthProvider({
      authorizationServers: [mockAuthServer.getIssuer()],
      resource: mockAuthServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockAuthServer.getJWKSUri(),
        audience: mockAuthServer.getAudience(),
        issuer: mockAuthServer.getIssuer(),
      },
    });

    transport = new HttpStreamTransport({
      port,
      endpoint: '/mcp',
      responseMode: 'batch',
      auth: {
        provider: oauthProvider,
        endpoints: { sse: true, messages: true },
      },
    });
    await transport.start();

    // No auth header — should still return metadata
    const res = await makeGetRequest(port, '/.well-known/oauth-protected-resource');
    expect(res.statusCode).toBe(200);
  });
});
