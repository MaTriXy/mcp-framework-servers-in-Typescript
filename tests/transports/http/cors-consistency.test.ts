import { describe, it, expect } from '@jest/globals';
import { DEFAULT_CORS_CONFIG } from '../../../src/transports/sse/types.js';

describe('CORS header consistency between transports', () => {
  it('DEFAULT_CORS_CONFIG should include all necessary headers', () => {
    expect(DEFAULT_CORS_CONFIG.allowHeaders).toContain('Content-Type');
    expect(DEFAULT_CORS_CONFIG.allowHeaders).toContain('Authorization');
    expect(DEFAULT_CORS_CONFIG.allowHeaders).toContain('Mcp-Session-Id');
    expect(DEFAULT_CORS_CONFIG.allowHeaders).toContain('Last-Event-ID');
    expect(DEFAULT_CORS_CONFIG.allowHeaders).toContain('x-api-key');
    expect(DEFAULT_CORS_CONFIG.allowHeaders).toContain('Accept');
  });

  it('DEFAULT_CORS_CONFIG should expose necessary headers', () => {
    expect(DEFAULT_CORS_CONFIG.exposeHeaders).toContain('Content-Type');
    expect(DEFAULT_CORS_CONFIG.exposeHeaders).toContain('Authorization');
    expect(DEFAULT_CORS_CONFIG.exposeHeaders).toContain('Mcp-Session-Id');
  });

  it('DEFAULT_CORS_CONFIG should allow DELETE method for session termination', () => {
    expect(DEFAULT_CORS_CONFIG.allowMethods).toContain('DELETE');
  });

  it('HTTP stream transport should use DEFAULT_CORS_CONFIG as fallback', async () => {
    const { readFileSync } = await import('fs');
    const httpSource = readFileSync('src/transports/http/server.ts', 'utf-8');

    // Should import DEFAULT_CORS_CONFIG
    expect(httpSource).toContain('DEFAULT_CORS_CONFIG');

    // Should NOT contain hardcoded restrictive headers
    expect(httpSource).not.toContain("'Content-Type, Authorization, Mcp-Session-Id'");
  });

  it('DEFAULT_CORS_CONFIG should have maxAge set', () => {
    expect(DEFAULT_CORS_CONFIG.maxAge).toBeDefined();
    expect(DEFAULT_CORS_CONFIG.maxAge).toBe('86400');
  });
});
