# TICKET-15: Sampling with Tools

**Priority:** P2 — Medium
**Phase:** 5 — Client Features
**Depends on:** TICKET-00
**Estimated scope:** Medium-Large
**Breaking change:** No (extends existing sampling API)

---

## Summary

Extend the existing `samplingRequest()` method on MCPTool to support `tools` and
`toolChoice` parameters, enabling LLM tool use during server-initiated sampling, per
MCP spec 2025-11-25.

---

## Checklist

### Type Definitions
- [ ] Define sampling tool types:
      ```typescript
      interface SamplingTool {
        name: string;
        description?: string;
        inputSchema: Record<string, unknown>;  // JSON Schema
      }

      interface SamplingToolChoice {
        mode: 'auto' | 'required' | 'none';
      }
      ```
- [ ] Define new content types for sampling:
      ```typescript
      interface ToolUseContent {
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, unknown>;
      }

      interface ToolResultContent {
        type: 'tool_result';
        toolUseId: string;
        content: Array<TextContent | ImageContent | AudioContent>;
        isError?: boolean;
      }
      ```
- [ ] Export from `src/index.ts`

### MCPTool Changes (`src/tools/BaseTool.ts`)
- [ ] Extend `samplingRequest()` to accept new parameters:
      ```typescript
      protected async samplingRequest(params: {
        messages: SamplingMessage[];
        tools?: SamplingTool[];
        toolChoice?: SamplingToolChoice;
        modelPreferences?: ModelPreferences;
        systemPrompt?: string;
        maxTokens: number;
      }): Promise<CreateMessageResult>
      ```
- [ ] Check client capabilities: `sampling.tools` before including tools
- [ ] Handle `stopReason: 'toolUse'` in response:
  - [ ] Add helper `handleToolUseResponse()` that:
    1. Extracts tool_use content blocks from response
    2. Returns them to the caller for execution
    3. Provides helper to build follow-up request with tool_result messages

### Multi-turn Tool Loop Helper (optional convenience)
- [ ] Add `samplingWithToolLoop()` helper:
      ```typescript
      protected async samplingWithToolLoop(params: {
        messages: SamplingMessage[];
        tools: SamplingTool[];
        toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>;
        maxIterations?: number;  // default 10
      }): Promise<CreateMessageResult>
      ```
- [ ] This helper manages the multi-turn loop automatically

### Message Constraint Enforcement
- [ ] Validate: tool result messages contain ONLY tool results (no mixing)
- [ ] Validate: every tool_use is matched by a tool_result with same ID
- [ ] Throw descriptive errors for constraint violations

### Unit Tests (`tests/tools/sampling-with-tools.test.ts`)
- [ ] Sampling request with tools → tools included in request
- [ ] Sampling request with toolChoice → included in request
- [ ] Client doesn't support sampling.tools → error thrown
- [ ] Response with stopReason 'toolUse' → tool_use content extracted
- [ ] Follow-up with tool results → correct message format
- [ ] Tool result message validation: only tool results → valid
- [ ] Tool result message validation: mixed content → rejected
- [ ] Tool use/result ID matching → validated
- [ ] Multi-turn loop: 2 iterations → both processed
- [ ] Multi-turn loop: max iterations reached → stops with toolChoice 'none'
- [ ] Audio content in sampling messages → accepted (spec allows it)

### Backwards Compat
- [ ] Existing `samplingRequest()` calls (no tools) → unchanged
- [ ] SDK's `CreateMessageResult` type supports tool_use content (verify)
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Client capability check**: Client must declare `sampling.tools` capability. Not
   just `sampling`. Check the nested capability.

2. **Tool result message constraint**: Messages containing tool_result MUST contain ONLY
   tool_result blocks. No text or other content mixed in. This is for cross-provider
   compatibility (OpenAI uses a separate "tool" role).

3. **Parallel tool use**: The LLM may return multiple tool_use blocks in one response.
   ALL must be resolved with matching tool_result blocks before the next message.

4. **Iteration limits**: A runaway tool loop could be expensive. The `maxIterations`
   parameter (default 10) prevents infinite loops. On the last iteration, set
   `toolChoice: { mode: 'none' }` to force a text response.

5. **stopReason values**: The response's `stopReason` can be:
   - `'endTurn'` — model finished
   - `'toolUse'` — model wants to call tools
   - `'maxTokens'` — hit token limit
   Only `'toolUse'` triggers the continuation loop.

6. **Tool execution in the loop**: The tool loop helper executes tools via a callback.
   These are NOT MCP tools — they're tools defined in the sampling request. The
   callback should be provided by the tool author.

---

## Acceptance Criteria

- [ ] Sampling requests can include tools and toolChoice
- [ ] Tool use responses correctly parsed
- [ ] Multi-turn tool loop works end-to-end
- [ ] Message constraints enforced
- [ ] Client capability check before sending
- [ ] Types exported from package
