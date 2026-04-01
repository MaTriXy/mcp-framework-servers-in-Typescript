import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { IncomingMessage, ServerResponse } from 'http';
import { validateOrigin, getValidatedCorsOrigin, OriginValidationConfig } from '../../src/transports/utils/origin-validator.js';

function createMockReq(origin?: string | null): IncomingMessage {
  const headers: Record<string, string> = {};
  if (origin !== undefined && origin !== null) {
    headers['origin'] = origin;
  }
  return { headers } as unknown as IncomingMessage;
}

function createMockRes(): ServerResponse & { _statusCode: number; _body: string; _headers: Record<string, string> } {
  const res = {
    _statusCode: 0,
    _body: '',
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res._statusCode = status;
      if (headers) {
        Object.assign(res._headers, headers);
      }
      return res;
    },
    end(body?: string) {
      if (body) {
        res._body = body;
      }
      return res;
    },
  } as any;
  return res;
}

describe('validateOrigin', () => {
  it('should allow request with matching origin', () => {
    const req = createMockReq('http://localhost:3000');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should reject request with non-matching origin and send 403', () => {
    const req = createMockReq('http://evil.com');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(false);
    expect(res._statusCode).toBe(403);
    const body = JSON.parse(res._body);
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toContain('evil.com');
  });

  it('should allow request with no Origin header (non-browser client)', () => {
    const req = createMockReq();
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should reject Origin: null when allowedOrigins is configured', () => {
    const req = createMockReq('null');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(false);
    expect(res._statusCode).toBe(403);
  });

  it('should allow all origins when allowedOrigins is not configured', () => {
    const req = createMockReq('http://anything.example.com');
    const res = createMockRes();
    const config: OriginValidationConfig = {};

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should allow all origins when allowedOrigins is empty array', () => {
    const req = createMockReq('http://anything.example.com');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: [],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should distinguish different ports (localhost:3000 != localhost:8080)', () => {
    const req = createMockReq('http://localhost:8080');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(false);
    expect(res._statusCode).toBe(403);
  });

  it('should perform case-insensitive host comparison', () => {
    const req = createMockReq('http://LOCALHOST:3000');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should strip default port for http (port 80)', () => {
    const req = createMockReq('http://localhost:80');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should strip default port for https (port 443)', () => {
    const req = createMockReq('https://example.com:443');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['https://example.com'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should match when allowed origin has default port and request does not', () => {
    const req = createMockReq('http://localhost');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:80'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });

  it('should allow when one of multiple allowed origins matches', () => {
    const req = createMockReq('http://app.example.com');
    const res = createMockRes();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000', 'http://app.example.com', 'https://prod.example.com'],
    };

    const result = validateOrigin(req, res, config);

    expect(result).toBe(true);
  });
});

describe('getValidatedCorsOrigin', () => {
  it('should return * when no allowedOrigins configured', () => {
    const req = createMockReq('http://anything.example.com');
    const config: OriginValidationConfig = {};

    const result = getValidatedCorsOrigin(req, config);

    expect(result).toBe('*');
  });

  it('should return * when allowedOrigins is empty', () => {
    const req = createMockReq('http://anything.example.com');
    const config: OriginValidationConfig = {
      allowedOrigins: [],
    };

    const result = getValidatedCorsOrigin(req, config);

    expect(result).toBe('*');
  });

  it('should return the request origin when allowedOrigins is configured and origin is present', () => {
    const req = createMockReq('http://localhost:3000');
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = getValidatedCorsOrigin(req, config);

    expect(result).toBe('http://localhost:3000');
  });

  it('should return first allowed origin when request has no Origin header', () => {
    const req = createMockReq();
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000', 'http://example.com'],
    };

    const result = getValidatedCorsOrigin(req, config);

    expect(result).toBe('http://localhost:3000');
  });

  it('should return first allowed origin when Origin is null', () => {
    const req = createMockReq('null');
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };

    const result = getValidatedCorsOrigin(req, config);

    expect(result).toBe('http://localhost:3000');
  });
});
