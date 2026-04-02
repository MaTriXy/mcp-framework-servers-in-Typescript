/**
 * BC-018: Auth system backwards compatibility tests
 *
 * Captures existing behavior of authentication providers and the
 * handleAuthentication utility before the serverless refactor. Verifies:
 * - AuthProvider interface contract
 * - APIKeyAuthProvider behavior
 * - JWTAuthProvider behavior
 * - handleAuthentication utility (shared by SSE and HTTP transports)
 * - Auth types and error shapes
 * - requestContext integration with auth
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { APIKeyAuthProvider } from '../../src/auth/providers/apikey.js';
import { JWTAuthProvider } from '../../src/auth/providers/jwt.js';
import { OAuthAuthProvider } from '../../src/auth/providers/oauth.js';
import { handleAuthentication } from '../../src/transports/utils/auth-handler.js';
import { DEFAULT_AUTH_ERROR } from '../../src/auth/types.js';
import type { AuthProvider, AuthConfig, AuthResult } from '../../src/auth/types.js';
import { getRequestHeader } from '../../src/utils/headers.js';
import { MockAuthServer } from '../fixtures/mock-auth-server.js';
import { requestContext, getRequestContext, runInRequestContext } from '../../src/utils/requestContext.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function createMockReq(headers: Record<string, string> = {}, url?: string): IncomingMessage {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1', writable: false });
  const msg = new IncomingMessage(socket);
  msg.headers = {};
  for (const [k, v] of Object.entries(headers)) {
    msg.headers[k.toLowerCase()] = v;
  }
  if (url) msg.url = url;
  return msg;
}

function createMockRes(): ServerResponse & { _statusCode?: number; _headers: Record<string, string>; _body: string; _ended: boolean } {
  const res = {
    _statusCode: undefined as number | undefined,
    _headers: {} as Record<string, string>,
    _body: '',
    _ended: false,
    headersSent: false,
    setHeader(key: string, value: string) {
      res._headers[key.toLowerCase()] = value;
      return res;
    },
    writeHead(status: number) {
      res._statusCode = status;
      res.headersSent = true;
      return res;
    },
    end(body?: string) {
      if (body) res._body = body;
      res._ended = true;
      return res;
    },
  } as any;
  return res;
}

// ── DEFAULT_AUTH_ERROR ────────────────────────────────────────────────────

describe('BC-018: Auth types backward compatibility', () => {
  it('BC-018-AT01: DEFAULT_AUTH_ERROR has status 401 and message "Unauthorized"', () => {
    expect(DEFAULT_AUTH_ERROR.status).toBe(401);
    expect(DEFAULT_AUTH_ERROR.message).toBe('Unauthorized');
  });

  it('BC-018-AT02: AuthProvider interface requires authenticate method', () => {
    // Compile-time check: implementing the interface
    const provider: AuthProvider = {
      authenticate: async (_req: IncomingMessage) => true,
    };
    expect(typeof provider.authenticate).toBe('function');
  });

  it('BC-018-AT03: AuthProvider.getAuthError is optional', () => {
    const provider: AuthProvider = {
      authenticate: async () => false,
      // getAuthError is not required
    };
    expect(provider.getAuthError).toBeUndefined();
  });

  it('BC-018-AT04: AuthResult shape has optional data field', () => {
    const result1: AuthResult = {};
    const result2: AuthResult = { data: { userId: '123' } };
    expect(result1.data).toBeUndefined();
    expect(result2.data!.userId).toBe('123');
  });

  it('BC-018-AT05: AuthConfig shape has provider and optional endpoints', () => {
    const provider: AuthProvider = {
      authenticate: async () => true,
    };
    const config1: AuthConfig = { provider };
    const config2: AuthConfig = {
      provider,
      endpoints: { sse: true, messages: false, oauth: false },
    };
    expect(config1.provider).toBe(provider);
    expect(config2.endpoints!.sse).toBe(true);
  });
});

// ── APIKeyAuthProvider ───────────────────────────────────────────────────

describe('BC-018: APIKeyAuthProvider backward compatibility', () => {
  it('BC-018-AK01: constructs with single key', () => {
    const provider = new APIKeyAuthProvider({ keys: ['key1'] });
    expect(provider.getKeyCount()).toBe(1);
    expect(provider.getHeaderName()).toBe('X-API-Key');
  });

  it('BC-018-AK02: constructs with multiple keys', () => {
    const provider = new APIKeyAuthProvider({ keys: ['k1', 'k2', 'k3'] });
    expect(provider.getKeyCount()).toBe(3);
  });

  it('BC-018-AK03: constructs with custom header name', () => {
    const provider = new APIKeyAuthProvider({
      keys: ['k1'],
      headerName: 'Authorization',
    });
    expect(provider.getHeaderName()).toBe('Authorization');
  });

  it('BC-018-AK04: throws when constructed with empty keys', () => {
    expect(() => new APIKeyAuthProvider({ keys: [] })).toThrow(/at least one/i);
  });

  it('BC-018-AK05: authenticate returns true for valid key', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });
    const req = createMockReq({ 'X-API-Key': 'valid-key' });
    const result = await provider.authenticate(req);
    expect(result).toBe(true);
  });

  it('BC-018-AK06: authenticate returns false for invalid key', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });
    const req = createMockReq({ 'X-API-Key': 'wrong-key' });
    const result = await provider.authenticate(req);
    expect(result).toBe(false);
  });

  it('BC-018-AK07: authenticate returns false for missing header', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });
    const req = createMockReq({});
    const result = await provider.authenticate(req);
    expect(result).toBe(false);
  });

  it('BC-018-AK08: authenticate is case-insensitive for header name', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });

    // Lowercase header (HTTP/2 style)
    const req = createMockReq({ 'x-api-key': 'valid-key' });
    const result = await provider.authenticate(req);
    expect(result).toBe(true);
  });

  it('BC-018-AK09: getAuthError returns correct shape', () => {
    const provider = new APIKeyAuthProvider({ keys: ['k'] });
    const error = provider.getAuthError();
    expect(error.status).toBe(401);
    expect(typeof error.message).toBe('string');
  });

  it('BC-018-AK10: authenticate accepts any of multiple valid keys', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['key-a', 'key-b', 'key-c'] });

    const req1 = createMockReq({ 'X-API-Key': 'key-a' });
    expect(await provider.authenticate(req1)).toBe(true);

    const req2 = createMockReq({ 'X-API-Key': 'key-b' });
    expect(await provider.authenticate(req2)).toBe(true);

    const req3 = createMockReq({ 'X-API-Key': 'key-c' });
    expect(await provider.authenticate(req3)).toBe(true);
  });
});

// ── JWTAuthProvider ──────────────────────────────────────────────────────

describe('BC-018: JWTAuthProvider backward compatibility', () => {
  it('BC-018-JW01: constructs with minimal config', () => {
    const provider = new JWTAuthProvider({ secret: 'my-secret' });
    expect(provider).toBeDefined();
  });

  it('BC-018-JW02: authenticate returns false for missing Authorization header', async () => {
    const provider = new JWTAuthProvider({ secret: 'my-secret' });
    const req = createMockReq({});
    const result = await provider.authenticate(req);
    expect(result).toBe(false);
  });

  it('BC-018-JW03: authenticate returns false for invalid token', async () => {
    const provider = new JWTAuthProvider({ secret: 'my-secret' });
    const req = createMockReq({ Authorization: 'Bearer invalid.token.here' });
    const result = await provider.authenticate(req);
    expect(result).toBe(false);
  });

  it('BC-018-JW04: getAuthError returns 401', () => {
    const provider = new JWTAuthProvider({ secret: 'my-secret' });
    const error = provider.getAuthError!();
    expect(error.status).toBe(401);
  });
});

// ── handleAuthentication utility ─────────────────────────────────────────

describe('BC-018: handleAuthentication backward compatibility', () => {
  it('BC-018-HA01: returns { data: {} } when no auth config', async () => {
    const req = createMockReq({});
    const res = createMockRes();
    const result = await handleAuthentication(req, res, undefined, 'test');
    expect(result).toEqual({ data: {} });
    expect(res._ended).toBe(false);
  });

  it('BC-018-HA02: returns { data: {} } when auth config has no provider', async () => {
    const req = createMockReq({});
    const res = createMockRes();
    const result = await handleAuthentication(req, res, {} as any, 'test');
    expect(result).toEqual({ data: {} });
  });

  it('BC-018-HA03: returns null and writes 401 for API key auth failure (missing key)', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });
    const authConfig: AuthConfig = { provider };
    const req = createMockReq({});
    const res = createMockRes();

    const result = await handleAuthentication(req, res, authConfig, 'test');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(401);
    expect(res._ended).toBe(true);
    expect(res._headers['www-authenticate']).toBeDefined();
    expect(res._headers['www-authenticate']).toContain('ApiKey');
  });

  it('BC-018-HA04: returns null and writes 401 for API key auth failure (wrong key)', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });
    const authConfig: AuthConfig = { provider };
    const req = createMockReq({ 'X-API-Key': 'wrong-key' });
    const res = createMockRes();

    const result = await handleAuthentication(req, res, authConfig, 'test');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(401);
  });

  it('BC-018-HA05: returns { data: {} } for API key auth success', async () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });
    const authConfig: AuthConfig = { provider };
    const req = createMockReq({ 'X-API-Key': 'valid-key' });
    const res = createMockRes();

    const result = await handleAuthentication(req, res, authConfig, 'test');
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.data).toBeDefined();
    expect(res._ended).toBe(false); // Response should NOT be ended on success
  });

  it('BC-018-HA06: returns null and writes 401 for JWT auth failure', async () => {
    const provider = new JWTAuthProvider({ secret: 'my-secret' });
    const authConfig: AuthConfig = { provider };
    const req = createMockReq({ Authorization: 'Bearer bad-token' });
    const res = createMockRes();

    const result = await handleAuthentication(req, res, authConfig, 'test');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(401);
    expect(res._ended).toBe(true);
  });

  it('BC-018-HA07: handles custom AuthProvider that returns boolean true', async () => {
    const customProvider: AuthProvider = {
      authenticate: async () => true,
    };
    const authConfig: AuthConfig = { provider: customProvider };
    const req = createMockReq({});
    const res = createMockRes();

    const result = await handleAuthentication(req, res, authConfig, 'test');
    expect(result).toEqual({ data: {} });
  });

  it('BC-018-HA08: handles custom AuthProvider that returns AuthResult', async () => {
    const customProvider: AuthProvider = {
      authenticate: async () => ({ data: { userId: 'user-42', role: 'admin' } }),
    };
    const authConfig: AuthConfig = { provider: customProvider };
    const req = createMockReq({});
    const res = createMockRes();

    const result = await handleAuthentication(req, res, authConfig, 'test');
    expect(result).toBeDefined();
    expect(result!.data).toEqual({ userId: 'user-42', role: 'admin' });
  });

  it('BC-018-HA09: handles custom AuthProvider that returns false', async () => {
    const customProvider: AuthProvider = {
      authenticate: async () => false,
      getAuthError: () => ({ status: 403, message: 'Forbidden' }),
    };
    const authConfig: AuthConfig = { provider: customProvider };
    const req = createMockReq({});
    const res = createMockRes();

    const result = await handleAuthentication(req, res, authConfig, 'test');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(403);
    expect(res._body).toContain('Forbidden');
  });
});

// ── getRequestHeader utility ─────────────────────────────────────────────

describe('BC-018: getRequestHeader backward compatibility', () => {
  it('BC-018-GH01: finds header case-insensitively', () => {
    const headers = { 'X-API-Key': 'val1', 'content-type': 'application/json' };
    expect(getRequestHeader(headers, 'x-api-key')).toBe('val1');
    expect(getRequestHeader(headers, 'X-API-KEY')).toBe('val1');
    expect(getRequestHeader(headers, 'Content-Type')).toBe('application/json');
  });

  it('BC-018-GH02: returns undefined for missing header', () => {
    const headers = { 'X-API-Key': 'val' };
    expect(getRequestHeader(headers, 'Authorization')).toBeUndefined();
  });

  it('BC-018-GH03: returns undefined for empty headers', () => {
    expect(getRequestHeader({}, 'X-API-Key')).toBeUndefined();
  });
});

// ── requestContext integration ────────────────────────────────────────────

describe('BC-018: requestContext auth integration backward compatibility', () => {
  it('BC-018-RC01: auth data flows through requestContext.run()', () => {
    const authData = { token: 'bearer-token-123', user: { id: 'u1' } };

    requestContext.run(authData, () => {
      const ctx = getRequestContext();
      expect(ctx).toBeDefined();
      expect(ctx!.token).toBe('bearer-token-123');
      expect(ctx!.user).toEqual({ id: 'u1' });
    });

    // Outside context
    expect(getRequestContext()).toBeUndefined();
  });

  it('BC-018-RC02: runInRequestContext works for auth data', () => {
    const authData = { token: 'test-tok' };
    let captured: any;

    runInRequestContext(authData, () => {
      captured = getRequestContext();
    });

    expect(captured).toBeDefined();
    expect(captured.token).toBe('test-tok');
  });

  it('BC-018-RC03: async operations preserve context', async () => {
    const authData = { token: 'async-token', user: { name: 'async-user' } };

    await new Promise<void>((resolve) => {
      requestContext.run(authData, async () => {
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        const ctx = getRequestContext();
        expect(ctx!.token).toBe('async-token');
        resolve();
      });
    });
  });
});

// ── OAuthAuthProvider backward compatibility ──────────────────────────────

describe('BC-018: OAuthAuthProvider backward compatibility', () => {
  let mockAuthServer: MockAuthServer;
  const mockPort = 9190 + Math.floor(Math.random() * 10);

  beforeAll(async () => {
    mockAuthServer = new MockAuthServer({ port: mockPort });
    await mockAuthServer.start();
  });

  afterAll(async () => {
    await mockAuthServer.stop();
  });

  it('BC-018-OA01: constructs with JWT validation config', () => {
    const provider = new OAuthAuthProvider({
      authorizationServers: [mockAuthServer.getIssuer()],
      resource: mockAuthServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockAuthServer.getJWKSUri(),
        audience: mockAuthServer.getAudience(),
        issuer: mockAuthServer.getIssuer(),
      },
    });
    expect(provider).toBeDefined();
    expect(provider.getAuthorizationServers()).toContain(mockAuthServer.getIssuer());
    expect(provider.getResource()).toBe(mockAuthServer.getAudience());
  });

  it('BC-018-OA02: authenticate returns AuthResult for valid token', async () => {
    const provider = new OAuthAuthProvider({
      authorizationServers: [mockAuthServer.getIssuer()],
      resource: mockAuthServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockAuthServer.getJWKSUri(),
        audience: mockAuthServer.getAudience(),
        issuer: mockAuthServer.getIssuer(),
      },
    });

    const validToken = mockAuthServer.generateToken();
    const req = createMockReq({ authorization: `Bearer ${validToken}` });
    const result = await provider.authenticate(req);

    expect(result).toBeDefined();
    expect(result).not.toBe(false);
    // OAuthAuthProvider returns AuthResult with decoded claims
    if (typeof result === 'object' && result !== null) {
      expect((result as AuthResult).data).toBeDefined();
    }
  });

  it('BC-018-OA03: authenticate returns false for expired token', async () => {
    const provider = new OAuthAuthProvider({
      authorizationServers: [mockAuthServer.getIssuer()],
      resource: mockAuthServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockAuthServer.getJWKSUri(),
        audience: mockAuthServer.getAudience(),
        issuer: mockAuthServer.getIssuer(),
      },
    });

    const expiredToken = mockAuthServer.generateExpiredToken();
    const req = createMockReq({ authorization: `Bearer ${expiredToken}` });
    const result = await provider.authenticate(req);
    expect(result).toBe(false);
  });

  it('BC-018-OA04: authenticate returns false for missing Authorization header', async () => {
    const provider = new OAuthAuthProvider({
      authorizationServers: [mockAuthServer.getIssuer()],
      resource: mockAuthServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockAuthServer.getJWKSUri(),
        audience: mockAuthServer.getAudience(),
        issuer: mockAuthServer.getIssuer(),
      },
    });

    const req = createMockReq({});
    const result = await provider.authenticate(req);
    expect(result).toBe(false);
  });

  it('BC-018-OA05: getWWWAuthenticateHeader returns proper Bearer challenge', () => {
    const provider = new OAuthAuthProvider({
      authorizationServers: ['https://auth.example.com'],
      resource: 'https://mcp.example.com',
      validation: {
        type: 'jwt',
        jwksUri: 'https://auth.example.com/.well-known/jwks.json',
        audience: 'https://mcp.example.com',
        issuer: 'https://auth.example.com',
      },
    });

    const header = provider.getWWWAuthenticateHeader('invalid_token', 'Token expired');
    expect(header).toContain('Bearer');
    expect(header).toContain('realm="MCP Server"');
    expect(header).toContain('resource="https://mcp.example.com"');
    expect(header).toContain('error="invalid_token"');
    expect(header).toContain('error_description="Token expired"');
  });
});
