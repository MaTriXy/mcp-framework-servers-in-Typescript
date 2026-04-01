# MCP Specification Compliance — Implementation Plan

**Created:** 2026-04-01
**Target Spec:** MCP 2025-11-25
**Current SDK:** @modelcontextprotocol/sdk@1.11.0 → target @1.29.0

---

## Table of Contents

1. [Execution Order & Dependency Graph](#execution-order--dependency-graph)
2. [Phase 0 — SDK Upgrade (Foundation)](#phase-0--sdk-upgrade)
3. [Phase 1 — Security Hardening](#phase-1--security-hardening)
4. [Phase 2 — Core Schema Evolution](#phase-2--core-schema-evolution)
5. [Phase 3 — New Content Types](#phase-3--new-content-types)
6. [Phase 4 — Protocol Utilities](#phase-4--protocol-utilities)
7. [Phase 5 — Client Features](#phase-5--client-features)
8. [Phase 6 — Advanced Features](#phase-6--advanced-features)
9. [Cross-Cutting Concerns](#cross-cutting-concerns)
10. [Test Strategy](#test-strategy)

---

## Execution Order & Dependency Graph

```
Phase 0: SDK Upgrade ─────────────────────────────────────────────┐
         │                                                        │
Phase 1: ├─ TICKET-01: Origin Validation                          │
         ├─ TICKET-02: Protocol Version Header                    │
         ├─ TICKET-03: Localhost Binding Default                   │
         │                                                        │
Phase 2: ├─ TICKET-04: Title & Icons on Tools/Resources/Prompts   │ (depends on Phase 0)
         ├─ TICKET-05: Tool Annotations                           │ (depends on Phase 0)
         ├─ TICKET-06: Structured Content & Output Schemas        │ (depends on Phase 0)
         │                                                        │
Phase 3: ├─ TICKET-07: Audio Content Type                         │ (depends on TICKET-06)
         ├─ TICKET-08: Resource Links & Embedded Resources        │ (depends on TICKET-06)
         ├─ TICKET-09: Content Annotations                        │ (depends on TICKET-06)
         │                                                        │
Phase 4: ├─ TICKET-10: Logging Protocol                           │ (independent)
         ├─ TICKET-11: Progress Tracking                          │ (independent)
         ├─ TICKET-12: Cancellation                               │ (independent)
         │                                                        │
Phase 5: ├─ TICKET-13: Elicitation (Form Mode)                    │ (depends on Phase 0)
         ├─ TICKET-14: Roots Support                              │ (depends on Phase 0)
         ├─ TICKET-15: Sampling with Tools                        │ (depends on Phase 0)
         │                                                        │
Phase 6: ├─ TICKET-16: Tasks (Experimental)                       │ (depends on Phases 0-4)
         └─ TICKET-17: Elicitation URL Mode                       │ (depends on TICKET-13)
```

**Critical path:** Phase 0 → Phase 1 → Phase 2 → Phases 3-5 (parallel) → Phase 6

---

## Phase 0 — SDK Upgrade

### TICKET-00: Upgrade @modelcontextprotocol/sdk from 1.11.0 to ^1.29.0

This is the **foundation for everything else**. The SDK upgrade likely brings new type
definitions, schema exports, and transport improvements that subsequent tickets depend on.

#### Approach

1. Bump `@modelcontextprotocol/sdk` in `package.json` peerDependencies and devDependencies
2. Run `npm install` and fix any immediate build errors
3. Audit breaking changes between 1.11.0 → 1.29.0:
   - Check if `Server` constructor API changed
   - Check if schema imports (`ListToolsRequestSchema`, etc.) moved or renamed
   - Check if `StreamableHTTPServerTransport` gained new options/signatures
   - Check if `StdioServerTransport` changed
4. Update any internal type references that no longer compile
5. Run full test suite, fix regressions

#### Gotchas & Edge Cases

- **Peer dependency range**: Currently `^1.11.0`. Widening to `^1.11.0 || ^1.29.0`
  breaks semver for users pinned to 1.11.x. Instead, bump to `^1.29.0` but document in
  CHANGELOG as a **breaking change** for the next major release. Alternatively, keep
  `^1.11.0` as floor and test both extremes.
- **SDK may have renamed exports**: Between 18 minor versions, internal SDK types likely
  evolved. Grep all imports from `@modelcontextprotocol/sdk` and verify each still exists.
- **SDK may now handle features we plan to add**: e.g., the SDK's
  `StreamableHTTPServerTransport` may already support Origin validation or
  `MCP-Protocol-Version` header. Check before reimplementing.
- **Schema type widening**: The SDK's `Tool` type may now include `title`, `icons`,
  `annotations`, `outputSchema`, `execution`. Our `ToolProtocol` interface and
  `toolDefinition` getter must be updated to match, but remain optional for backwards
  compat.
- **Node.js version**: The latest SDK may require Node 18+ (we already require this).

#### Backwards Compatibility

- Users on SDK 1.11.x will need to upgrade. This is a **breaking change**.
- Mitigation: release as a new **minor** or **major** version of mcp-framework.
- All existing tool/prompt/resource classes remain functional — new fields are optional.

#### Tests

- **Unit**: Ensure all 57 existing test files pass after upgrade.
- **Smoke**: Start a server with stdio, SSE, and HTTP stream transports and verify
  `initialize` handshake completes.
- **Compat**: Verify a project built with the old SDK can still communicate with a server
  running the new SDK (JSON-RPC is version-negotiated).

---

## Phase 1 — Security Hardening

### TICKET-01: Origin Header Validation (DNS Rebinding Protection)

**Spec requirement (2025-11-25):** Servers MUST validate the `Origin` header on all
Streamable HTTP requests. Invalid origin → HTTP 403 Forbidden.

#### Current State

- Both HTTP Stream and SSE transports use raw `http.createServer()`
- CORS `allowOrigin` is hardcoded to `"*"` in `DEFAULT_CORS_CONFIG`
- No Origin header inspection anywhere in request flow

#### Design

Add an `allowedOrigins` config field to transport options. When set:
1. On every incoming request, read the `Origin` header
2. If `Origin` is present and NOT in `allowedOrigins` list → respond 403
3. If `Origin` is absent (e.g., same-origin or non-browser), allow through
4. The CORS `Access-Control-Allow-Origin` header should reflect the validated origin
   (not wildcard) when `allowedOrigins` is configured

When NOT set (default): maintain current wildcard behavior for backwards compat, but log
a warning on first request from a non-localhost origin.

#### Files to Modify

- `src/transports/sse/types.ts` — add `allowedOrigins?: string[]` to CORSConfig
- `src/transports/http/server.ts` — add origin validation before auth check (~line 62)
- `src/transports/sse/server.ts` — add origin validation before auth check (~line 100)
- `src/transports/utils/` — extract shared `validateOrigin()` helper

#### Edge Cases & Gotchas

- **Origin header is optional**: Non-browser clients (curl, SDKs) don't send it. MUST
  NOT reject requests without an Origin header.
- **null Origin**: Some privacy modes send `Origin: null`. This should be rejected when
  `allowedOrigins` is configured (it's a common attack vector).
- **Port matching**: `http://localhost:3000` ≠ `http://localhost:8080`. The full origin
  (scheme + host + port) must match.
- **Case sensitivity**: Origins should be compared case-insensitively for the host part.
- **Preflight (OPTIONS)**: Origin validation must also apply to preflight requests.
- **SSE GET endpoint**: The SSE transport's GET `/sse` endpoint must also validate Origin.
- **Backwards compat**: Default `allowedOrigins: undefined` means no validation (current
  behavior). This is intentional — breaking existing setups would be worse than the
  security risk for local-only servers.

#### Tests

**Unit tests** (`tests/transports/origin-validation.test.ts`):
- Request with valid Origin → 200
- Request with invalid Origin → 403 with JSON-RPC error body
- Request with no Origin header → 200 (non-browser client)
- Request with `Origin: null` → 403 when allowedOrigins set
- Request with Origin port mismatch → 403
- Preflight OPTIONS with invalid Origin → 403
- Default config (no allowedOrigins) → all origins allowed

**Acceptance tests**:
- Start HTTP stream server with `allowedOrigins: ['http://localhost:3000']`
- POST from matching origin → succeeds
- POST from `http://evil.com` → 403
- SSE GET from `http://evil.com` → 403

---

### TICKET-02: MCP-Protocol-Version Header Support

**Spec requirement (2025-11-25):** Clients MUST include `MCP-Protocol-Version` header
on all HTTP requests. Servers MUST return 400 for invalid/unsupported versions.

#### Design

1. After initialization, the negotiated protocol version is known
2. On every subsequent HTTP request, read `MCP-Protocol-Version` header
3. If present and doesn't match negotiated version → 400 Bad Request
4. If absent → assume `2025-03-26` for backwards compat (per spec)
5. If server has no negotiated version yet (pre-init) → skip check

#### Files to Modify

- `src/transports/http/server.ts` — add header check in request handler
- `src/transports/sse/server.ts` — add header check (SSE is legacy but still used)

#### Edge Cases & Gotchas

- **InitializeRequest itself**: The first request has no prior negotiation. Don't
  validate the header on the initialize request.
- **Multiple concurrent sessions**: Each session may have negotiated a different version.
  Validate against the session's negotiated version, not a global value.
- **Header presence vs value**: Missing header defaults to `2025-03-26` per spec.
  Don't reject missing headers — that breaks all current clients.
- **SDK may already handle this**: Check if `StreamableHTTPServerTransport` in SDK 1.29.0
  already validates this header. If so, this ticket becomes a no-op.

#### Tests

**Unit tests** (`tests/transports/protocol-version-header.test.ts`):
- Request with correct version header → processed normally
- Request with wrong version header → 400
- Request with no version header → processed (defaults to 2025-03-26)
- Initialize request without header → accepted
- Two sessions with different versions → each validated independently

---

### TICKET-03: Localhost Binding Default

**Spec recommendation (2025-11-25):** Local servers SHOULD bind to `127.0.0.1` only.

#### Current State

- `src/transports/http/server.ts` line 108: `this._server.listen(this._port)` — binds
  to `0.0.0.0`
- `src/transports/sse/server.ts` line 100: same pattern

#### Design

Add a `host` config option to both transports. Default to `'127.0.0.1'`.

```typescript
// Before:
this._server.listen(this._port)

// After:
this._server.listen(this._port, this._config.host ?? '127.0.0.1')
```

#### Backwards Compatibility — THIS IS A BREAKING CHANGE

Users who rely on the server being accessible from other machines will break. Mitigations:
1. **Option A (recommended)**: Default to `127.0.0.1` and document the change prominently
   in the CHANGELOG. Users who need `0.0.0.0` can set `host: '0.0.0.0'` explicitly.
2. **Option B (safer)**: Default to `0.0.0.0` still but log a security warning.
   Less spec-compliant but non-breaking.

Recommend **Option A** in a major version bump, **Option B** in a minor version.

#### Edge Cases & Gotchas

- **Docker / containers**: Containerized servers MUST bind to `0.0.0.0` to be reachable.
  The `host` config field makes this easy, but it's a common footgun.
- **IPv6**: `::1` is the IPv6 localhost equivalent. Consider accepting `'localhost'` and
  letting Node resolve it (which may prefer IPv6 on some systems).
- **Tests**: All transport integration tests that start real HTTP servers will need to
  connect to `127.0.0.1` explicitly, not `localhost` (which may resolve differently).

#### Tests

**Unit tests** (`tests/transports/host-binding.test.ts`):
- Default config → server listening on 127.0.0.1
- Explicit `host: '0.0.0.0'` → server listening on all interfaces
- Explicit `host: '127.0.0.1'` → only localhost
- Connection from non-localhost IP to 127.0.0.1-bound server → refused

---

## Phase 2 — Core Schema Evolution

### TICKET-04: Title & Icons on Tools, Resources, and Prompts

**Spec requirement (2025-11-25):** All entities support optional `title` (display name)
and `icons` (array of icon objects) fields.

#### Current State

- `ToolProtocol.toolDefinition` returns `{ name, description, inputSchema }` — no title/icons
- `PromptProtocol.promptDefinition` returns `{ name, description, arguments }` — no title/icons
- `ResourceProtocol.resourceDefinition` returns `{ uri, name, description, mimeType }` — no title/icons
- `ResourceTemplateDefinition` has `{ uriTemplate, name, description, mimeType }` — no title/icons

#### Design

Add optional `title` and `icons` properties to all base classes and protocol interfaces.
These flow through to the definition getters and are returned in `list` responses.

```typescript
// Icon type (new file: src/types/icon.ts or added to existing types)
interface MCPIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
}

// On MCPTool:
protected title?: string;
protected icons?: MCPIcon[];

// toolDefinition getter becomes:
get toolDefinition() {
  return {
    name: this.name,
    description: this.description,
    inputSchema: this.inputSchema,
    ...(this.title && { title: this.title }),
    ...(this.icons && { icons: this.icons }),
  };
}
```

Same pattern for prompts, resources, and resource templates.

#### Backwards Compatibility

- Fully backwards compatible. All new fields are optional.
- Existing tool/prompt/resource subclasses don't define these properties → they're
  simply absent from the definition, which is valid.
- No existing tests should break.

#### Edge Cases & Gotchas

- **Icon URL validation**: Should we validate that `src` is a valid URL? The spec
  doesn't mandate it, but invalid URLs will cause client-side errors. Recommend:
  validate at startup, log warning, don't reject.
- **Icon data URIs**: `src` could be a `data:image/png;base64,...` URI. Allow these.
- **Empty arrays**: `icons: []` is technically valid but useless. Don't emit it.
- **Title vs name**: `title` is for display, `name` is the programmatic identifier.
  `title` should NOT be used for tool dispatch. Ensure handlers still use `name`.
- **Resource `size` field**: The spec also added an optional `size` (bytes) field to
  resources. Include this in the same ticket.

#### Tests

**Unit tests** (`tests/tools/tool-metadata.test.ts`):
- Tool with title → included in toolDefinition
- Tool without title → not present in toolDefinition (not null, not undefined key)
- Tool with icons → included in toolDefinition
- Tool with empty icons array → not included
- Icons with various src formats (URL, data URI) → accepted
- Prompt with title/icons → included in promptDefinition
- Resource with title/icons/size → included in resourceDefinition
- ResourceTemplate with title/icons → included in templateDefinition

**Acceptance tests**:
- `tools/list` response includes title and icons when set
- `prompts/list` response includes title and icons when set
- `resources/list` response includes title, icons, and size when set
- `resources/templates/list` response includes title and icons when set

---

### TICKET-05: Tool Annotations

**Spec requirement (2025-06-18):** Tools MAY include an `annotations` object with
behavioral hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.

#### Design

Add an optional `annotations` property to `MCPTool`:

```typescript
interface ToolAnnotations {
  title?: string;           // Note: also a top-level field; annotations.title is legacy
  readOnlyHint?: boolean;   // default: false
  destructiveHint?: boolean; // default: true
  idempotentHint?: boolean;  // default: false
  openWorldHint?: boolean;   // default: true
}

abstract class MCPTool {
  protected annotations?: ToolAnnotations;

  get toolDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
      ...(this.annotations && { annotations: this.annotations }),
    };
  }
}
```

#### Backwards Compatibility

- Fully backwards compatible. Annotations are optional.
- Clients that don't understand annotations simply ignore them (per spec).

#### Edge Cases & Gotchas

- **Annotations are UNTRUSTED**: The spec says clients MUST consider annotations
  untrusted unless from trusted servers. This is a client-side concern, but document it.
- **Default values matter**: The spec defines defaults (destructiveHint defaults to
  `true`). Don't emit the default values — only emit non-default values to reduce noise.
  Actually, on reflection, emit whatever the user sets. The framework shouldn't
  second-guess what the developer intended.
- **`annotations.title` vs top-level `title`**: The spec has both. Top-level `title`
  takes precedence per spec. We should support both but recommend top-level.
- **No runtime enforcement**: Annotations are hints. A tool declaring `readOnlyHint:
  true` can still write data. The framework should NOT enforce these at runtime.

#### Tests

**Unit tests** (`tests/tools/tool-annotations.test.ts`):
- Tool with all annotations set → all included in definition
- Tool with partial annotations → only set ones included
- Tool with no annotations → field absent
- Annotations with all defaults → still included (we don't strip defaults)
- Verify annotations don't affect tool execution behavior

---

### TICKET-06: Structured Content & Output Schemas

**Spec requirement (2025-06-18):** Tools MAY declare `outputSchema` and return
`structuredContent` alongside unstructured `content`.

This is the **largest single change** to the tool system.

#### Current State

- `MCPTool.execute()` returns `string | ToolContent | ToolContent[]`
- `createSuccessResponse()` wraps everything in `{ content: ToolContent[], isError }`
- No concept of structured output

#### Design

**New type for structured tools:**

```typescript
interface StructuredToolResponse<T = Record<string, unknown>> {
  content: ToolContent[];        // Unstructured (backwards compat)
  structuredContent?: T;         // Structured JSON
  isError?: boolean;
}
```

**New optional property on MCPTool:**

```typescript
abstract class MCPTool {
  protected outputSchema?: z.ZodObject<any>;  // Zod schema for output, converted to JSON Schema

  // New method for structured tools (optional override)
  protected async executeStructured(input: MCPInput<this>): Promise<{
    structured: Record<string, unknown>;
    content?: ToolContent[];  // If omitted, auto-generate text content from structured
  }>;
}
```

**Updated toolDefinition getter:**

```typescript
get toolDefinition() {
  return {
    name: this.name,
    description: this.description,
    inputSchema: this.inputSchema,
    ...(this.outputSchema && {
      outputSchema: this.generateOutputSchema()
    }),
  };
}
```

**Updated toolCall():**

```typescript
async toolCall(request) {
  const args = request.params.arguments;
  const validatedInput = this.validateInput(args);

  if (this.outputSchema && this.executeStructured) {
    const result = await this.executeStructured(validatedInput);
    const structured = this.outputSchema.parse(result.structured); // validate
    const content = result.content ?? [{
      type: 'text',
      text: JSON.stringify(structured)
    }];
    return { content, structuredContent: structured, isError: false };
  }

  // Existing path for unstructured tools
  const result = await this.execute(validatedInput);
  return this.createSuccessResponse(result);
}
```

#### Backwards Compatibility

- **Fully backwards compatible**: Existing tools don't define `outputSchema` or
  `executeStructured`, so they follow the existing code path.
- **Spec requires backwards-compat text**: "a tool that returns structured content
  SHOULD also return the serialized JSON in a TextContent block." Our auto-generation
  handles this.
- The `ToolResponse` type returned by `toolCall()` must be widened to include
  `structuredContent?`. Check if the SDK's types already include this.

#### Edge Cases & Gotchas

- **Output validation failure**: If `executeStructured` returns data that doesn't match
  `outputSchema`, we MUST fail (spec says "Servers MUST provide structured results that
  conform to this schema"). Throw a tool execution error, not a protocol error.
- **Empty structured content**: `structuredContent: {}` is valid if schema allows it.
- **Zod-to-JSON-Schema conversion**: We already have `generateSchemaFromZodObject()` for
  input schemas. Reuse it for output schemas. But output schemas may use types we don't
  support yet (arrays at top level, unions). Audit the converter.
- **Large structured output**: No size limit in spec, but practically, very large JSON
  objects may cause issues with transport framing. Consider documenting limits.
- **Error case**: When `isError: true`, `structuredContent` should NOT be present (the
  tool failed, there's no valid output). Enforce this.
- **Mixed usage**: A tool can return BOTH `content` (unstructured) and
  `structuredContent` (structured). They serve different audiences (human vs machine).

#### Tests

**Unit tests** (`tests/tools/structured-content.test.ts`):
- Tool with outputSchema → included in toolDefinition
- Tool without outputSchema → field absent from definition
- executeStructured returns valid data → structuredContent in response
- executeStructured returns invalid data → tool execution error (isError: true)
- executeStructured with no content → auto-generated TextContent from JSON
- executeStructured with explicit content → both present
- Tool with outputSchema but no executeStructured → error/fallback
- outputSchema Zod→JSON Schema conversion works for common types
- Error response → no structuredContent field

**Acceptance tests**:
- Call tool with outputSchema → response has both content and structuredContent
- structuredContent matches declared outputSchema
- Client can parse structuredContent as JSON object

---

## Phase 3 — New Content Types

### TICKET-07: Audio Content Type

**Spec requirement (2025-06-18):** `type: "audio"` content with base64 data and MIME type.

#### Current State

- `ToolContent` is `TextContent | ImageContent` (BaseTool.ts line 36)
- `isValidContent()` only checks for text and image types

#### Design

Add `AudioContent` alongside existing types:

```typescript
interface AudioContent {
  type: 'audio';
  data: string;      // base64-encoded
  mimeType: string;  // audio/wav, audio/mp3, etc.
  annotations?: ContentAnnotations;
}

type ToolContent = TextContent | ImageContent | AudioContent;
```

Update `isValidContent()` and `createSuccessResponse()` in BaseTool.ts to handle audio.

#### Edge Cases & Gotchas

- **No audio validation**: Unlike images where we have `image-handler.ts` with format
  checks and size limits, we need equivalent audio validation (or at minimum, MIME type
  validation).
- **Size**: Audio files can be very large. Consider a configurable max size.
- **Sampling messages**: Audio content is also valid in sampling `messages`. Update the
  sampling types too (TICKET-15 dependency).

#### Tests

- Audio content with valid base64 and MIME → accepted
- Audio content with invalid base64 → rejected
- Audio content recognized by isValidContent()
- Audio content serialized correctly in tool response
- Large audio content (>5MB) → configurable limit

---

### TICKET-08: Resource Links & Embedded Resources in Tool Results

**Spec requirement (2025-06-18):** Tools MAY return `type: "resource_link"` and
`type: "resource"` (embedded) content blocks.

#### Design

```typescript
interface ResourceLink {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: ContentAnnotations;
}

interface EmbeddedResource {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    annotations?: ContentAnnotations;
  };
}

type ToolContent = TextContent | ImageContent | AudioContent | ResourceLink | EmbeddedResource;
```

#### Edge Cases

- Resource links returned by tools are NOT guaranteed to appear in `resources/list`.
- Embedded resources should have either `text` or `blob`, not both.
- URI validation — should be a valid URI per RFC 3986.

---

### TICKET-09: Content Annotations

**Spec requirement (2025-06-18):** All content types support optional `annotations`
with `audience`, `priority`, and `lastModified`.

```typescript
interface ContentAnnotations {
  audience?: ('user' | 'assistant')[];
  priority?: number;        // 0.0 to 1.0
  lastModified?: string;    // ISO 8601
}
```

This is a cross-cutting change that touches TextContent, ImageContent, AudioContent,
ResourceLink, and EmbeddedResource.

#### Gotchas

- **Priority range**: Must be 0.0-1.0. Validate at construction time, warn on out-of-range.
- **lastModified format**: Must be ISO 8601. Use `new Date().toISOString()`.
- **audience empty array**: `audience: []` is ambiguous. Treat same as absent.

---

## Phase 4 — Protocol Utilities

### TICKET-10: Logging Protocol

**Spec requirement (2024-11-05):** Servers MAY declare `logging` capability, handle
`logging/setLevel`, and send `notifications/message`.

#### Current State

The framework has an internal `Logger` (src/core/Logger.ts) that writes to files and
stderr. There is NO protocol-level logging — the server never sends log messages to
clients and doesn't handle `logging/setLevel`.

#### Design

1. Declare `logging: {}` capability in MCPServer when enabled
2. Register handler for `logging/setLevel` that stores the current level
3. Expose a `sendLogMessage(level, logger, data)` method on MCPServer
4. Bridge the internal Logger to also emit protocol notifications when level meets threshold
5. Expose log sending to tools via the injected server instance

```typescript
// MCPServer additions:
private currentLogLevel: LogLevel = 'info';

// Handler:
server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  this.currentLogLevel = request.params.level;
  return {};
});

// Public method for tools:
public async sendLog(level: LogLevel, logger: string, data: unknown) {
  if (severityOf(level) >= severityOf(this.currentLogLevel)) {
    await this.server.sendNotification('notifications/message', {
      level, logger, data
    });
  }
}
```

#### Edge Cases & Gotchas

- **Log level ordering**: Must follow RFC 5424 severity: debug < info < notice <
  warning < error < critical < alert < emergency. Our internal logger uses a subset.
- **Sensitive data**: Logs MUST NOT contain credentials or PII. Document this for users.
- **Rate limiting**: A tool that logs in a tight loop could flood the client. Consider
  rate limiting notifications.
- **stdio transport**: Log notifications go over the protocol, NOT to stderr. This is
  different from the internal logger which uses stderr. Don't mix them up.
- **No logging capability**: If server doesn't declare logging, `logging/setLevel`
  should return an error.

#### Tests

**Unit tests** (`tests/core/logging-protocol.test.ts`):
- setLevel to 'error' → only error+ messages sent
- setLevel to 'debug' → all messages sent
- sendLog below threshold → no notification sent
- sendLog at threshold → notification sent with correct format
- Log level ordering is correct (all 8 levels)
- Invalid log level in setLevel → error response

**Acceptance tests**:
- Client sends `logging/setLevel` → server accepts
- Tool sends log → client receives notification
- Log level filtering works end-to-end

---

### TICKET-11: Progress Tracking

**Spec requirement (2024-11-05):** Requests MAY include `progressToken` in `_meta`.
Receiver MAY send `notifications/progress` with progress/total/message.

#### Design

1. Extract `progressToken` from `_meta` in tool call requests
2. Pass it to the tool's `execute()` method (or make it available via a helper)
3. Tools can call `this.reportProgress(progress, total?, message?)` during execution
4. The framework sends `notifications/progress` with the token

```typescript
// MCPTool addition:
protected async reportProgress(
  progress: number,
  total?: number,
  message?: string
): Promise<void> {
  if (this._currentProgressToken && this.server) {
    await this.server.sendNotification('notifications/progress', {
      progressToken: this._currentProgressToken,
      progress, total, message
    });
  }
}
```

#### Edge Cases & Gotchas

- **Progress must increase**: Each notification's `progress` value MUST be greater than
  the previous. Don't enforce this in the framework (too restrictive), but document it.
- **No progressToken**: If the client doesn't send one, `reportProgress` is a no-op.
- **Floating point**: progress and total MAY be floating point.
- **Token uniqueness**: Tokens are unique per active request. Don't reuse across calls.
- **Concurrent tool calls**: Each call has its own token. Must be stored per-invocation,
  not per-tool-instance. Use a parameter or async-local-storage pattern.

#### Tests

- Tool reports progress → notification sent with correct token
- No progressToken in request → reportProgress is no-op
- Multiple concurrent tools → each uses correct token
- Progress values are forwarded correctly

---

### TICKET-12: Cancellation Support

**Spec requirement (2024-11-05):** Either side MAY send `notifications/cancelled` with
the request ID and optional reason.

#### Design

1. Listen for `notifications/cancelled` on the server
2. Maintain a map of in-flight request IDs → AbortControllers
3. When cancellation is received, abort the corresponding controller
4. Tools receive an AbortSignal they can check during long operations

```typescript
// MCPTool addition:
protected get abortSignal(): AbortSignal | undefined {
  return this._currentAbortController?.signal;
}
```

#### Edge Cases & Gotchas

- **Race conditions**: Cancellation may arrive after the tool has already completed.
  Handle gracefully (ignore).
- **initialize MUST NOT be cancelled**: Per spec.
- **Tasks use different cancellation**: `tasks/cancel` instead of `notifications/cancelled`.
  This is a separate mechanism (TICKET-16).
- **Cleanup**: Tools should handle AbortError gracefully and clean up resources.
- **No response for cancelled requests**: Spec says receivers SHOULD NOT send a
  response for cancelled requests. This means the SDK's response handling needs to be
  aware.

#### Tests

- Cancel in-flight tool → tool execution stopped (AbortSignal fires)
- Cancel unknown request ID → ignored
- Cancel already-completed request → ignored
- Initialize request → cannot be cancelled

---

## Phase 5 — Client Features

### TICKET-13: Elicitation (Form Mode)

**Spec requirement (2025-06-18):** Servers can send `elicitation/create` to request
structured user input from the client.

#### Design

Expose a method on MCPTool (and potentially MCPServer) that tools can call:

```typescript
// MCPTool addition:
protected async elicit(
  message: string,
  schema: Record<string, ElicitationFieldSchema>
): Promise<ElicitationResult> {
  return this.server.sendRequest('elicitation/create', {
    mode: 'form',
    message,
    requestedSchema: {
      type: 'object',
      properties: schema,
      required: Object.entries(schema)
        .filter(([_, v]) => v.required)
        .map(([k]) => k),
    }
  });
}
```

#### Edge Cases & Gotchas

- **Client may not support it**: Check `clientCapabilities.elicitation` before sending.
  If not supported, throw a descriptive error.
- **User may decline or cancel**: Handle all three actions: accept, decline, cancel.
- **Schema restrictions**: Only flat objects with primitive properties. No nested objects,
  no arrays (except enum multi-select). Validate this at call time.
- **Sensitive data**: MUST NOT request passwords, API keys, etc. via form mode. Document
  this prominently.
- **Timeout**: Client may take a long time to respond (waiting for human input). Don't
  timeout elicitation requests.

#### Tests

- Elicit with string field → client receives request with correct schema
- Elicit with enum field → client receives oneOf/enum schema
- User accepts → tool receives content
- User declines → tool receives decline action
- User cancels → tool receives cancel action
- Client doesn't support elicitation → descriptive error
- Nested schema → rejected at call time

---

### TICKET-14: Roots Support

**Spec requirement (2024-11-05):** Servers can call `roots/list` to discover filesystem
boundaries the client exposes.

#### Design

Expose a method on MCPServer that tools can use:

```typescript
public async listRoots(): Promise<Root[]> {
  return this.server.sendRequest('roots/list', {});
}
```

Register a notification handler for `notifications/roots/list_changed` to update cached
roots.

#### Edge Cases

- **Client may not support roots**: Check capabilities first.
- **Roots change mid-session**: Listen for `list_changed` notification and invalidate cache.
- **Empty roots**: Valid — means no filesystem boundaries defined.

---

### TICKET-15: Sampling with Tools

**Spec requirement (2025-11-25):** Sampling requests can include `tools` array and
`toolChoice` parameter for LLM tool use during sampling.

#### Current State

`MCPTool.samplingRequest()` sends `sampling/createMessage` but doesn't support `tools`
or `toolChoice` parameters.

#### Design

Extend the sampling request parameters:

```typescript
protected async samplingRequest(
  params: CreateMessageRequest['params'] & {
    tools?: SamplingTool[];
    toolChoice?: { mode: 'auto' | 'required' | 'none' };
  }
): Promise<CreateMessageResult> {
  // Check client capabilities for sampling.tools
  return this.server.createMessage(params);
}
```

#### Edge Cases

- **Client may not support sampling.tools**: Check capability before including tools.
- **Multi-turn tool loops**: When stopReason is `"toolUse"`, the server must execute
  the tools and send another sampling request with results. This loop logic is complex.
- **Tool result message constraints**: User messages with tool results MUST contain ONLY
  tool results — no mixing with text content.

---

## Phase 6 — Advanced Features

### TICKET-16: Tasks (Experimental)

**Spec version: 2025-11-25 (experimental)**

Tasks enable durable async execution with polling and deferred result retrieval.
This is the most complex feature and should be implemented last.

#### High-Level Design

1. Declare `tasks` capability with supported request types
2. Add `execution.taskSupport` to tool definitions
3. When a tool call includes `task` in params:
   - Return `CreateTaskResult` immediately
   - Execute tool in background
   - Track task state machine (working → completed/failed/cancelled)
4. Implement `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel` handlers
5. Implement `notifications/tasks/status` for status change notifications

#### This is intentionally deferred — see separate ticket for full design.

---

### TICKET-17: Elicitation URL Mode

**Spec version: 2025-11-25**

Depends on TICKET-13 (form mode). Adds URL-based out-of-band elicitation for sensitive
data (passwords, OAuth flows, payments).

#### This is intentionally deferred — see separate ticket for full design.

---

## Cross-Cutting Concerns

### Backwards Compatibility Strategy

| Change | Strategy |
|--------|----------|
| SDK upgrade | Breaking — requires major/minor version bump |
| New optional properties (title, icons, annotations) | Non-breaking — absent if not set |
| Structured content | Non-breaking — opt-in via outputSchema |
| New content types (audio, resource_link, resource) | Non-breaking — additive type union |
| Origin validation | Non-breaking — off by default |
| Localhost binding | Breaking if defaulted to 127.0.0.1 |
| Logging protocol | Non-breaking — capability opt-in |
| Progress/cancellation | Non-breaking — no-op if client doesn't request |
| Elicitation | Non-breaking — opt-in, fails gracefully if client lacks capability |

### Export Surface

All new types MUST be exported from `src/index.ts`:
- `MCPIcon`, `ToolAnnotations`, `ContentAnnotations`
- `AudioContent`, `ResourceLink`, `EmbeddedResource`
- `ElicitationResult`, `ElicitationFieldSchema`
- Updated `ToolContent` type
- Updated `ToolResponse` type (with `structuredContent`)

### Documentation Updates

Each ticket must update:
1. The relevant doc in `docs/`
2. The CLAUDE.md architecture section
3. JSDoc on the affected classes/methods
4. The docs site (mcp-framework-docs repo)

---

## Test Strategy

### Unit Test Coverage Targets

| Area | Files | Min Coverage |
|------|-------|-------------|
| Tool annotations | tests/tools/tool-annotations.test.ts | 100% of annotation paths |
| Structured content | tests/tools/structured-content.test.ts | 100% of new paths |
| Content types | tests/tools/content-types.test.ts | All new types |
| Title/icons | tests/tools/tool-metadata.test.ts | All entities |
| Origin validation | tests/transports/origin-validation.test.ts | All origin scenarios |
| Protocol version | tests/transports/protocol-version.test.ts | All header scenarios |
| Host binding | tests/transports/host-binding.test.ts | Both bind modes |
| Logging protocol | tests/core/logging-protocol.test.ts | Level filtering |
| Progress | tests/core/progress.test.ts | Token lifecycle |
| Cancellation | tests/core/cancellation.test.ts | Race conditions |
| Elicitation | tests/core/elicitation.test.ts | All actions |
| Roots | tests/core/roots.test.ts | List + notifications |

### E2E / Acceptance Tests

For each phase, an e2e test that:
1. Starts a server with the new features configured
2. Connects a client
3. Exercises the feature end-to-end
4. Verifies the protocol messages are spec-compliant

### Regression Tests

- All 57 existing tests must continue to pass after each phase
- Compat tests (ticket-001 through ticket-017) must continue to pass
- E2E tests must continue to pass

### Test Execution Order

```
npm test                    # All unit + compat tests
npm run test:e2e            # E2E integration tests (if separate)
npm run test:coverage       # Full coverage report
```
