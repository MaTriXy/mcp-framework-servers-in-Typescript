# TICKET-11: Progress Tracking

**Priority:** P2 — Medium
**Phase:** 4 — Protocol Utilities
**Depends on:** TICKET-00
**Estimated scope:** Medium
**Breaking change:** No (opt-in, no-op if client doesn't request)

---

## Summary

Support `progressToken` in request `_meta` and enable tools to send
`notifications/progress` with progress/total/message values for long-running operations.

---

## Checklist

### MCPServer Changes (`src/core/MCPServer.ts`)
- [ ] In `CallToolRequestSchema` handler, extract `progressToken` from `request.params._meta`
- [ ] Pass `progressToken` to the tool's execution context (not as a method parameter —
      use a per-invocation context pattern)

### MCPTool Changes (`src/tools/BaseTool.ts`)
- [ ] Add `private _currentProgressToken?: string | number` field
- [ ] Set token before `execute()` / `executeStructured()`, clear after
- [ ] Add protected `reportProgress()` method:
      ```typescript
      protected async reportProgress(
        progress: number,
        total?: number,
        message?: string
      ): Promise<void> {
        if (this._currentProgressToken != null && this.server) {
          await this.server.notification({
            method: 'notifications/progress',
            params: {
              progressToken: this._currentProgressToken,
              progress,
              ...(total != null && { total }),
              ...(message && { message }),
            }
          });
        }
      }
      ```

### Concurrency Safety
- [ ] `_currentProgressToken` must be per-invocation, not per-instance
- [ ] If a tool instance is called concurrently, each call has its own token
- [ ] Option A: Use AsyncLocalStorage to store token per-invocation
- [ ] Option B: Pass token via a context object to execute()
- [ ] Option C: Create a new tool instance per call (current pattern? verify)
- [ ] **Verify current pattern**: Does MCPServer reuse tool instances across calls?
      If yes → must use per-invocation storage. If no → instance field is safe.

### Unit Tests (`tests/core/progress.test.ts`)
- [ ] Request with progressToken → token available in tool
- [ ] Tool calls `reportProgress(50, 100)` → notification sent with token
- [ ] Tool calls `reportProgress(50, 100, 'Processing...')` → message included
- [ ] Request without progressToken → `reportProgress()` is no-op
- [ ] Multiple progress reports → all sent with same token
- [ ] Progress value increases → accepted (spec MUST, but we don't enforce)
- [ ] Floating point progress/total → accepted
- [ ] Token is string → works
- [ ] Token is number → works
- [ ] Concurrent tool calls → each uses correct token (critical test)

### Backwards Compat
- [ ] Existing tools (don't call reportProgress) → no change
- [ ] Requests without _meta → no token, reportProgress is no-op
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Tool instance reuse**: The MCPServer stores tools in `toolsMap` and reuses instances
   across calls. This means `_currentProgressToken` as an instance field would be
   overwritten by concurrent calls. MUST use per-invocation storage
   (AsyncLocalStorage or parameter passing).

2. **Progress MUST increase**: The spec says "The progress value MUST increase with each
   notification." We should NOT enforce this (it would require tracking state), but
   document it for tool authors.

3. **Total unknown**: Total may be omitted if unknown. Don't require it.

4. **Notification timing**: Progress notifications should be sent during execution,
   not after. If `execute()` completes before a notification is sent, don't send it.

5. **Token cleanup**: After `execute()` completes (success or error), clear the token.
   Don't leak tokens across invocations.

6. **SDK notification method**: Verify the SDK supports sending `notifications/progress`
   via `server.notification()` or similar.

---

## Acceptance Criteria

- [ ] Tools can report progress during execution
- [ ] Progress notifications sent with correct token and format
- [ ] No progress sent when client doesn't provide token
- [ ] Concurrent calls use independent tokens
- [ ] No regressions in existing tool execution
