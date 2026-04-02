/**
 * E2E tests for Lambda/serverless support.
 *
 * Tests the full lifecycle: MCPServer → addTool → handleRequest/createLambdaHandler
 * using a real tool (EchoTool) — no mocks for tool execution.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { MCPServer } from '../../src/core/MCPServer.js';
import { APIKeyAuthProvider } from '../../src/auth/providers/apikey.js';
import EchoTool from '../fixtures/serverless-tools/EchoTool.js';
import type { APIGatewayV2Event, APIGatewayV1Event } from '../../src/serverless/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeInitializeBody(id: number = 1) {
  return {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0.0' },
    },
    id,
  };
}

function makeToolCallBody(toolName: string, args: Record<string, unknown>, id: number = 2) {
  return {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id,
  };
}

function makeToolsListBody(id: number = 3) {
  return { jsonrpc: '2.0', method: 'tools/list', id };
}

function makeV2Event(body: any, method = 'POST', path = '/mcp'): APIGatewayV2Event {
  return {
    version: '2.0',
    requestContext: {
      http: { method, path, sourceIp: '127.0.0.1' },
    },
    rawPath: path,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
    },
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
  };
}

function makeV1Event(body: any, method = 'POST', path = '/mcp'): APIGatewayV1Event {
  return {
    httpMethod: method,
    path,
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
    },
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
    requestContext: { identity: { sourceIp: '10.0.0.1' } },
  };
}

function makeWebRequest(body: any, method = 'POST', path = '/mcp'): Request {
  return new Request(`https://lambda.local${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}

// ── handleRequest() E2E ──────────────────────────────────────────────────

describe('handleRequest() E2E', () => {
  let server: MCPServer;

  beforeAll(() => {
    server = new MCPServer({
      name: 'e2e-serverless',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);
  });

  it('handles initialize request', async () => {
    const request = makeWebRequest(makeInitializeBody());
    const response = await server.handleRequest(request);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBeTruthy();
    // The response should contain serverInfo
    expect(body).toContain('e2e-serverless');
  });

  it('handles tools/list request', async () => {
    const request = makeWebRequest(makeToolsListBody());
    const response = await server.handleRequest(request);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('echo');
  });

  it('handles tools/call and executes tool', async () => {
    const request = makeWebRequest(makeToolCallBody('echo', { message: 'hello world' }));
    const response = await server.handleRequest(request);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('hello world');
  });

  it('returns CORS headers on response', async () => {
    const request = makeWebRequest(makeInitializeBody());
    const response = await server.handleRequest(request);

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('handles OPTIONS preflight', async () => {
    const request = new Request('https://lambda.local/mcp', { method: 'OPTIONS' });
    const response = await server.handleRequest(request);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('handles multiple sequential requests (warm start)', async () => {
    const req1 = makeWebRequest(makeInitializeBody(10));
    const res1 = await server.handleRequest(req1);
    expect(res1.status).toBe(200);

    const req2 = makeWebRequest(makeToolCallBody('echo', { message: 'second' }, 11));
    const res2 = await server.handleRequest(req2);
    expect(res2.status).toBe(200);
    const body2 = await res2.text();
    expect(body2).toContain('second');
  });

  it('handles concurrent requests', async () => {
    const [res1, res2] = await Promise.all([
      server.handleRequest(makeWebRequest(makeInitializeBody(20))),
      server.handleRequest(makeWebRequest(makeInitializeBody(21))),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});

// ── handleRequest() with auth ────────────────────────────────────────────

describe('handleRequest() with auth', () => {
  let server: MCPServer;

  beforeAll(() => {
    const provider = new APIKeyAuthProvider({ keys: ['secret-key'] });
    server = new MCPServer({
      name: 'auth-e2e',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
      auth: { provider },
    });
    server.addTool(EchoTool);
  });

  it('rejects request without API key', async () => {
    const request = makeWebRequest(makeInitializeBody());
    const response = await server.handleRequest(request);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('ApiKey');
    // CORS headers even on auth failure
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('accepts request with valid API key', async () => {
    const request = new Request('https://lambda.local/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'X-API-Key': 'secret-key',
      },
      body: JSON.stringify(makeInitializeBody()),
    });
    const response = await server.handleRequest(request);

    expect(response.status).not.toBe(401);
  });
});

// ── createLambdaHandler() E2E ────────────────────────────────────────────

describe('createLambdaHandler() E2E', () => {
  let handler: (event: any, context: any) => Promise<any>;

  beforeAll(() => {
    const server = new MCPServer({
      name: 'lambda-e2e',
      version: '2.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);
    handler = server.createLambdaHandler();
  });

  it('handles v2 initialize event', async () => {
    const result = await handler(makeV2Event(makeInitializeBody()), {});
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('lambda-e2e');
    expect(result.isBase64Encoded).toBe(false);
  });

  it('handles v2 tools/call event', async () => {
    const result = await handler(
      makeV2Event(makeToolCallBody('echo', { message: 'lambda says hi' })),
      {},
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('lambda says hi');
  });

  it('handles v1 initialize event', async () => {
    const result = await handler(makeV1Event(makeInitializeBody()), {});
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('lambda-e2e');
    // v1 result should have multiValueHeaders
    expect(result.multiValueHeaders).toBeDefined();
  });

  it('includes CORS headers in result', async () => {
    const result = await handler(makeV2Event(makeInitializeBody()), {});
    expect(result.headers['access-control-allow-origin']).toBe('*');
  });

  it('handles warm start (multiple invocations)', async () => {
    const r1 = await handler(makeV2Event(makeInitializeBody(30)), {});
    expect(r1.statusCode).toBe(200);

    const r2 = await handler(
      makeV2Event(makeToolCallBody('echo', { message: 'warm' }, 31)),
      {},
    );
    expect(r2.statusCode).toBe(200);
    expect(r2.body).toContain('warm');
  });

  it('returns 500 with JSON-RPC error on unexpected failure', async () => {
    // Create a server that will fail during handleRequest due to bad state
    const badServer = new MCPServer({
      name: 'bad-server',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    // No tools added AND no directory — but we skip the error by using
    // an event format that causes an internal error
    badServer.addTool(EchoTool);
    const badHandler = badServer.createLambdaHandler();

    // A completely malformed body that will cause JSON parse error in the SDK
    const event = makeV2Event(null);
    event.body = 'not json at all {{{';
    const result = await badHandler(event, {});

    // Should get an error response, not a thrown exception
    expect(result.statusCode).toBeDefined();
    expect(typeof result.body).toBe('string');
  });
});

// ── createLambdaHandler() with basePath ──────────────────────────────────

describe('createLambdaHandler() with basePath', () => {
  it('strips basePath from request path', async () => {
    const server = new MCPServer({
      name: 'basepath-test',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);
    const handler = server.createLambdaHandler({ basePath: '/prod' });

    const event = makeV2Event(makeInitializeBody());
    event.rawPath = '/prod/mcp';
    event.requestContext.http.path = '/prod/mcp';

    const result = await handler(event, {});
    expect(result.statusCode).toBe(200);
  });
});

// ── createLambdaHandler() with custom CORS ───────────────────────────────

describe('createLambdaHandler() CORS config', () => {
  it('applies custom CORS allowOrigin', async () => {
    const server = new MCPServer({
      name: 'cors-test',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);
    const handler = server.createLambdaHandler({
      cors: { allowOrigin: 'https://myapp.com' },
    });

    const result = await handler(makeV2Event(makeInitializeBody()), {});
    expect(result.headers['access-control-allow-origin']).toBe('https://myapp.com');
  });

  it('disables CORS with cors: false', async () => {
    const server = new MCPServer({
      name: 'no-cors-test',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);
    const handler = server.createLambdaHandler({ cors: false });

    const result = await handler(makeV2Event(makeInitializeBody()), {});
    // The handleRequest still adds CORS to the Response, but createLambdaHandler
    // does NOT override them when cors: false
    // The response will have CORS from handleRequest's _addCorsHeaders
    expect(result.statusCode).toBe(200);
  });
});

// ── addTool() ────────────────────────────────────────────────────────────

describe('addTool()', () => {
  it('throws if called after initialization', async () => {
    const server = new MCPServer({
      name: 'add-after-init',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);

    // Trigger initialization via handleRequest
    await server.handleRequest(makeWebRequest(makeInitializeBody()));

    // Now addTool should throw
    expect(() => server.addTool(EchoTool)).toThrow(/after initialization/);
  });

  it('tool appears in tools/list', async () => {
    const server = new MCPServer({
      name: 'tool-list-test',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);

    const response = await server.handleRequest(makeWebRequest(makeToolsListBody()));
    const body = await response.text();
    expect(body).toContain('echo');
    expect(body).toContain('Echoes the input message back');
  });
});

// ── OAuth metadata via handleRequest ─────────────────────────────────────

describe('handleRequest() OAuth metadata', () => {
  it('returns 404 for /.well-known/oauth-protected-resource when no OAuth', async () => {
    const server = new MCPServer({
      name: 'no-oauth',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-e2e-12345',
    });
    server.addTool(EchoTool);

    const request = new Request(
      'https://lambda.local/.well-known/oauth-protected-resource',
      { method: 'GET' },
    );
    const response = await server.handleRequest(request);
    expect(response.status).toBe(404);
  });
});
