# TICKET-01: Origin Header Validation (DNS Rebinding Protection)

**Priority:** P0 — Critical (Security)
**Phase:** 1 — Security Hardening
**Depends on:** TICKET-00
**Estimated scope:** Medium
**Breaking change:** No (off by default)

---

## Summary

Implement Origin header validation on HTTP Stream and SSE transports to prevent DNS
rebinding attacks, as required by MCP spec 2025-11-25.

**Spec reference:** "Servers MUST validate the Origin header on all incoming connections.
If the Origin header is present and invalid, servers MUST respond with HTTP 403 Forbidden."

---

## Checklist

### Implementation
- [ ] Add `allowedOrigins?: string[]` to `CORSConfig` in `src/transports/sse/types.ts`
- [ ] Create `src/transports/utils/origin-validator.ts` with shared validation logic
- [ ] `validateOrigin(req, allowedOrigins)` → returns `true` (allow) or `false` (reject)
- [ ] Handle: present + valid → allow
- [ ] Handle: present + invalid → reject with 403
- [ ] Handle: absent → allow (non-browser clients)
- [ ] Handle: `Origin: null` → reject when allowedOrigins is configured
- [ ] Integrate into `src/transports/http/server.ts` — check BEFORE auth, BEFORE body parse
- [ ] Integrate into `src/transports/sse/server.ts` — check on both GET /sse and POST /messages
- [ ] Return 403 with JSON-RPC error body: `{"jsonrpc":"2.0","error":{"code":-32600,"message":"Forbidden: invalid origin"}}`
- [ ] When `allowedOrigins` configured, set `Access-Control-Allow-Origin` to the matched
      origin (not `*`)
- [ ] When `allowedOrigins` NOT configured (default), keep current `*` behavior
- [ ] Log a warning on first non-localhost origin when no allowedOrigins configured

### Configuration Interface
```typescript
interface CORSConfig {
  allowOrigin?: string;          // existing (for backwards compat)
  allowedOrigins?: string[];     // NEW — takes precedence over allowOrigin
  allowMethods?: string;
  allowHeaders?: string;
  exposeHeaders?: string;
  maxAge?: string;
}
```

### Unit Tests (`tests/transports/origin-validation.test.ts`)
- [ ] `validateOrigin` with matching origin → true
- [ ] `validateOrigin` with non-matching origin → false
- [ ] `validateOrigin` with no Origin header → true (absent = allow)
- [ ] `validateOrigin` with `Origin: null` and allowedOrigins set → false
- [ ] `validateOrigin` with `Origin: null` and no allowedOrigins → true
- [ ] Port-specific matching: `http://localhost:3000` ≠ `http://localhost:8080`
- [ ] Scheme-specific matching: `http://localhost` ≠ `https://localhost`
- [ ] Case-insensitive host comparison: `http://LocalHost` = `http://localhost`
- [ ] Multiple allowed origins → any match = allow
- [ ] Empty allowedOrigins array → reject all (treat as misconfiguration? or allow all?)

### Integration Tests (`tests/transports/http/origin-integration.test.ts`)
- [ ] HTTP stream: POST with valid Origin → 200
- [ ] HTTP stream: POST with invalid Origin → 403 before auth check
- [ ] HTTP stream: OPTIONS preflight with invalid Origin → 403
- [ ] HTTP stream: POST with no Origin → 200
- [ ] SSE: GET /sse with invalid Origin → 403
- [ ] SSE: POST /messages with invalid Origin → 403
- [ ] Default config (no allowedOrigins) → all requests pass

### Acceptance Tests
- [ ] Start server with `allowedOrigins: ['http://localhost:3000']`
- [ ] curl with `-H "Origin: http://localhost:3000"` → succeeds
- [ ] curl with `-H "Origin: http://evil.com"` → 403
- [ ] curl without Origin header → succeeds
- [ ] Existing tests still pass without allowedOrigins configured

---

## Edge Cases & Gotchas

1. **OPTIONS preflight**: Browser sends OPTIONS before actual request. Origin validation
   must run on OPTIONS too, not just POST/GET.

2. **Origin: null**: Sent by sandboxed iframes, privacy modes, cross-origin redirects.
   When `allowedOrigins` is configured, this MUST be rejected (it's a common attack
   vector). When NOT configured, allow through for backwards compat.

3. **Port in Origin**: `http://localhost` (no port) and `http://localhost:80` are
   semantically identical but string-different. Normalize: strip default port (80 for
   http, 443 for https) before comparison.

4. **Wildcard in allowedOrigins**: Should we support `*.example.com`? The spec doesn't
   mention wildcards. Recommendation: don't support wildcards initially. Users can add
   specific origins. Prevents accidental over-permissive configs.

5. **Order of operations**: Origin validation MUST happen before authentication. An
   attacker from an invalid origin shouldn't even trigger auth logic.

6. **CORS header interaction**: When `allowedOrigins` is configured:
   - `Access-Control-Allow-Origin` should be the specific matched origin, not `*`
   - Add `Vary: Origin` header so proxies don't cache wrong CORS response

7. **IPv6 origins**: `http://[::1]:3000` is valid. Ensure URL parsing handles it.

---

## Acceptance Criteria

- [ ] Invalid Origin → 403 Forbidden (with JSON-RPC error body)
- [ ] Missing Origin → request proceeds (non-browser client)
- [ ] Default config → current behavior preserved (all origins allowed)
- [ ] All existing transport tests pass
- [ ] Origin check happens before auth check in request pipeline
