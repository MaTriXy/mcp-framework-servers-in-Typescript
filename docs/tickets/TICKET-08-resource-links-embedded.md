# TICKET-08: Resource Links & Embedded Resources in Tool Results

**Priority:** P2 — Medium
**Phase:** 3 — New Content Types
**Depends on:** TICKET-06
**Estimated scope:** Medium
**Breaking change:** No (additive type union)

---

## Summary

Enable tools to return `type: "resource_link"` (URI reference to a resource) and
`type: "resource"` (inline embedded resource) content blocks in tool results, per MCP
spec 2025-06-18.

---

## Checklist

### Type Definitions (`src/tools/BaseTool.ts`)
- [ ] Add `ResourceLink` interface:
      ```typescript
      interface ResourceLink {
        type: 'resource_link';
        uri: string;
        name?: string;
        description?: string;
        mimeType?: string;
        annotations?: ContentAnnotations;
      }
      ```
- [ ] Add `EmbeddedResource` interface:
      ```typescript
      interface EmbeddedResource {
        type: 'resource';
        resource: {
          uri: string;
          mimeType?: string;
          text?: string;
          blob?: string;  // base64
          annotations?: ContentAnnotations;
        };
      }
      ```
- [ ] Widen `ToolContent` union to include both new types
- [ ] Export from `src/index.ts`

### BaseTool Updates (`src/tools/BaseTool.ts`)
- [ ] Add `isResourceLink()` type guard
- [ ] Add `isEmbeddedResource()` type guard
- [ ] Update `isValidContent()` to recognize both new types
- [ ] Update `createSuccessResponse()` to handle resource link and embedded resource returns

### Unit Tests (`tests/tools/resource-content.test.ts`)
- [ ] ResourceLink with URI → recognized by type guard
- [ ] ResourceLink without URI → not recognized
- [ ] EmbeddedResource with text content → recognized
- [ ] EmbeddedResource with blob content → recognized
- [ ] EmbeddedResource with neither text nor blob → still valid (URI-only reference)
- [ ] Both types in mixed array → all included in response
- [ ] ResourceLink annotations → passed through
- [ ] EmbeddedResource annotations → passed through
- [ ] URI validation: valid URI → accepted
- [ ] URI validation: empty string → warning

### Backwards Compat
- [ ] Existing tools → unchanged
- [ ] `ToolContent` type widening doesn't break consumers
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Resource links are NOT in resources/list**: Per spec, "Resource links returned by
   tools are not guaranteed to appear in the results of a `resources/list` request."
   Document this — tool authors should not assume the URI will be listable.

2. **Embedded resource: text vs blob**: An embedded resource should have `text` OR `blob`,
   not both. If both are present, `text` takes precedence. Don't reject — just document.

3. **URI schemes**: Resource URIs can use any scheme (file://, https://, custom://).
   Don't validate the scheme — just validate it's a parseable URI.

4. **Circular references**: A tool could theoretically embed a resource that references
   itself. No framework-level protection needed — this is a tool author responsibility.

5. **Resource capability**: Per spec, "Servers that use embedded resources SHOULD
   implement the resources capability." If a tool returns embedded resources but the
   server doesn't declare resources capability, log a warning.

---

## Acceptance Criteria

- [ ] Tools can return resource links and embedded resources
- [ ] Both types appear correctly in `tools/call` response
- [ ] Types exported from package
- [ ] Type guards work correctly
- [ ] Mixed content arrays handled properly
