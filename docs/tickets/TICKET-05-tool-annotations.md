# TICKET-05: Tool Annotations

**Priority:** P1 — High
**Phase:** 2 — Core Schema Evolution
**Depends on:** TICKET-00
**Estimated scope:** Small-Medium
**Breaking change:** No (opt-in)

---

## Summary

Allow tools to declare behavioral hints via an `annotations` object:
`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.

Clients use these to make safety decisions (e.g., auto-approve read-only tools,
require confirmation for destructive tools).

---

## Checklist

### Type Definitions
- [ ] Define `ToolAnnotations` interface (or import from SDK 1.29.0):
      ```typescript
      interface ToolAnnotations {
        title?: string;              // Legacy location for display name
        readOnlyHint?: boolean;      // Tool doesn't modify state (default: false)
        destructiveHint?: boolean;   // Tool may perform destructive ops (default: true)
        idempotentHint?: boolean;    // Safe to call multiple times (default: false)
        openWorldHint?: boolean;     // Tool interacts with external world (default: true)
      }
      ```
- [ ] Export from `src/index.ts`

### MCPTool Changes (`src/tools/BaseTool.ts`)
- [ ] Add `protected annotations?: ToolAnnotations` property
- [ ] Update `ToolProtocol` interface: add `annotations?` to `toolDefinition` type
- [ ] Update `toolDefinition` getter to conditionally include annotations:
      ```typescript
      get toolDefinition() {
        return {
          name: this.name,
          description: this.description,
          inputSchema: this.inputSchema,
          ...(this.annotations && { annotations: this.annotations }),
        };
      }
      ```

### Unit Tests (`tests/tools/tool-annotations.test.ts`)
- [ ] Tool with `readOnlyHint: true` → annotation present in definition
- [ ] Tool with `destructiveHint: false` → annotation present (overrides default)
- [ ] Tool with all four hints → all present in definition
- [ ] Tool with `annotations: { readOnlyHint: true }` → only readOnlyHint in output
- [ ] Tool with no annotations → `annotations` key absent from definition
- [ ] Tool with empty `annotations: {}` → key absent (or empty object? — decide)
- [ ] Annotations don't affect tool execution (purely metadata)
- [ ] `annotations.title` coexists with top-level `title` (TICKET-04)
- [ ] Type checking: invalid annotation keys → TypeScript error at compile time

### Integration Tests
- [ ] `tools/list` response includes annotations when set
- [ ] `tools/list` response omits annotations when not set
- [ ] Client can read annotations from list response

### Backwards Compat
- [ ] Existing tools without annotations → definition unchanged
- [ ] All existing tool tests pass
- [ ] Compat test suite passes

---

## Edge Cases & Gotchas

1. **Annotations are HINTS, not contracts**: A tool marked `readOnlyHint: true` can
   still write data. The framework MUST NOT enforce these semantically. They're purely
   for client-side UX decisions.

2. **Security: annotations are untrusted**: Per spec, clients MUST consider annotations
   untrusted unless from a trusted server. This is a client concern, but document it in
   our tool authoring guide.

3. **Default values in the spec**:
   - `readOnlyHint` defaults to `false` (assume tool may write)
   - `destructiveHint` defaults to `true` (assume tool may be destructive)
   - `idempotentHint` defaults to `false` (assume not idempotent)
   - `openWorldHint` defaults to `true` (assume tool accesses external world)

   We should NOT strip properties that match defaults. If a developer explicitly sets
   `destructiveHint: true`, include it — it communicates intent even if it matches the
   default.

4. **Empty annotations object**: If someone sets `annotations: {}`, should we emit it?
   Recommendation: don't emit empty objects. Check `Object.keys(annotations).length > 0`.

5. **`annotations.title` vs top-level `title`**: Per spec, precedence is:
   `tool.title > tool.annotations.title > tool.name`. We support both via TICKET-04
   (top-level) and this ticket (in annotations). Recommend developers use top-level.

---

## Acceptance Criteria

- [ ] Tools can declare annotations via a property
- [ ] Annotations appear in `tools/list` response
- [ ] Annotations are absent when not defined
- [ ] All annotation fields are optional
- [ ] No runtime behavior changes from annotations
- [ ] `ToolAnnotations` type exported from package
