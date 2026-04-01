# TICKET-06: Structured Content & Output Schemas

**Priority:** P1 — High
**Phase:** 2 — Core Schema Evolution
**Depends on:** TICKET-00
**Estimated scope:** Large
**Breaking change:** No (opt-in)

---

## Summary

Enable tools to declare `outputSchema` (JSON Schema for structured output) and return
`structuredContent` (typed JSON) alongside unstructured `content`. This is the largest
single feature addition to the tool system.

---

## Checklist

### Type Definitions
- [ ] Update `ToolResponse` type:
      ```typescript
      interface ToolResponse {
        content: ToolContent[];
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
      }
      ```
- [ ] Update `ToolProtocol.toolDefinition` type to include `outputSchema?`
- [ ] Export updated types from `src/index.ts`

### MCPTool Changes (`src/tools/BaseTool.ts`)
- [ ] Add `protected outputSchema?: z.ZodObject<any>` property
- [ ] Add `generateOutputSchema()` method — reuse existing Zod→JSON Schema conversion
      logic from `generateSchemaFromZodObject()` (lines 180-217)
- [ ] Refactor `generateSchemaFromZodObject()` to be reusable for both input and output
- [ ] Update `toolDefinition` getter to include outputSchema when defined:
      ```typescript
      ...(this.outputSchema && {
        outputSchema: this.generateOutputSchema()
      }),
      ```
- [ ] Update `toolCall()` method to handle structured responses:
  - [ ] If tool has `outputSchema`, validate result against it
  - [ ] If validation passes, include `structuredContent` in response
  - [ ] Auto-generate TextContent from JSON if no explicit content provided
  - [ ] If validation fails, return tool execution error (`isError: true`)
- [ ] Update `createSuccessResponse()` to support structured content path
- [ ] When `isError: true`, NEVER include `structuredContent`

### New Execute Pattern
- [ ] Add optional `executeStructured()` method to MCPTool:
      ```typescript
      protected async executeStructured?(
        input: MCPInput<this>
      ): Promise<{
        structured: Record<string, unknown>;
        content?: ToolContent[];
      }>;
      ```
- [ ] In `toolCall()`, prefer `executeStructured()` over `execute()` when outputSchema exists
- [ ] If tool has `outputSchema` but no `executeStructured`, fall back to wrapping
      `execute()` result (attempt JSON.parse if string, or use as-is if object)

### MCPServer Handler Updates (`src/core/MCPServer.ts`)
- [ ] Verify `CallToolRequestSchema` handler passes through `structuredContent` in response
- [ ] Ensure SDK's `CallToolResult` type supports `structuredContent` (check SDK 1.29.0)

### Unit Tests (`tests/tools/structured-content.test.ts`)
- [ ] Tool with outputSchema → `outputSchema` present in `toolDefinition`
- [ ] Tool without outputSchema → `outputSchema` absent from definition
- [ ] `executeStructured` returns valid data → response has `structuredContent`
- [ ] `executeStructured` returns data matching schema → validation passes
- [ ] `executeStructured` returns data NOT matching schema → `isError: true`, no structuredContent
- [ ] `executeStructured` with no explicit content → auto-generated TextContent
- [ ] `executeStructured` with explicit content → both `content` and `structuredContent`
- [ ] Error response → `structuredContent` absent
- [ ] Tool with `outputSchema` + `execute()` (no `executeStructured`) → fallback wrapping
- [ ] Output schema with nested objects → JSON Schema conversion works
- [ ] Output schema with arrays → JSON Schema conversion works
- [ ] Output schema with optional fields → JSON Schema marks as non-required
- [ ] Empty `structuredContent: {}` → valid if schema allows

### Zod→JSON Schema Conversion Tests
- [ ] Reused converter handles output schema types correctly
- [ ] String fields → `{ type: 'string' }`
- [ ] Number fields → `{ type: 'number' }`
- [ ] Boolean fields → `{ type: 'boolean' }`
- [ ] Array fields → `{ type: 'array', items: ... }`
- [ ] Nested object fields → recursive properties
- [ ] Optional fields → not in required array
- [ ] Description-less fields → allowed in output schema (only input requires descriptions)

### Backward Compat Tests
- [ ] Existing tools (no outputSchema) → behavior unchanged
- [ ] Existing `toolCall()` response format → unchanged for non-structured tools
- [ ] `createSuccessResponse()` existing behavior → preserved for non-structured tools
- [ ] All existing tool tests pass

---

## Edge Cases & Gotchas

1. **Output validation failure**: If `executeStructured()` returns data that doesn't
   match `outputSchema`, the spec says "Servers MUST provide structured results that
   conform to this schema." We must return a tool execution error (isError: true), NOT
   a protocol error. This lets the LLM understand the tool failed and potentially retry.

2. **Zod schema reuse**: Input schemas require `.describe()` on all fields. Output
   schemas do NOT have this requirement. The shared converter must handle both cases.
   Add a `requireDescriptions: boolean` parameter.

3. **Large structured content**: JSON serialization of very large objects may be slow.
   No framework-level limit, but document best practices.

4. **Backwards compat TextContent**: Per spec, "a tool that returns structured content
   SHOULD also return the serialized JSON in a TextContent block." Our auto-generation
   handles this, but tools that provide explicit `content` may choose not to include
   the JSON text — that's their choice.

5. **`execute()` vs `executeStructured()`**: If a tool defines `outputSchema` but only
   implements `execute()` (not `executeStructured()`), we should attempt to parse the
   result as structured content:
   - If `execute()` returns a string → try `JSON.parse()`, if valid object → use as structuredContent
   - If `execute()` returns an object → use directly as structuredContent
   - If parsing fails → return as unstructured content only (no structuredContent)

6. **Type inference**: Ideally, `executeStructured()` return type should be inferred
   from `outputSchema`'s Zod type. This requires a new type parameter:
   ```typescript
   abstract class MCPTool<TInput, TOutput> {
     protected outputSchema?: z.ZodObject<TOutput>;
     protected executeStructured?(input): Promise<{ structured: z.infer<TOutput> }>;
   }
   ```
   This adds a generic parameter which is a **breaking change** for TypeScript consumers
   (but not runtime). Consider making it optional with a default.

7. **SDK type compatibility**: The SDK's `CallToolResult` type in 1.29.0 likely includes
   `structuredContent`. If not, we need to cast or extend the type.

---

## Acceptance Criteria

- [ ] Tool authors can define `outputSchema` using Zod
- [ ] `tools/list` response includes `outputSchema` as JSON Schema
- [ ] `tools/call` response includes `structuredContent` for structured tools
- [ ] `structuredContent` is validated against `outputSchema` at runtime
- [ ] Invalid structured output → tool execution error (isError: true)
- [ ] Auto-generated TextContent for backwards compatibility
- [ ] Non-structured tools completely unaffected
- [ ] Updated types exported from package
