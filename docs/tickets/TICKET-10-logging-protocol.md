# TICKET-10: Logging Protocol

**Priority:** P1 — High
**Phase:** 4 — Protocol Utilities
**Depends on:** TICKET-00
**Estimated scope:** Medium
**Breaking change:** No (opt-in capability)

---

## Summary

Implement the MCP logging protocol: `logging/setLevel` handler and
`notifications/message` sending. This bridges protocol-level logging (server → client)
with the framework's existing internal Logger.

---

## Checklist

### Type Definitions
- [ ] Define MCP log levels enum/type (RFC 5424 severity):
      ```typescript
      type MCPLogLevel = 'debug' | 'info' | 'notice' | 'warning'
                       | 'error' | 'critical' | 'alert' | 'emergency';
      ```
- [ ] Define severity ordering: debug(0) < info(1) < notice(2) < warning(3)
      < error(4) < critical(5) < alert(6) < emergency(7)
- [ ] Export types from `src/index.ts`

### MCPServer Changes (`src/core/MCPServer.ts`)
- [ ] Add `logging: {}` to capabilities when enabled (new config option `enableLogging?: boolean`)
- [ ] Add `private currentLogLevel: MCPLogLevel = 'warning'` field
- [ ] Register `logging/setLevel` request handler:
      ```typescript
      server.setRequestHandler(SetLevelRequestSchema, async (request) => {
        this.currentLogLevel = request.params.level;
        logger.info(`Log level set to: ${request.params.level}`);
        return {};
      });
      ```
- [ ] Add public `sendLog(level, logger, data)` method:
      ```typescript
      public async sendLog(
        level: MCPLogLevel,
        loggerName: string,
        data: unknown
      ): Promise<void> {
        if (severityOf(level) >= severityOf(this.currentLogLevel)) {
          await this.server.notification({
            method: 'notifications/message',
            params: { level, logger: loggerName, data }
          });
        }
      }
      ```
- [ ] Create `severityOf(level: MCPLogLevel): number` utility function

### Tool Integration
- [ ] Expose logging capability to tools via MCPTool base class:
      ```typescript
      protected async log(
        level: MCPLogLevel,
        data: unknown,
        loggerName?: string
      ): Promise<void> {
        // Delegates to server.sendLog()
      }
      ```
- [ ] `loggerName` defaults to `this.name` (tool name)

### Internal Logger Bridge (optional)
- [ ] Optionally bridge internal Logger to also emit protocol notifications
- [ ] Map internal log levels to MCP log levels:
      `debug→debug`, `info→info`, `warn→warning`, `error→error`
- [ ] Guard: only bridge when `logging` capability is active AND server is connected

### Unit Tests (`tests/core/logging-protocol.test.ts`)
- [ ] `logging/setLevel` to 'error' → accepted, level stored
- [ ] `logging/setLevel` to 'debug' → accepted
- [ ] `logging/setLevel` with invalid level → error response (-32602)
- [ ] `sendLog('error', ...)` when level is 'error' → notification sent
- [ ] `sendLog('info', ...)` when level is 'error' → notification NOT sent (below threshold)
- [ ] `sendLog('debug', ...)` when level is 'debug' → notification sent
- [ ] `sendLog('emergency', ...)` → always sent (highest severity)
- [ ] Severity ordering: all 8 levels in correct order
- [ ] Log notification format: `{ level, logger, data }` matches spec
- [ ] Tool `this.log()` → delegates to server correctly
- [ ] Tool `this.log()` before server injection → no-op or queued
- [ ] Logging capability not enabled → `logging/setLevel` returns error

### Integration Tests
- [ ] Client sends `logging/setLevel` → server accepts
- [ ] Tool logs during execution → client receives notification
- [ ] Level filtering works end-to-end
- [ ] Multiple tools logging concurrently → all messages delivered

### Backwards Compat
- [ ] Logging not enabled by default → no new capability in init response
- [ ] Existing Logger (file/stderr) continues to work unchanged
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Level naming**: MCP uses `"warning"` (not `"warn"`). Our internal Logger may use
   `"warn"`. Map correctly in the bridge.

2. **Data serialization**: The `data` field is "arbitrary JSON-serializable data." It
   can be a string, object, array, number, null. Don't restrict it.

3. **Rate limiting**: A tool in a tight loop calling `this.log()` could flood the
   client with notifications. Consider:
   - Rate limiting at the framework level (e.g., max 100 logs/second)
   - Or documenting that tool authors should be judicious
   - Or both

4. **Sensitive data**: Spec says logs MUST NOT contain credentials, PII, or system
   internals. We can't enforce this, but document it prominently in the tool authoring
   guide.

5. **stdio transport**: Logging notifications go over the protocol (stdout) via JSON-RPC,
   NOT to stderr. This is fundamentally different from the internal Logger which writes
   to stderr. Don't conflate them.

6. **Pre-initialization logging**: If the server logs before the client connects, those
   notifications can't be sent. Buffer or drop? Recommendation: drop (no client to
   receive them). Internal Logger handles pre-init logging to stderr/files.

7. **Notification method name**: The spec says `notifications/message`. Verify the SDK
   exports this notification type.

8. **SetLevel schema import**: Need `SetLevelRequestSchema` from SDK. Verify it exists
   in 1.29.0.

---

## Acceptance Criteria

- [ ] Server declares `logging` capability when enabled
- [ ] `logging/setLevel` handler works correctly
- [ ] `notifications/message` sent for logs at/above threshold
- [ ] Tools can log via `this.log()` method
- [ ] Level filtering correct for all 8 RFC 5424 levels
- [ ] Existing internal Logger unaffected
- [ ] No logs sent when capability not enabled
