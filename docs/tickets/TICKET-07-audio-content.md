# TICKET-07: Audio Content Type

**Priority:** P2 — Medium
**Phase:** 3 — New Content Types
**Depends on:** TICKET-06 (shared content type infrastructure)
**Estimated scope:** Small-Medium
**Breaking change:** No (additive type union)

---

## Summary

Support `type: "audio"` content blocks in tool results and sampling messages, with
base64-encoded audio data and MIME type, per MCP spec 2025-06-18.

---

## Checklist

### Type Definitions (`src/tools/BaseTool.ts`)
- [ ] Add `AudioContent` interface:
      ```typescript
      interface AudioContent {
        type: 'audio';
        data: string;        // base64-encoded
        mimeType: string;    // audio/wav, audio/mp3, audio/ogg, audio/mpeg, etc.
        annotations?: ContentAnnotations;  // from TICKET-09
      }
      ```
- [ ] Widen `ToolContent` union: `TextContent | ImageContent | AudioContent`
- [ ] Export `AudioContent` from `src/index.ts`

### BaseTool Updates (`src/tools/BaseTool.ts`)
- [ ] Add `isAudioContent()` type guard method (similar to `isImageContent` at line 523):
      ```typescript
      private isAudioContent(value: unknown): value is AudioContent {
        return typeof value === 'object' && value !== null
          && 'type' in value && (value as any).type === 'audio'
          && 'data' in value && typeof (value as any).data === 'string'
          && 'mimeType' in value && typeof (value as any).mimeType === 'string';
      }
      ```
- [ ] Update `isValidContent()` (line 547) to include audio check
- [ ] Update `createSuccessResponse()` (line 490) to handle AudioContent:
      - If result is AudioContent → return as-is (same pattern as ImageContent)
      - If result is array containing AudioContent items → include them

### Audio Validation (optional, new file `src/transports/utils/audio-handler.ts`)
- [ ] Define supported audio MIME types: `audio/wav`, `audio/mp3`, `audio/mpeg`,
      `audio/ogg`, `audio/webm`, `audio/flac`, `audio/aac`
- [ ] Validate base64 encoding (basic check: regex or Buffer.from attempt)
- [ ] Optional max size check (configurable, suggest 10MB default)
- [ ] Validation should warn, not reject (permissive by default)

### Sampling Support
- [ ] Verify SDK's `CreateMessageRequest` type accepts audio content in messages
- [ ] If not, extend the type in our sampling wrapper
- [ ] Update `MCPTool.samplingRequest()` to accept audio messages

### Unit Tests (`tests/tools/audio-content.test.ts`)
- [ ] AudioContent with valid base64 and MIME → recognized by `isAudioContent()`
- [ ] AudioContent with missing `data` → not recognized
- [ ] AudioContent with missing `mimeType` → not recognized
- [ ] AudioContent returned from `execute()` → included in tool response
- [ ] AudioContent in array with TextContent → both included
- [ ] `isValidContent()` recognizes audio type
- [ ] `createSuccessResponse()` handles audio return value
- [ ] Audio MIME type validation: `audio/wav` → valid
- [ ] Audio MIME type validation: `text/plain` → warning (not audio)
- [ ] Large audio content (>10MB) → configurable behavior

### Backwards Compat
- [ ] Existing tools returning text/image → unchanged
- [ ] `ToolContent` type widening doesn't break existing type consumers
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Base64 size**: Audio files are typically much larger than images. A 30-second WAV
   at 44.1kHz/16-bit is ~5MB raw, ~6.7MB base64. Consider documenting size limits.

2. **Streaming audio**: Base64-encoded audio is a snapshot, not streaming. For streaming
   audio, a different pattern would be needed (out of scope for this ticket).

3. **MIME type detection**: Don't auto-detect MIME type from data content. Require the
   developer to specify it explicitly.

4. **stdio transport**: Large base64 audio over stdio may cause buffer issues. The
   `StdioServerTransport` already handles large messages, but test with >5MB payloads.

5. **Sampling messages**: Audio content is valid in sampling `messages` for multimodal
   models. Ensure the type allows it in both directions.

6. **ContentAnnotations**: Audio content supports the same annotations as other types
   (audience, priority, lastModified). This depends on TICKET-09.

---

## Acceptance Criteria

- [ ] Tools can return `AudioContent` from `execute()`
- [ ] Audio content appears correctly in `tools/call` response
- [ ] `AudioContent` type exported from package
- [ ] Audio type guard works correctly
- [ ] No regressions in existing content handling
