# TICKET-09: Content Annotations

**Priority:** P2 — Medium
**Phase:** 3 — New Content Types
**Depends on:** TICKET-06
**Estimated scope:** Small
**Breaking change:** No (optional field on existing types)

---

## Summary

Add optional `annotations` to all content types (text, image, audio, resource link,
embedded resource) with `audience`, `priority`, and `lastModified` fields, per MCP
spec 2025-06-18.

---

## Checklist

### Type Definition
- [ ] Define `ContentAnnotations` interface:
      ```typescript
      interface ContentAnnotations {
        audience?: ('user' | 'assistant')[];
        priority?: number;       // 0.0 to 1.0
        lastModified?: string;   // ISO 8601 timestamp
      }
      ```
- [ ] Add optional `annotations?: ContentAnnotations` to:
  - [ ] `TextContent`
  - [ ] `ImageContent`
  - [ ] `AudioContent` (TICKET-07)
  - [ ] `ResourceLink` (TICKET-08)
  - [ ] `EmbeddedResource.resource` (TICKET-08)
- [ ] Export `ContentAnnotations` from `src/index.ts`

### Resource Annotations (also on resource definitions)
- [ ] Add `annotations?: ContentAnnotations` to `ResourceDefinition`
- [ ] Add `annotations?: ContentAnnotations` to `ResourceTemplateDefinition`
- [ ] Update `resourceDefinition` getter to include annotations
- [ ] Update `templateDefinition` getter to include annotations

### Validation (soft, warning-only)
- [ ] `priority` must be 0.0-1.0 → log warning if out of range
- [ ] `lastModified` should be ISO 8601 → log warning if not parseable
- [ ] `audience` values must be `'user'` or `'assistant'` → log warning otherwise

### Unit Tests (`tests/tools/content-annotations.test.ts`)
- [ ] TextContent with annotations → passed through in response
- [ ] ImageContent with annotations → passed through
- [ ] Content without annotations → no annotations field in output
- [ ] `audience: ['user']` → valid
- [ ] `audience: ['user', 'assistant']` → valid
- [ ] `audience: []` → valid (treated as unspecified)
- [ ] `priority: 0.0` → valid
- [ ] `priority: 1.0` → valid
- [ ] `priority: 0.5` → valid
- [ ] `priority: -0.1` → warning logged, still passed through
- [ ] `priority: 1.5` → warning logged, still passed through
- [ ] `lastModified: '2025-01-12T15:00:58Z'` → valid
- [ ] Resource with annotations → included in definition
- [ ] Resource template with annotations → included in definition

### Backwards Compat
- [ ] Existing content without annotations → unchanged
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Priority range enforcement**: The spec says 0.0-1.0 but doesn't say what happens
   with out-of-range values. Recommendation: log a warning, pass through. Don't clamp
   or reject — the server author may have a reason.

2. **Empty audience array**: `audience: []` is ambiguous — does it mean "nobody" or
   "unspecified"? Treat as absent. Consider not emitting `audience: []`.

3. **lastModified precision**: ISO 8601 allows various formats
   (`2025-01-12`, `2025-01-12T15:00:58Z`, `2025-01-12T15:00:58.123Z`). Accept all.

4. **Annotations on resources vs content**: Both resource *definitions* (in list) and
   resource *content* (in read response) can have annotations. They may differ — the
   definition might say `priority: 0.8` while individual content blocks have their own.

---

## Acceptance Criteria

- [ ] All content types support optional `annotations`
- [ ] Resource definitions support optional `annotations`
- [ ] Annotations pass through to protocol responses
- [ ] `ContentAnnotations` type exported
- [ ] Out-of-range values logged as warnings, not rejected
