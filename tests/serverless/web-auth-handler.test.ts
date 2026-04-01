import { describe, it, expect } from '@jest/globals';
import {
  createIncomingMessageShim,
  authenticateWebRequest,
} from '../../src/serverless/web-auth-handler.js';
import { APIKeyAuthProvider } from '../../src/auth/providers/apikey.js';
import { JWTAuthProvider } from '../../src/auth/providers/jwt.js';
import type { AuthProvider, AuthResult } from '../../src/auth/types.js';

// ── createIncomingMessageShim ────────────────────────────────────────────

describe('createIncomingMessageShim', () => {
  it('copies headers with lowercase keys', () => {
    const request = new Request('https://example.com/mcp', {
      headers: { 'Authorization': 'Bearer abc', 'X-Custom': 'val' },
    });
    const shim = createIncomingMessageShim(request);
    expect(shim.headers['authorization']).toBe('Bearer abc');
    expect(shim.headers['x-custom']).toBe('val');
  });

  it('sets url from request pathname + search', () => {
    const request = new Request('https://example.com/mcp?foo=bar');
    const shim = createIncomingMessageShim(request);
    expect(shim.url).toBe('/mcp?foo=bar');
  });

  it('sets method from request', () => {
    const request = new Request('https://example.com/mcp', { method: 'POST' });
    const shim = createIncomingMessageShim(request);
    expect(shim.method).toBe('POST');
  });

  it('sets remoteAddress from sourceIp', () => {
    const request = new Request('https://example.com/mcp');
    const shim = createIncomingMessageShim(request, '10.0.0.5');
    expect(shim.socket.remoteAddress).toBe('10.0.0.5');
  });

  it('defaults remoteAddress to 0.0.0.0', () => {
    const request = new Request('https://example.com/mcp');
    const shim = createIncomingMessageShim(request);
    expect(shim.socket.remoteAddress).toBe('0.0.0.0');
  });
});

// ── authenticateWebRequest ───────────────────────────────────────────────

describe('authenticateWebRequest', () => {
  it('returns success with empty data when no auth configured', async () => {
    const request = new Request('https://example.com/mcp');
    const result = await authenticateWebRequest(request, undefined, 'test');
    expect('result' in result).toBe(true);
    if ('result' in result) {
      expect(result.result.data).toEqual({});
    }
  });

  describe('API Key auth', () => {
    const provider = new APIKeyAuthProvider({ keys: ['valid-key'] });
    const authConfig = { provider };

    it('returns success for valid key', async () => {
      const request = new Request('https://example.com/mcp', {
        headers: { 'X-API-Key': 'valid-key' },
      });
      const result = await authenticateWebRequest(request, authConfig, 'test');
      expect('result' in result).toBe(true);
    });

    it('returns 401 response for missing key', async () => {
      const request = new Request('https://example.com/mcp');
      const result = await authenticateWebRequest(request, authConfig, 'test');
      expect('response' in result).toBe(true);
      if ('response' in result) {
        expect(result.response.status).toBe(401);
        expect(result.response.headers.get('www-authenticate')).toContain('ApiKey');
      }
    });

    it('returns 401 response for wrong key', async () => {
      const request = new Request('https://example.com/mcp', {
        headers: { 'X-API-Key': 'wrong-key' },
      });
      const result = await authenticateWebRequest(request, authConfig, 'test');
      expect('response' in result).toBe(true);
      if ('response' in result) {
        expect(result.response.status).toBe(401);
      }
    });

    it('propagates sourceIp to shim', async () => {
      const request = new Request('https://example.com/mcp', {
        headers: { 'X-API-Key': 'valid-key' },
      });
      // Should not throw — sourceIp is used for logging
      const result = await authenticateWebRequest(request, authConfig, 'test', '10.0.0.1');
      expect('result' in result).toBe(true);
    });
  });

  describe('JWT auth', () => {
    const provider = new JWTAuthProvider({ secret: 'test-secret' });
    const authConfig = { provider };

    it('returns 401 for invalid token', async () => {
      const request = new Request('https://example.com/mcp', {
        headers: { 'Authorization': 'Bearer invalid.token.here' },
      });
      const result = await authenticateWebRequest(request, authConfig, 'test');
      expect('response' in result).toBe(true);
      if ('response' in result) {
        expect(result.response.status).toBe(401);
      }
    });

    it('returns 401 for missing auth header', async () => {
      const request = new Request('https://example.com/mcp');
      const result = await authenticateWebRequest(request, authConfig, 'test');
      expect('response' in result).toBe(true);
      if ('response' in result) {
        expect(result.response.status).toBe(401);
      }
    });
  });

  describe('custom provider', () => {
    it('handles provider returning true', async () => {
      const customProvider: AuthProvider = {
        authenticate: async () => true,
      };
      const request = new Request('https://example.com/mcp');
      const result = await authenticateWebRequest(request, { provider: customProvider }, 'test');
      expect('result' in result).toBe(true);
      if ('result' in result) {
        expect(result.result.data).toEqual({});
      }
    });

    it('handles provider returning AuthResult', async () => {
      const customProvider: AuthProvider = {
        authenticate: async () => ({ data: { userId: '42' } }),
      };
      const request = new Request('https://example.com/mcp');
      const result = await authenticateWebRequest(request, { provider: customProvider }, 'test');
      expect('result' in result).toBe(true);
      if ('result' in result) {
        expect(result.result.data).toEqual({ userId: '42' });
      }
    });

    it('handles provider returning false with custom error', async () => {
      const customProvider: AuthProvider = {
        authenticate: async () => false,
        getAuthError: () => ({ status: 403, message: 'Forbidden' }),
      };
      const request = new Request('https://example.com/mcp');
      const result = await authenticateWebRequest(request, { provider: customProvider }, 'test');
      expect('response' in result).toBe(true);
      if ('response' in result) {
        expect(result.response.status).toBe(403);
        const body = await result.response.json();
        expect(body.error).toBe('Forbidden');
      }
    });
  });
});
