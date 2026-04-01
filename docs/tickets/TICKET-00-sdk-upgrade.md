# TICKET-00: Upgrade @modelcontextprotocol/sdk to ^1.29.0

**Priority:** P0 — Critical (blocks all other tickets)
**Phase:** 0 — Foundation
**Estimated scope:** Medium
**Breaking change:** Yes (peer dependency bump)

---

## Summary

Upgrade the MCP SDK from 1.11.0 to the latest 1.29.0. This is the foundation for all
subsequent work — the new SDK brings updated type definitions, new schema exports, and
transport improvements that every other ticket depends on.

---

## Checklist

### Preparation
- [ ] Read SDK changelog for all versions 1.12.0 through 1.29.0
- [ ] Identify breaking changes in SDK's public API
- [ ] Check if SDK now exports types we need: `ToolAnnotations`, `AudioContent`,
      `ResourceLink`, `EmbeddedResource`, `ContentAnnotations`, `structuredContent`,
      `outputSchema`, `title`, `icons`, `execution`
- [ ] Check if `StreamableHTTPServerTransport` constructor signature changed
- [ ] Check if `Server` constructor now accepts new capability types
- [ ] Check if any schema imports were renamed or moved

### Implementation
- [ ] Update `package.json` peerDependencies: `"@modelcontextprotocol/sdk": "^1.29.0"`
- [ ] Update `package.json` devDependencies to match
- [ ] Run `npm install`
- [ ] Fix all TypeScript compilation errors
- [ ] Update import paths if SDK restructured its exports
- [ ] Update `MCPServer.ts` `ServerCapabilities` type if SDK now exports the canonical type
- [ ] Update `ToolProtocol.toolDefinition` return type to match SDK's `Tool` type
- [ ] Update `PromptProtocol.promptDefinition` return type to match SDK's `Prompt` type
- [ ] Update `ResourceProtocol.resourceDefinition` return type to match SDK's `Resource` type
- [ ] Verify `StdioServerTransport` still works with same import path
- [ ] Verify `StreamableHTTPServerTransport` still works with same constructor args

### Testing
- [ ] All 57 existing test files pass
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes (or fix lint issues from SDK type changes)
- [ ] Manual smoke test: start stdio server, send initialize request
- [ ] Manual smoke test: start HTTP stream server, send initialize via curl
- [ ] Verify `getSdkVersion()` in MCPServer.ts returns correct new version

### Documentation
- [ ] Update CLAUDE.md if any architecture details changed
- [ ] Document SDK version requirement in README / installation docs
- [ ] Add CHANGELOG entry noting SDK version bump

---

## Edge Cases & Gotchas

1. **SDK may re-export types from sub-paths**: Check if imports like
   `@modelcontextprotocol/sdk/server/index.js` still work or if they moved to
   `@modelcontextprotocol/sdk/server`.

2. **SDK's `Server.setRequestHandler` type generics may have changed**: If the handler
   callback signature changed, all 10 handler registrations in `setupHandlers()` need
   updating.

3. **SDK may now handle features natively**: e.g., `StreamableHTTPServerTransport` may
   now validate Origin headers or `MCP-Protocol-Version` automatically. Check before
   reimplementing in our transport wrappers.

4. **Schema re-exports**: We import `ListToolsRequestSchema`, `CallToolRequestSchema`,
   etc. These may have moved or gained new required fields.

5. **Peer dependency resolution**: Users with npm < 7 may not auto-install peer deps.
   Consider also adding it as a regular dependency, or document clearly.

6. **SDK's `createMessage` for sampling**: The method signature may now accept `tools`
   and `toolChoice` parameters. Check before TICKET-15.

---

## Acceptance Criteria

- [ ] `npm run build` produces no errors with SDK 1.29.0
- [ ] `npm test` — all existing tests pass with zero regressions
- [ ] A project using mcp-framework can `npm install` and get SDK 1.29.0
- [ ] Server initializes and completes handshake with a client
- [ ] No runtime type errors from SDK type mismatches

---

## Rollback Plan

If the upgrade causes intractable issues:
1. Revert `package.json` to `^1.11.0`
2. Run `npm install`
3. Investigate specific breaking change
4. Consider intermediate version (e.g., ^1.20.0) as stepping stone
