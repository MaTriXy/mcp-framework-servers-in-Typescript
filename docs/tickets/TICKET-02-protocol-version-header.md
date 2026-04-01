# TICKET-02: MCP-Protocol-Version Header Support

**Priority:** P0 — Critical (Spec compliance)
**Phase:** 1 — Security Hardening
**Depends on:** TICKET-00
**Estimated scope:** Small-Medium
**Breaking change:** No

---

## Summary

Support the `MCP-Protocol-Version` HTTP header per MCP spec 2025-11-25. Clients MUST
include this header on all HTTP requests after initialization. Servers MUST return 400
for invalid or unsupported versions.

---

## Checklist

### Pre-work
- [ ] Check if SDK 1.29.0's `StreamableHTTPServerTransport` already handles this header
- [ ] If SDK handles it → this ticket is a verification-only task
- [ ] If SDK doesn't handle it → implement below

### Implementation (if SDK doesn't handle it)
- [ ] In `src/transports/http/server.ts`, read `MCP-Protocol-Version` header from requests
- [ ] Skip validation on InitializeRequest (no prior negotiation)
- [ ] For existing sessions: compare header value against session's negotiated version
- [ ] Missing header → default to `2025-03-26` (per spec backwards compat)
- [ ] Mismatched header → return HTTP 400 Bad Request with JSON-RPC error
- [ ] Store negotiated version per-session in transport state
- [ ] Apply same logic in `src/transports/sse/server.ts`

### Unit Tests (`tests/transports/protocol-version-header.test.ts`)
- [ ] POST with correct `MCP-Protocol-Version` header → normal processing
- [ ] POST with incorrect version → 400 Bad Request
- [ ] POST with missing header → defaults to `2025-03-26`, accepted
- [ ] Initialize request → header not validated (no negotiated version yet)
- [ ] POST after initialize with negotiated version → accepted
- [ ] POST after initialize with different version → 400
- [ ] Two concurrent sessions with different versions → independently validated

### Acceptance Tests
- [ ] Full handshake with header included → works
- [ ] Post-handshake request with wrong version → 400
- [ ] Existing clients without header → still work (backward compat)

---

## Edge Cases & Gotchas

1. **SDK may already do this**: `StreamableHTTPServerTransport` in SDK 1.29.0 may
   validate this header natively. Check the SDK source before implementing.

2. **Session-scoped validation**: The negotiated version belongs to a specific session.
   In the HTTP stream transport, each session has its own `StreamableHTTPServerTransport`
   instance. The header validation should be per-session.

3. **SSE transport**: The SSE transport is deprecated but still used. It uses the older
   2024-11-05 protocol. Should we validate the header there too? Recommendation: yes,
   but default to `2024-11-05` for missing headers on SSE.

4. **Version negotiation**: The SDK handles version negotiation during `initialize`.
   We need to read the agreed version from the SDK's internal state. Check if the SDK
   exposes this (e.g., `transport.negotiatedVersion` or `server.protocolVersion`).

5. **Header case**: HTTP headers are case-insensitive. Use case-insensitive lookup.

---

## Acceptance Criteria

- [ ] Requests with correct version header → processed normally
- [ ] Requests with wrong version → 400 Bad Request
- [ ] Requests without header → backward compatible (default version assumed)
- [ ] No regressions in existing transport tests
