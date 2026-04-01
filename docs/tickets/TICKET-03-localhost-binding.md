# TICKET-03: Default to Localhost Binding

**Priority:** P0 — Critical (Security)
**Phase:** 1 — Security Hardening
**Depends on:** None
**Estimated scope:** Small
**Breaking change:** Yes (if default changes from 0.0.0.0 to 127.0.0.1)

---

## Summary

Local MCP servers should bind to `127.0.0.1` by default instead of `0.0.0.0` (all
interfaces), as recommended by MCP spec 2025-11-25. Add a `host` config option to
both HTTP Stream and SSE transports.

---

## Checklist

### Implementation
- [ ] Add `host?: string` to `HttpStreamTransportConfig` interface
- [ ] Add `host?: string` to `SSETransportConfig` interface
- [ ] Default `host` to `'127.0.0.1'` in `DEFAULT_HTTP_STREAM_CONFIG`
- [ ] Default `host` to `'127.0.0.1'` in `DEFAULT_SSE_CONFIG`
- [ ] Update `src/transports/http/server.ts` line ~108:
      `this._server.listen(this._port, this._config.host ?? '127.0.0.1')`
- [ ] Update `src/transports/sse/server.ts` line ~100:
      `this._server.listen(this._config.port, this._config.host ?? '127.0.0.1')`
- [ ] Log the bound host:port on startup for clarity

### Unit Tests (`tests/transports/host-binding.test.ts`)
- [ ] Default config → server listening address is 127.0.0.1
- [ ] `host: '0.0.0.0'` → server listening on all interfaces
- [ ] `host: '127.0.0.1'` → only localhost
- [ ] `host: '::1'` → IPv6 localhost
- [ ] Verify server address after listen via `server.address()`
- [ ] HTTP stream transport uses configured host
- [ ] SSE transport uses configured host

### Migration / Backwards Compat Tests
- [ ] Existing configs without `host` field → default behavior works
- [ ] Docker use case documented: set `host: '0.0.0.0'`

---

## Edge Cases & Gotchas

1. **Docker / Kubernetes**: Containerized servers MUST bind to `0.0.0.0` to be reachable
   from outside the container. The `host` config makes this easy, but this is a very
   common footgun for users upgrading. Document prominently.

2. **IPv6**: `::1` is the IPv6 localhost. Passing `'localhost'` to Node's `.listen()` may
   resolve to `::1` on IPv6-preferred systems. Recommend explicit `127.0.0.1` as default.

3. **Cloud platforms**: Platforms like Heroku, Railway, Render require `0.0.0.0` binding.
   Document this in the migration guide.

4. **Test impact**: Integration tests that start HTTP servers may need updating if they
   connect to `localhost` (which may resolve to `::1`) vs `127.0.0.1`. Use explicit IPs.

5. **Dual-stack**: Some systems listen on both IPv4 and IPv6 when given `localhost`.
   Explicit `127.0.0.1` avoids ambiguity.

---

## Migration Guide (for CHANGELOG)

```markdown
### Breaking: Default host binding changed to 127.0.0.1

MCP servers now bind to `127.0.0.1` (localhost only) by default instead of `0.0.0.0`
(all interfaces). This improves security for local development servers.

If you need your server accessible from other machines (Docker, cloud platforms, etc.),
add `host: '0.0.0.0'` to your transport config:

```typescript
const server = new MCPServer({
  transport: {
    type: 'http-stream',
    options: { port: 8080, host: '0.0.0.0' }
  }
});
```
```

---

## Acceptance Criteria

- [ ] Default server only accessible from localhost
- [ ] `host: '0.0.0.0'` makes server accessible from all interfaces
- [ ] Startup log shows bound address
- [ ] All existing tests pass (may need host config in test setup)
