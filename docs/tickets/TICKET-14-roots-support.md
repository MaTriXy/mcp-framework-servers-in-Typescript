# TICKET-14: Roots Support

**Priority:** P2 — Medium
**Phase:** 5 — Client Features
**Depends on:** TICKET-00
**Estimated scope:** Small-Medium
**Breaking change:** No

---

## Summary

Enable servers to query the client's filesystem boundaries via `roots/list` and listen
for `notifications/roots/list_changed`, per MCP spec 2024-11-05.

---

## Checklist

### Type Definitions
- [ ] Define `Root` interface (or import from SDK):
      ```typescript
      interface Root {
        uri: string;   // MUST be file:// URI
        name?: string;
      }
      ```
- [ ] Export from `src/index.ts`

### MCPServer Changes (`src/core/MCPServer.ts`)
- [ ] Add `private _roots: Root[] = []` field
- [ ] Add `private _rootsSupported: boolean = false` field
- [ ] After initialization, check client capabilities for `roots`
- [ ] If client supports roots, call `roots/list` and cache result
- [ ] Register notification handler for `notifications/roots/list_changed`:
      ```typescript
      server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
        const result = await this.server.request(
          { method: 'roots/list' },
          ListRootsResultSchema
        );
        this._roots = result.roots;
        logger.info(`Roots updated: ${this._roots.length} roots`);
      });
      ```
- [ ] Add public `getRoots(): Root[]` method
- [ ] Add public `isRootsSupported(): boolean` method

### MCPTool Integration
- [ ] Add protected method on MCPTool:
      ```typescript
      protected async getRoots(): Promise<Root[]> {
        // Delegates to server
      }
      ```

### Unit Tests (`tests/core/roots.test.ts`)
- [ ] Client supports roots → initial roots/list called
- [ ] Client doesn't support roots → roots/list not called
- [ ] getRoots() returns cached roots
- [ ] Roots change notification → cache refreshed
- [ ] Empty roots list → valid (returns [])
- [ ] Root with file:// URI → accepted
- [ ] Root with name → included
- [ ] Root without name → valid

### Backwards Compat
- [ ] Client without roots capability → feature inactive, no errors
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Client may not support roots**: Always check capabilities. `getRoots()` should
   return empty array (not throw) when client doesn't support roots.

2. **Roots can change mid-session**: The `list_changed` notification means roots can be
   added/removed while tools are executing. Tools should call `getRoots()` fresh if
   they need current roots, not cache the result.

3. **file:// URI only**: The spec says root URIs MUST be `file://` URIs currently. Don't
   validate this strictly — future spec versions may relax it.

4. **Root accessibility**: A root's URI may point to a directory that doesn't exist or
   isn't accessible from the server. Handle gracefully.

---

## Acceptance Criteria

- [ ] Server queries client for roots after initialization
- [ ] Root list updates on change notification
- [ ] Tools can access roots via helper method
- [ ] Graceful fallback when client doesn't support roots
