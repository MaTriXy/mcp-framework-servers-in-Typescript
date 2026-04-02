import { describe, it, expect } from '@jest/globals';
import {
  isV2Event,
  getSourceIp,
  lambdaEventToRequest,
  responseToLambdaResult,
} from '../../src/serverless/lambda-adapter.js';
import type {
  APIGatewayV1Event,
  APIGatewayV2Event,
} from '../../src/serverless/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeV2Event(overrides: Partial<APIGatewayV2Event> = {}): APIGatewayV2Event {
  return {
    version: '2.0',
    requestContext: {
      http: { method: 'POST', path: '/mcp', sourceIp: '10.0.0.1' },
    },
    headers: { 'content-type': 'application/json' },
    rawPath: '/mcp',
    rawQueryString: '',
    body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    isBase64Encoded: false,
    ...overrides,
  };
}

function makeV1Event(overrides: Partial<APIGatewayV1Event> = {}): APIGatewayV1Event {
  return {
    httpMethod: 'POST',
    path: '/mcp',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    isBase64Encoded: false,
    requestContext: { identity: { sourceIp: '192.168.1.1' } },
    ...overrides,
  };
}

// ── isV2Event ────────────────────────────────────────────────────────────

describe('isV2Event', () => {
  it('returns true for v2 event', () => {
    expect(isV2Event(makeV2Event())).toBe(true);
  });

  it('returns false for v1 event', () => {
    expect(isV2Event(makeV1Event())).toBe(false);
  });
});

// ── getSourceIp ──────────────────────────────────────────────────────────

describe('getSourceIp', () => {
  it('extracts from v2 event', () => {
    expect(getSourceIp(makeV2Event())).toBe('10.0.0.1');
  });

  it('extracts from v1 event', () => {
    expect(getSourceIp(makeV1Event())).toBe('192.168.1.1');
  });

  it('returns undefined when missing in v1', () => {
    expect(getSourceIp(makeV1Event({ requestContext: undefined }))).toBeUndefined();
  });
});

// ── lambdaEventToRequest ─────────────────────────────────────────────────

describe('lambdaEventToRequest', () => {
  describe('v2 events', () => {
    it('creates Request with correct method and path', () => {
      const req = lambdaEventToRequest(makeV2Event());
      expect(req.method).toBe('POST');
      expect(new URL(req.url).pathname).toBe('/mcp');
    });

    it('includes headers', () => {
      const req = lambdaEventToRequest(makeV2Event());
      expect(req.headers.get('content-type')).toBe('application/json');
    });

    it('includes JSON body', async () => {
      const req = lambdaEventToRequest(makeV2Event());
      const body = await req.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('initialize');
    });

    it('passes rawQueryString through', () => {
      const req = lambdaEventToRequest(makeV2Event({ rawQueryString: 'foo=bar&baz=1' }));
      const url = new URL(req.url);
      expect(url.searchParams.get('foo')).toBe('bar');
      expect(url.searchParams.get('baz')).toBe('1');
    });
  });

  describe('v1 events', () => {
    it('creates Request with correct method and path', () => {
      const req = lambdaEventToRequest(makeV1Event());
      expect(req.method).toBe('POST');
      expect(new URL(req.url).pathname).toBe('/mcp');
    });

    it('includes headers', () => {
      const req = lambdaEventToRequest(makeV1Event());
      expect(req.headers.get('content-type')).toBe('application/json');
    });

    it('decodes base64 body', async () => {
      const originalBody = JSON.stringify({ jsonrpc: '2.0', method: 'test', id: 1 });
      const req = lambdaEventToRequest(makeV1Event({
        body: Buffer.from(originalBody).toString('base64'),
        isBase64Encoded: true,
      }));
      const body = await req.json();
      expect(body.method).toBe('test');
    });

    it('handles multiValueHeaders', () => {
      const req = lambdaEventToRequest(makeV1Event({
        multiValueHeaders: {
          'x-custom': ['val1', 'val2'],
          'content-type': ['application/json'],
        },
      }));
      // multiValueHeaders with multiple values get appended
      expect(req.headers.get('x-custom')).toContain('val1');
      expect(req.headers.get('x-custom')).toContain('val2');
    });

    it('handles multiValueQueryStringParameters', () => {
      const req = lambdaEventToRequest(makeV1Event({
        multiValueQueryStringParameters: {
          key: ['a', 'b'],
          single: ['only'],
        },
      }));
      const url = new URL(req.url);
      expect(url.searchParams.getAll('key')).toEqual(['a', 'b']);
      expect(url.searchParams.get('single')).toBe('only');
    });

    it('falls back to queryStringParameters', () => {
      const req = lambdaEventToRequest(makeV1Event({
        queryStringParameters: { page: '2', limit: '10' },
      }));
      const url = new URL(req.url);
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('limit')).toBe('10');
    });
  });

  describe('common behavior', () => {
    it('does not set body on GET requests', () => {
      const req = lambdaEventToRequest(makeV2Event({
        requestContext: { http: { method: 'GET', path: '/mcp', sourceIp: '1.2.3.4' } },
        body: null,
      }));
      expect(req.method).toBe('GET');
      expect(req.body).toBeNull();
    });

    it('handles OPTIONS method', () => {
      const req = lambdaEventToRequest(makeV2Event({
        requestContext: { http: { method: 'OPTIONS', path: '/mcp', sourceIp: '1.2.3.4' } },
        body: null,
      }));
      expect(req.method).toBe('OPTIONS');
    });

    it('handles null body on POST', async () => {
      const req = lambdaEventToRequest(makeV2Event({ body: null }));
      const text = await req.text();
      expect(text).toBe('');
    });

    it('strips basePath prefix', () => {
      const req = lambdaEventToRequest(
        makeV2Event({ rawPath: '/prod/mcp' }),
        '/prod',
      );
      expect(new URL(req.url).pathname).toBe('/mcp');
    });

    it('strips basePath and preserves root', () => {
      const req = lambdaEventToRequest(
        makeV2Event({ rawPath: '/prod' }),
        '/prod',
      );
      expect(new URL(req.url).pathname).toBe('/');
    });

    it('handles empty headers', () => {
      const req = lambdaEventToRequest(makeV2Event({ headers: {} }));
      expect(req).toBeDefined();
    });
  });
});

// ── responseToLambdaResult ───────────────────────────────────────────────

describe('responseToLambdaResult', () => {
  it('converts Response to v2 result', async () => {
    const response = new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await responseToLambdaResult(response, makeV2Event());
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('{"ok":true}');
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.isBase64Encoded).toBe(false);
  });

  it('converts Response to v1 result with multiValueHeaders', async () => {
    const response = new Response('error', { status: 401 });
    const result = await responseToLambdaResult(response, makeV1Event());
    expect(result.statusCode).toBe(401);
    expect('multiValueHeaders' in result).toBe(true);
  });

  it('handles empty body', async () => {
    const response = new Response(null, { status: 200 });
    const result = await responseToLambdaResult(response, makeV2Event());
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
  });
});
