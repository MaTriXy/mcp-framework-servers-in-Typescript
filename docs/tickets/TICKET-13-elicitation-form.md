# TICKET-13: Elicitation (Form Mode)

**Priority:** P1 — High
**Phase:** 5 — Client Features
**Depends on:** TICKET-00
**Estimated scope:** Large
**Breaking change:** No (opt-in)

---

## Summary

Enable servers to request structured user input from the client via
`elicitation/create` (form mode). Tools can pause execution, ask the user a question
with a schema-validated form, and receive the response to continue processing.

---

## Checklist

### Type Definitions
- [ ] Define elicitation types:
      ```typescript
      interface ElicitationResult {
        action: 'accept' | 'decline' | 'cancel';
        content?: Record<string, unknown>;
      }

      // Supported primitive schemas for elicitation fields
      type ElicitationStringSchema = {
        type: 'string';
        title?: string;
        description?: string;
        minLength?: number;
        maxLength?: number;
        pattern?: string;
        format?: 'email' | 'uri' | 'date' | 'date-time';
        default?: string;
      };

      type ElicitationNumberSchema = {
        type: 'number' | 'integer';
        title?: string;
        description?: string;
        minimum?: number;
        maximum?: number;
        default?: number;
      };

      type ElicitationBooleanSchema = {
        type: 'boolean';
        title?: string;
        description?: string;
        default?: boolean;
      };

      type ElicitationEnumSchema = {
        type: 'string';
        title?: string;
        description?: string;
        enum?: string[];              // untitled single-select
        oneOf?: { const: string; title: string }[];  // titled single-select
        default?: string;
      };

      type ElicitationFieldSchema =
        | ElicitationStringSchema
        | ElicitationNumberSchema
        | ElicitationBooleanSchema
        | ElicitationEnumSchema;
      ```
- [ ] Export from `src/index.ts`

### MCPTool Changes (`src/tools/BaseTool.ts`)
- [ ] Add protected `elicit()` method:
      ```typescript
      protected async elicit(
        message: string,
        requestedSchema: {
          type: 'object';
          properties: Record<string, ElicitationFieldSchema>;
          required?: string[];
        }
      ): Promise<ElicitationResult> {
        if (!this.server) throw new Error('Server not injected');
        // Check client capabilities
        return this.server.request(
          { method: 'elicitation/create', params: { mode: 'form', message, requestedSchema } },
          ElicitationCreateResultSchema
        );
      }
      ```
- [ ] Add convenience overload for simple schemas:
      ```typescript
      protected async elicitText(message: string, fieldName: string): Promise<string | null>;
      protected async elicitChoice(message: string, fieldName: string, options: string[]): Promise<string | null>;
      ```

### Client Capability Check
- [ ] Before sending elicitation request, check if client declared `elicitation` capability
- [ ] If client doesn't support elicitation → throw descriptive error:
      `"Client does not support elicitation. Cannot request user input."`
- [ ] Check for form mode specifically: `capabilities.elicitation.form` or
      `capabilities.elicitation` (empty = form only, per spec)

### MCPServer Changes
- [ ] Store client capabilities from initialize response
- [ ] Expose `getClientCapabilities()` or pass capabilities to tools via injection

### Unit Tests (`tests/core/elicitation.test.ts`)
- [ ] `elicit()` sends correct request format
- [ ] User accepts → returns `{ action: 'accept', content: { ... } }`
- [ ] User declines → returns `{ action: 'decline' }`
- [ ] User cancels → returns `{ action: 'cancel' }`
- [ ] String field schema → correct JSON Schema output
- [ ] Number field schema → correct output
- [ ] Boolean field schema → correct output
- [ ] Enum field schema (untitled) → correct output with `enum` array
- [ ] Enum field schema (titled) → correct output with `oneOf`
- [ ] Required fields → included in `required` array
- [ ] Optional fields → not in `required`
- [ ] Default values → included in field schemas
- [ ] Client doesn't support elicitation → descriptive error thrown
- [ ] Nested/complex schema → rejected at call time (flat objects only)
- [ ] `elicitText()` convenience → returns string or null
- [ ] `elicitChoice()` convenience → returns selected option or null

### Schema Validation Tests
- [ ] Only flat object schemas accepted (no nested objects)
- [ ] No array properties except multi-select enums
- [ ] All primitive types work: string, number, integer, boolean
- [ ] Format field on strings: email, uri, date, date-time
- [ ] Pattern field on strings → passed through
- [ ] Min/max on numbers → passed through

### Integration Tests
- [ ] Full roundtrip: tool sends elicitation → mock client responds → tool receives
- [ ] Multiple elicitations in one tool execution → all work sequentially

### Backwards Compat
- [ ] Existing tools (don't call elicit) → unchanged
- [ ] Server without elicitation-using tools → no capability change
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Client may not support elicitation**: Always check capabilities first. If the
   client doesn't support it, the server should not send the request. Fail loudly and
   helpfully so tool authors know to handle this case.

2. **User interaction timeout**: Elicitation waits for human input. There's no timeout
   defined in the spec — the request blocks until the user responds. Don't add a
   timeout that's too aggressive. Consider documenting that tool authors should handle
   the `cancel` action gracefully.

3. **Sensitive data restriction**: Form mode MUST NOT request passwords, API keys, etc.
   We can't enforce this programmatically, but document it prominently with a JSDoc
   warning on the `elicit()` method.

4. **Flat schemas only**: The spec restricts elicitation schemas to flat objects with
   primitive properties. No nested objects, no arrays (except multi-select enums).
   Validate this at call time and throw a clear error if violated.

5. **Multi-select enums**: Arrays are allowed ONLY for multi-select enums. The schema
   looks different: `type: 'array'` with `items.enum` or `items.anyOf`. Handle this
   case in the schema builder.

6. **Default values**: All primitive types support `default`. Clients SHOULD pre-populate
   with defaults. Include them in the schema when provided.

7. **Elicitation during sampling**: If a tool calls `elicit()` during a sampling request
   chain, the elicitation is nested inside the sampling flow. This is valid per spec
   but complex to test.

8. **SDK request method**: We need to send a request FROM the server TO the client. This
   uses `server.request()` (not `server.setRequestHandler()`). Verify the SDK supports
   server→client requests for elicitation.

---

## Acceptance Criteria

- [ ] Tools can request user input via `this.elicit()`
- [ ] Form schemas with all primitive types work
- [ ] All three response actions handled (accept, decline, cancel)
- [ ] Client capability check prevents errors
- [ ] Flat-schema-only restriction enforced
- [ ] Types exported from package
- [ ] Convenience methods for common patterns
