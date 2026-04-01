# TICKET-12: Cancellation Support

**Priority:** P2 — Medium
**Phase:** 4 — Protocol Utilities
**Depends on:** TICKET-00
**Estimated scope:** Medium
**Breaking change:** No

---

## Summary

Handle `notifications/cancelled` to abort in-progress tool calls. Provide an
`AbortSignal` to tools so they can check for cancellation during long operations.

---

## Checklist

### MCPServer Changes (`src/core/MCPServer.ts`)
- [ ] Maintain map: `Map<string | number, AbortController>` keyed by request ID
- [ ] Before tool execution, create AbortController and store with request ID
- [ ] After tool execution (success or error), remove from map
- [ ] Register notification handler for `notifications/cancelled`:
      ```typescript
      server.setNotificationHandler(CancelledNotificationSchema, (notification) => {
        const requestId = notification.params.requestId;
        const controller = this.inFlightRequests.get(requestId);
        if (controller) {
          controller.abort(notification.params.reason ?? 'Request cancelled');
          this.inFlightRequests.delete(requestId);
        }
        // Ignore unknown request IDs (per spec)
      });
      ```

### MCPTool Changes (`src/tools/BaseTool.ts`)
- [ ] Add `private _currentAbortController?: AbortController` field (per-invocation)
- [ ] Add protected getter:
      ```typescript
      protected get abortSignal(): AbortSignal | undefined {
        return this._currentAbortController?.signal;
      }
      ```
- [ ] Set controller before `execute()`, clear after
- [ ] Same concurrency concerns as TICKET-11 (per-invocation storage)

### Unit Tests (`tests/core/cancellation.test.ts`)
- [ ] Cancel in-flight request → AbortSignal fires
- [ ] Tool checks `this.abortSignal.aborted` → true after cancellation
- [ ] Cancel unknown request ID → silently ignored
- [ ] Cancel already-completed request → silently ignored
- [ ] Cancel with reason → reason available on AbortSignal
- [ ] Multiple concurrent requests → only targeted one cancelled
- [ ] AbortController cleaned up after tool completes
- [ ] Tool that doesn't check abortSignal → completes normally (cancellation is best-effort)

### Integration Tests
- [ ] Client sends cancel notification → tool aborted
- [ ] Tool execution error from cancellation → appropriate error response

### Backwards Compat
- [ ] Existing tools (don't use abortSignal) → unchanged
- [ ] No new required overrides in tool subclasses
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Race condition**: Cancellation may arrive after tool completes but before response
   is sent. Both parties MUST handle this gracefully. Our map cleanup (delete after
   completion) handles the server side.

2. **No response for cancelled requests**: Per spec, receivers SHOULD NOT send a
   response for cancelled requests. This means we need to suppress the response if the
   tool was cancelled. Check if the SDK handles this automatically.

3. **initialize MUST NOT be cancelled**: Per spec. Don't register AbortController for
   initialize requests.

4. **Tool cleanup**: Tools that allocate resources (file handles, network connections)
   should clean up on cancellation. Document the pattern:
   ```typescript
   async execute(input) {
     this.abortSignal?.addEventListener('abort', () => { /* cleanup */ });
     // ... long operation
   }
   ```

5. **AbortError propagation**: When a tool throws AbortError, should we return an
   isError response or suppress the response entirely? Spec says suppress. But if the
   client is already gone (disconnected), the suppression is automatic.

6. **Tasks use different mechanism**: Task-augmented requests use `tasks/cancel`, NOT
   `notifications/cancelled`. This ticket only covers the non-task path.

---

## Acceptance Criteria

- [ ] In-flight tool calls can be cancelled via notification
- [ ] Tools receive AbortSignal for checking cancellation
- [ ] Unknown/completed request cancellations silently ignored
- [ ] No response sent for successfully cancelled requests
- [ ] Cleanup: no memory leaks from AbortController map
