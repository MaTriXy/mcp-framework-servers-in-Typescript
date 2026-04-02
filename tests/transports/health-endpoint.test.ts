import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'node:http';
import { HttpStreamTransport } from '../../src/transports/http/server.js';
import { SSEServerTransport } from '../../src/transports/sse/server.js';

function getPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

describe('Health endpoint – HttpStreamTransport', () => {
  let transport: HttpStreamTransport;

  afterEach(async () => {
    if (transport?.isRunning()) await transport.close();
  });

  it('serves /health by default with { ok: true }', async () => {
    const port = getPort();
    transport = new HttpStreamTransport({ port });
    await transport.start();

    const res = await httpGet(port, '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('serves a custom path when configured', async () => {
    const port = getPort();
    transport = new HttpStreamTransport({
      port,
      health: { path: '/healthz' },
    });
    await transport.start();

    const res = await httpGet(port, '/healthz');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    // Default /health should 404
    const notFound = await httpGet(port, '/health');
    expect(notFound.status).toBe(404);
  });

  it('serves a custom response body when configured', async () => {
    const port = getPort();
    const customResponse = { success: true, data: 'ok' };
    transport = new HttpStreamTransport({
      port,
      health: { path: '/healthz', response: customResponse },
    });
    await transport.start();

    const res = await httpGet(port, '/healthz');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual(customResponse);
  });

  it('disables health endpoint when enabled is false', async () => {
    const port = getPort();
    transport = new HttpStreamTransport({
      port,
      health: { enabled: false },
    });
    await transport.start();

    const res = await httpGet(port, '/health');
    expect(res.status).toBe(404);
  });

  it('does not respond to POST on health path', async () => {
    const port = getPort();
    transport = new HttpStreamTransport({ port });
    await transport.start();

    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/health', method: 'POST' },
        (res) => resolve({ status: res.statusCode! }),
      );
      req.on('error', reject);
      req.end();
    });

    // POST to /health should not match the health route
    expect(res.status).not.toBe(200);
  });
});

describe('Health endpoint – SSEServerTransport', () => {
  let transport: SSEServerTransport;

  afterEach(async () => {
    if (transport?.isRunning()) await transport.close();
  });

  it('serves /health by default with { ok: true }', async () => {
    const port = getPort();
    transport = new SSEServerTransport({ port });
    await transport.start();

    const res = await httpGet(port, '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('serves a custom path when configured', async () => {
    const port = getPort();
    transport = new SSEServerTransport({
      port,
      health: { path: '/healthz' },
    });
    await transport.start();

    const res = await httpGet(port, '/healthz');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const notFound = await httpGet(port, '/health');
    expect(notFound.status).toBe(404);
  });

  it('serves a custom response body when configured', async () => {
    const port = getPort();
    const customResponse = { success: true, data: 'ok' };
    transport = new SSEServerTransport({
      port,
      health: { path: '/healthz', response: customResponse },
    });
    await transport.start();

    const res = await httpGet(port, '/healthz');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual(customResponse);
  });

  it('disables health endpoint when enabled is false', async () => {
    const port = getPort();
    transport = new SSEServerTransport({
      port,
      health: { enabled: false },
    });
    await transport.start();

    const res = await httpGet(port, '/health');
    expect(res.status).toBe(404);
  });
});
