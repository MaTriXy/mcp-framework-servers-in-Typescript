# TICKET-04: Title & Icons on Tools, Resources, and Prompts

**Priority:** P1 — High
**Phase:** 2 — Core Schema Evolution
**Depends on:** TICKET-00
**Estimated scope:** Medium
**Breaking change:** No (all new fields are optional)

---

## Summary

Add optional `title`, `icons`, and `size` (resources only) fields to all MCP entities
per spec 2025-11-25. These fields provide display metadata for client UIs.

---

## Checklist

### Type Definitions
- [ ] Create shared `MCPIcon` interface (or import from SDK if available):
      ```typescript
      interface MCPIcon {
        src: string;
        mimeType?: string;
        sizes?: string[];
      }
      ```
- [ ] Add to `src/types/` or `src/core/types.ts` and export from `src/index.ts`

### MCPTool Changes (`src/tools/BaseTool.ts`)
- [ ] Add `protected title?: string` property
- [ ] Add `protected icons?: MCPIcon[]` property
- [ ] Update `ToolProtocol.toolDefinition` type to include `title?` and `icons?`
- [ ] Update `toolDefinition` getter (~line 432) to conditionally include title/icons
- [ ] Only emit `title` if defined (not null/undefined)
- [ ] Only emit `icons` if defined AND non-empty array

### MCPPrompt Changes (`src/prompts/BasePrompt.ts`)
- [ ] Add `protected title?: string` property
- [ ] Add `protected icons?: MCPIcon[]` property
- [ ] Update `PromptProtocol.promptDefinition` type to include `title?` and `icons?`
- [ ] Update `promptDefinition` getter (~line 61) to conditionally include title/icons

### MCPResource Changes (`src/resources/BaseResource.ts`)
- [ ] Add `protected title?: string` property
- [ ] Add `protected icons?: MCPIcon[]` property
- [ ] Add `protected size?: number` property (size in bytes)
- [ ] Update `ResourceDefinition` type to include `title?`, `icons?`, `size?`
- [ ] Update `ResourceTemplateDefinition` type to include `title?`, `icons?`
- [ ] Update `resourceDefinition` getter (~line 48) to include new fields
- [ ] Update `templateDefinition` getter (~line 57) to include new fields

### MCPServer Handler Updates (`src/core/MCPServer.ts`)
- [ ] Verify `ListToolsRequestSchema` handler passes through title/icons from toolDefinition
- [ ] Verify `ListPromptsRequestSchema` handler passes through title/icons
- [ ] Verify `ListResourcesRequestSchema` handler passes through title/icons/size
- [ ] Verify `ListResourceTemplatesRequestSchema` handler passes through title/icons

### Unit Tests (`tests/tools/tool-metadata.test.ts`)
- [ ] Tool with title set → `toolDefinition.title` equals value
- [ ] Tool without title → `toolDefinition` has no `title` key (verify with `'title' in def`)
- [ ] Tool with icons array → `toolDefinition.icons` equals array
- [ ] Tool with empty icons `[]` → `toolDefinition` has no `icons` key
- [ ] Tool with icons containing data: URI → accepted
- [ ] Tool with icons containing https: URL → accepted

### Unit Tests (`tests/prompts/prompt-metadata.test.ts`)
- [ ] Prompt with title → included in promptDefinition
- [ ] Prompt without title → not present
- [ ] Prompt with icons → included

### Unit Tests (`tests/resources/resource-metadata.test.ts`)
- [ ] Resource with title → included in resourceDefinition
- [ ] Resource with size → included in resourceDefinition
- [ ] Resource with icons → included in resourceDefinition
- [ ] Resource template with title → included in templateDefinition
- [ ] Resource template with icons → included in templateDefinition

### Backward Compat Tests
- [ ] Existing tool subclass without title/icons → definition unchanged
- [ ] Existing prompt subclass without title/icons → definition unchanged
- [ ] Existing resource subclass without title/icons/size → definition unchanged
- [ ] All 57 existing tests pass unchanged

---

## Edge Cases & Gotchas

1. **Icon `src` validation**: Should we validate that `src` is a parseable URL or data
   URI? Recommendation: validate at tool registration time, log warning if invalid,
   but don't reject. Clients may handle invalid icons gracefully.

2. **Icon `sizes` format**: The spec shows `["48x48"]`. This matches the HTML `sizes`
   attribute format. Don't validate the format — just pass through.

3. **`title` vs `name`**: These serve different purposes:
   - `name` is the programmatic identifier used for dispatch (`tools/call` uses `name`)
   - `title` is a human-readable display label
   - Clients should display `title` if present, fall back to `name`
   - The framework MUST NOT use `title` for any dispatch or matching logic

4. **`size` semantics**: For resources, `size` is in bytes and optional. It's a hint —
   the actual content returned by `read()` may differ. Don't enforce consistency.

5. **Icons array ordering**: First icon in array is preferred. Document this convention.

6. **Empty string title**: `title: ""` is technically valid but useless. Consider
   treating it same as undefined (don't emit). Or let it through — it's the developer's
   choice.

---

## Acceptance Criteria

- [ ] `tools/list` response includes `title` and `icons` when set on tools
- [ ] `prompts/list` response includes `title` and `icons` when set on prompts
- [ ] `resources/list` response includes `title`, `icons`, and `size` when set
- [ ] `resources/templates/list` response includes `title` and `icons` when set
- [ ] Fields absent (not null) when not set on the entity
- [ ] All existing tests pass
- [ ] New types exported from `src/index.ts`
