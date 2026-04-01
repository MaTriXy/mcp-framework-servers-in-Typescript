import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { SSEServerTransport } from '../../src/transports/sse/server.js';
import { HttpStreamTransport } from '../../src/transports/http/server.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

function makeOptionsRequest(
  port: number,
  path: string,
  headers?: Record<string, string>
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'OPTIONS',
        headers: {
          Origin: 'http://example.com',
          'Access-Control-Request-Method': 'POST',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode!, headers: res.headers, body: data });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('BC-004: CORS Compatibility E2E', () => {
  describe('SSE Transport CORS', () => {
    let sseTransport: SSEServerTransport;
    const ssePort = 19220;

    beforeAll(async () => {
      sseTransport = new SSEServerTransport({
        port: ssePort,
        endpoint: '/sse',
        messageEndpoint: '/messages',
        cors: {
          allowOrigin: '*',
          allowMethods: 'GET, POST, DELETE, OPTIONS',
          allowHeaders: 'Content-Type, Accept, Authorization, x-api-key, Mcp-Session-Id',
        },
      });
      sseTransport.setServerFactory(() => new Server(
        { name: 'test-server', version: '0.0.1' },
        { capabilities: {} }
      ));
      await sseTransport.start();
    });

    afterAll(async () => {
      if (sseTransport.isRunning()) {
        await sseTransport.close();
      }
    });

    it('BC-004-E01: SSE OPTIONS returns 204 with CORS headers', async () => {
      const res = await makeOptionsRequest(ssePort, '/sse');

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toBeDefined();
      expect(res.headers['access-control-allow-headers']).toBeDefined();
      expect(res.headers['access-control-max-age']).toBeDefined();
    });

    it('BC-004-E03: SSE GET /sse includes CORS headers on SSE stream response', async () => {
      // The SSE endpoint returns a streaming response that stays open.
      // We read just the initial response headers and first chunk, then abort.
      const result = await new Promise<{
        statusCode: number;
        headers: http.IncomingHttpHeaders;
        body: string;
      }>((resolve) => {
        const req = http.request(
          { hostname: 'localhost', port: ssePort, path: '/sse', method: 'GET' },
          (res) => {
            let data = '';
            // Once we get headers and at least one data chunk, resolve
            res.once('data', (chunk) => {
              data += chunk;
              // Destroy to stop the SSE stream
              res.destroy();
              resolve({
                statusCode: res.statusCode!,
                headers: res.headers,
                body: data,
              });
            });
            // Safety timeout in case no data arrives
            setTimeout(() => {
              res.destroy();
              resolve({
                statusCode: res.statusCode!,
                headers: res.headers,
                body: data,
              });
            }, 2000);
          }
        );
        req.on('error', () => {
          // Ignore ECONNRESET from destroy
        });
        req.end();
      });

      expect(result.statusCode).toBe(200);
      expect(result.headers['access-control-allow-origin']).toBe('*');
      expect(result.headers['content-type']).toContain('text/event-stream');
    });
  });

  describe('HTTP Stream Transport CORS', () => {
    let httpTransport: HttpStreamTransport;
    const httpPort = 19221;

    beforeAll(async () => {
      httpTransport = new HttpStreamTransport({
        port: httpPort,
        endpoint: '/mcp',
        cors: {
          allowOrigin: 'http://example.com',
          allowMethods: 'GET, POST, OPTIONS',
          allowHeaders: 'Content-Type, Authorization',
        },
      });
      await httpTransport.start();
    });

    afterAll(async () => {
      if (httpTransport.isRunning()) {
        await httpTransport.close();
      }
    });

    it('BC-004-E02: HTTP Stream OPTIONS with cors config returns 204 with CORS headers', async () => {
      const res = await makeOptionsRequest(httpPort, '/mcp');

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://example.com');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
    });
  });
});
