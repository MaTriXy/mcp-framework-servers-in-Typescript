# TICKET-16: Tasks (Experimental)

**Priority:** P3 — Low (experimental spec feature)
**Phase:** 6 — Advanced Features
**Depends on:** TICKET-00, TICKET-11 (progress), TICKET-12 (cancellation)
**Estimated scope:** Very Large
**Breaking change:** No (opt-in capability)

---

## Summary

Implement the experimental Tasks feature from MCP spec 2025-11-25: durable async
execution with polling, deferred result retrieval, and lifecycle management. Tools can
declare `execution.taskSupport` and execute as long-running background tasks.

**Note:** This is experimental and may change in future spec versions.

---

## Checklist

### Capability Declaration
- [ ] Add `tasks` capability support to MCPServer:
      ```typescript
      capabilities: {
        tasks: {
          list: {},
          cancel: {},
          requests: {
            tools: { call: {} }
          }
        }
      }
      ```
- [ ] Only declare when tasks are enabled (new config option)

### Task State Machine
- [ ] Define task states: `working`, `input_required`, `completed`, `failed`, `cancelled`
- [ ] Define valid transitions:
      - working → input_required, completed, failed, cancelled
      - input_required → working, completed, failed, cancelled
      - completed, failed, cancelled → terminal (no transitions)
- [ ] Implement state transition validation

### Task Storage
- [ ] Create `TaskManager` class:
      - Store tasks in-memory (Map<taskId, TaskState>)
      - TTL-based expiry
      - Access control (bind to auth context if available)
- [ ] Task state includes: taskId, status, statusMessage, createdAt, lastUpdatedAt,
      ttl, pollInterval, result (when completed)
- [ ] Generate cryptographically secure task IDs (randomUUID)

### Tool-Level Negotiation
- [ ] Add `execution?: { taskSupport?: 'forbidden' | 'optional' | 'required' }` to MCPTool
- [ ] Include in `toolDefinition` getter
- [ ] Default: `'forbidden'` (tools don't support tasks)

### Protocol Handlers
- [ ] Modify `CallToolRequestSchema` handler to detect `task` in params:
      - If task present → create task, return CreateTaskResult, execute in background
      - If task absent → existing synchronous execution
- [ ] Register `tasks/get` handler
- [ ] Register `tasks/result` handler (blocks until terminal state)
- [ ] Register `tasks/list` handler (with pagination)
- [ ] Register `tasks/cancel` handler
- [ ] Implement `notifications/tasks/status` sending on state changes

### Background Execution
- [ ] When task-augmented: start tool execution in background (don't await)
- [ ] Capture result or error when execution completes
- [ ] Transition task to `completed` or `failed`
- [ ] Store result for later retrieval via `tasks/result`

### Unit Tests (`tests/core/tasks.test.ts`)
- [ ] Create task-augmented tool call → returns CreateTaskResult
- [ ] tasks/get for working task → returns working status
- [ ] tasks/get for completed task → returns completed status
- [ ] tasks/result for completed task → returns tool result
- [ ] tasks/result for working task → blocks until completion
- [ ] tasks/list → returns all tasks for requestor
- [ ] tasks/list with pagination → cursor-based
- [ ] tasks/cancel for working task → cancelled
- [ ] tasks/cancel for completed task → error -32602
- [ ] Task TTL expiry → task deleted, tasks/get returns error
- [ ] Task ID uniqueness → no collisions
- [ ] Task with auth context → bound to user
- [ ] Non-task request when taskSupport='required' → error
- [ ] Task request when taskSupport='forbidden' → error
- [ ] Task state transitions → only valid transitions allowed
- [ ] Status notification sent on state change
- [ ] Progress token works with tasks

### Backwards Compat
- [ ] Tools without execution.taskSupport → synchronous (current behavior)
- [ ] tasks capability not declared → task params ignored
- [ ] All existing tool tests pass

---

## Edge Cases & Gotchas

1. **Memory management**: Tasks store results in memory. Long-running servers with many
   tasks will accumulate. TTL-based cleanup is essential. Consider max concurrent tasks.

2. **Auth binding**: Per spec, tasks MUST be bound to auth context when available. A user
   should only see their own tasks. Without auth, task IDs must be cryptographically
   secure to prevent enumeration.

3. **tasks/result blocking**: When a task is in progress, `tasks/result` blocks. This
   means the HTTP connection stays open. With SSE transport, this is natural. With batch
   HTTP, this means a long-running HTTP request.

4. **input_required state**: Complex. When a task needs input (e.g., elicitation), it
   transitions to `input_required`. The client polls, sees this, calls `tasks/result`,
   and receives the elicitation request. This requires careful coordination.

5. **Server restart**: Tasks are in-memory. Server restart loses all tasks. Document
   this limitation. Persistent storage is out of scope for v1.

6. **Concurrent task limits**: Unbounded task creation could exhaust resources. Implement
   per-user task limits (configurable, default 100).

---

## Acceptance Criteria

- [ ] Tools can declare taskSupport
- [ ] Task-augmented calls execute in background
- [ ] Full task lifecycle: create → poll → complete → retrieve result
- [ ] Cancellation works
- [ ] TTL expiry works
- [ ] Auth binding enforced when auth present
- [ ] All existing tests pass
