# MCP Specification Compliance Audit

**Audit Date:** 2026-04-01
**Framework Version:** mcp-framework@0.2.19
**SDK Version (installed):** @modelcontextprotocol/sdk@1.11.0
**SDK Version (latest):** @modelcontextprotocol/sdk@1.29.0
**Latest MCP Spec:** 2025-11-25
**Codebase Spec Target:** ~2025-03-26 (HTTP Stream) / 2024-11-05 (SSE)

---

## Executive Summary

The mcp-framework is **significantly behind** the current MCP specification. The codebase
targets approximately the 2025-03-26 spec era, missing two full spec revisions
(2025-06-18 and 2025-11-25). The SDK dependency is 18 minor versions behind (1.11.0 vs
1.29.0). Roughly **25+ spec features** are missing or incomplete.

The core primitives (tools, prompts, resources, sampling, completions, subscriptions) work
well, but the framework lacks most features introduced in the June and November 2025 spec
releases: tool annotations, structured content, elicitation, tasks, logging protocol,
progress tracking, audio content, resource links, and several auth enhancements.

---

## Feature Matrix

### Legend

| Symbol | Meaning |
|--------|---------|
| :white_check_mark: | Fully implemented |
| :large_orange_diamond: | Partially implemented |
| :x: | Not implemented |
| N/A | Not applicable to server frameworks |

---

### Core Protocol

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| JSON-RPC 2.0 message format | 2024-11-05 | :white_check_mark: | Via SDK |
| Capability negotiation | 2024-11-05 | :white_check_mark: | Auto-detected from loaded items |
| Protocol version negotiation | 2024-11-05 | :white_check_mark: | Via SDK |
| `MCP-Protocol-Version` HTTP header | 2025-11-25 | :x: | New requirement for Streamable HTTP |
| `Implementation.description` field | 2025-11-25 | :x: | Optional description in init |
| Ping (`ping`) | 2024-11-05 | :large_orange_diamond: | SSE keep-alive only, not as protocol-level handler |

---

### Server Features: Tools

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| `tools/list` | 2024-11-05 | :white_check_mark: | With pagination |
| `tools/call` | 2024-11-05 | :white_check_mark: | With argument validation |
| `notifications/tools/list_changed` | 2024-11-05 | :white_check_mark: | Capability declared |
| `inputSchema` (JSON Schema) | 2024-11-05 | :white_check_mark: | Via Zod conversion |
| Text content in results | 2024-11-05 | :white_check_mark: | |
| Image content in results | 2024-11-05 | :white_check_mark: | Base64 encoding |
| `isError` flag | 2024-11-05 | :white_check_mark: | |
| **Tool `title` field** | 2025-06-18 | :x: | Human-readable display name |
| **Tool `icons` array** | 2025-11-25 | :x: | Icon metadata for UI display |
| **Tool Annotations** (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) | 2025-06-18 | :x: | Behavior hints for clients |
| **`outputSchema`** (JSON Schema for output) | 2025-06-18 | :x: | Structured output validation |
| **`structuredContent`** in results | 2025-06-18 | :x: | Typed JSON output alongside unstructured |
| **Audio content** in results | 2025-06-18 | :x: | `type: "audio"` with base64 data |
| **Resource links** in results | 2025-06-18 | :x: | `type: "resource_link"` with URI |
| **Embedded resources** in results | 2025-06-18 | :x: | `type: "resource"` with inline data |
| **Content annotations** (audience, priority, lastModified) | 2025-06-18 | :x: | Metadata on content blocks |
| **Tool naming guidance** (1-128 chars, allowed chars) | 2025-11-25 | :x: | Validation not enforced |
| **`execution.taskSupport`** declaration | 2025-11-25 | :x: | Task-augmented execution opt-in |
| Input validation errors as Tool Execution Errors (not Protocol Errors) | 2025-11-25 | :x: | For LLM self-correction |

---

### Server Features: Resources

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| `resources/list` | 2024-11-05 | :white_check_mark: | With pagination |
| `resources/read` | 2024-11-05 | :white_check_mark: | Text and blob content |
| `resources/templates/list` | 2024-11-05 | :white_check_mark: | URI templates |
| `resources/subscribe` / `unsubscribe` | 2024-11-05 | :white_check_mark: | |
| `notifications/resources/list_changed` | 2024-11-05 | :white_check_mark: | |
| `notifications/resources/updated` | 2024-11-05 | :white_check_mark: | |
| **Resource `title` field** | 2025-11-25 | :x: | Human-readable display name |
| **Resource `icons` array** | 2025-11-25 | :x: | Icon metadata |
| **Resource `size` field** | 2025-11-25 | :x: | Size in bytes |
| **Resource annotations** (audience, priority, lastModified) | 2025-06-18 | :x: | On resources and content |
| **Resource template `title`** | 2025-11-25 | :x: | |
| **Resource template `icons`** | 2025-11-25 | :x: | |

---

### Server Features: Prompts

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| `prompts/list` | 2024-11-05 | :white_check_mark: | |
| `prompts/get` | 2024-11-05 | :white_check_mark: | With argument support |
| `notifications/prompts/list_changed` | 2024-11-05 | :white_check_mark: | |
| **Prompt `title` field** | 2025-11-25 | :x: | Human-readable display name |
| **Prompt `icons` array** | 2025-11-25 | :x: | Icon metadata |

---

### Server Features: Completions

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| `completion/complete` | 2024-11-05 | :white_check_mark: | For prompt and resource args |
| Paginated completion results | 2024-11-05 | :white_check_mark: | `hasMore` flag |

---

### Client Features (Server -> Client requests)

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| **Sampling** (`sampling/createMessage`) | 2024-11-05 | :white_check_mark: | Via `MCPTool.samplingRequest()` |
| **Sampling with tools** (`tools` + `toolChoice` params) | 2025-11-25 | :x: | Tool calling within sampling |
| **Sampling audio content** | 2025-06-18 | :x: | Audio in sampling messages |
| **Elicitation** (`elicitation/create`) - Form mode | 2025-06-18 | :x: | Server requests user input via forms |
| **Elicitation** - URL mode | 2025-11-25 | :x: | Server redirects user to external URL |
| **Elicitation** - `notifications/elicitation/complete` | 2025-11-25 | :x: | Completion notification for URL mode |
| **Roots** (`roots/list`) | 2024-11-05 | :x: | Server queries filesystem boundaries |
| **Roots** - `notifications/roots/list_changed` | 2024-11-05 | :x: | Root change notifications |

---

### Utilities

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| **Logging** (`logging/setLevel`) | 2024-11-05 | :x: | Client sets server log level |
| **Logging** (`notifications/message`) | 2024-11-05 | :x: | Server sends structured log to client |
| **Progress** (`notifications/progress` via `progressToken`) | 2024-11-05 | :x: | Progress tracking for long operations |
| **Cancellation** (`notifications/cancelled`) | 2024-11-05 | :x: | Cancel in-progress requests |
| **Tasks** (`tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`) | 2025-11-25 | :x: | Experimental: durable async execution |
| **Tasks** - `notifications/tasks/status` | 2025-11-25 | :x: | Task status change notifications |
| **Tasks** - Tool-level task negotiation (`execution.taskSupport`) | 2025-11-25 | :x: | Per-tool task support declaration |
| Pagination | 2024-11-05 | :white_check_mark: | Via `nextCursor` |

---

### Transports

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| **stdio** | 2024-11-05 | :white_check_mark: | |
| **SSE** (HTTP+SSE, deprecated) | 2024-11-05 | :white_check_mark: | Maintained for backward compat |
| **Streamable HTTP** (POST + optional SSE) | 2025-03-26 | :white_check_mark: | Via SDK's StreamableHTTPServerTransport |
| Session management (`MCP-Session-Id`) | 2025-03-26 | :white_check_mark: | |
| Stream resumability (`Last-Event-ID`) | 2025-03-26 | :large_orange_diamond: | Configurable but depends on SDK |
| Batch vs stream response modes | 2025-03-26 | :white_check_mark: | |
| CORS support | 2025-03-26 | :white_check_mark: | SSE + HTTP Stream |
| **Origin header validation** (DNS rebinding protection) | 2025-11-25 | :x: | MUST validate, return 403 |
| **`MCP-Protocol-Version` header** | 2025-11-25 | :x: | Required on all HTTP requests |
| **HTTP DELETE for session termination** | 2025-11-25 | :x: | Client-initiated session cleanup |
| **SSE polling** (server disconnect + client reconnect) | 2025-11-25 | :x: | Server-initiated SSE disconnect with `retry` |
| **HTTP GET stream** for server-initiated messages | 2025-03-26 | :large_orange_diamond: | Depends on SDK impl |
| Localhost-only binding for local servers | 2025-11-25 | :x: | Default 0.0.0.0 should be 127.0.0.1 |

---

### Authentication & Authorization

| Feature | Spec Version | Status | Notes |
|---------|-------------|--------|-------|
| API Key auth | Custom | :white_check_mark: | |
| JWT auth (HS256, RS256) | Custom | :white_check_mark: | |
| OAuth 2.1 (JWT validation) | 2025-06-18 | :white_check_mark: | JWKS + audience/issuer |
| OAuth 2.1 (Token introspection) | 2025-06-18 | :white_check_mark: | RFC 7662 |
| Protected Resource Metadata (`/.well-known/oauth-protected-resource`) | 2025-06-18 | :white_check_mark: | RFC 9728 |
| Per-endpoint auth toggle | Custom | :white_check_mark: | |
| `WWW-Authenticate` challenge headers | 2025-06-18 | :white_check_mark: | RFC 6750 |
| **OpenID Connect Discovery 1.0** | 2025-11-25 | :x: | Auth server discovery enhancement |
| **Incremental scope consent** via `WWW-Authenticate` | 2025-11-25 | :x: | Progressive scope requests |
| **OAuth Client ID Metadata Documents** | 2025-11-25 | :x: | Recommended client registration |

---

### SDK & Dependencies

| Item | Current | Latest | Gap |
|------|---------|--------|-----|
| `@modelcontextprotocol/sdk` | 1.11.0 | 1.29.0 | 18 minor versions behind |
| Target MCP spec version | ~2025-03-26 | 2025-11-25 | 2 spec revisions behind |

---

## Priority Recommendations

### P0 - Critical (Spec Compliance / Security)

1. **Upgrade SDK** to `@modelcontextprotocol/sdk@^1.29.0` - Many features may come for
   free from the SDK upgrade, and security fixes are included.
2. **Origin header validation** on Streamable HTTP transport - Security requirement to
   prevent DNS rebinding attacks. Return HTTP 403 for invalid origins.
3. **`MCP-Protocol-Version` header** support - Required on all HTTP requests per spec.
4. **Localhost binding** - Local servers should bind to `127.0.0.1` by default, not `0.0.0.0`.

### P1 - High (Key June 2025 Features)

5. **Tool Annotations** - Allow tools to declare `readOnlyHint`, `destructiveHint`,
   `idempotentHint`, `openWorldHint`. Clients rely on these for safety decisions.
6. **Structured Content** - Support `outputSchema` on tools and `structuredContent` in
   `CallToolResult`. This is a major adoption driver.
7. **Tool/Resource/Prompt `title` and `icons`** - Display metadata for client UIs.
8. **Logging protocol** - Implement `logging/setLevel` handler and `notifications/message`
   sending. Currently only internal file logging exists.
9. **Elicitation** (Form mode) - Enable servers to request user input mid-operation. Core
   agentic feature from June 2025 spec.

### P2 - Medium (November 2025 Features + Completeness)

10. **Progress tracking** - Support `progressToken` in `_meta` and send
    `notifications/progress` for long-running tool calls.
11. **Cancellation** - Handle `notifications/cancelled` to abort in-progress requests.
12. **Audio content type** - Support `type: "audio"` in tool results and sampling.
13. **Resource links** (`type: "resource_link"`) and **embedded resources** (`type: "resource"`)
    in tool results.
14. **Content annotations** (audience, priority, lastModified) on all content blocks.
15. **Roots** support - Allow tools to query `roots/list` for filesystem boundaries.
16. **Sampling with tools** - Add `tools` and `toolChoice` to sampling requests.
17. **Resource `size` field** and **annotations**.

### P3 - Low (Experimental / Advanced)

18. **Tasks** (experimental) - Durable async execution with polling. Complex but enables
    long-running operations.
19. **Elicitation URL mode** - Out-of-band user interaction via external URLs.
20. **OpenID Connect Discovery** for auth server discovery.
21. **OAuth Client ID Metadata Documents**.
22. **Incremental scope consent**.
23. **HTTP DELETE for session termination**.
24. **Tool naming validation** (1-128 chars, allowed character set).

---

## Feature Count Summary

| Category | Implemented | Partial | Missing | Total |
|----------|------------|---------|---------|-------|
| Core Protocol | 3 | 1 | 2 | 6 |
| Tools | 6 | 0 | 12 | 18 |
| Resources | 6 | 0 | 6 | 12 |
| Prompts | 3 | 0 | 2 | 5 |
| Completions | 2 | 0 | 0 | 2 |
| Client Features | 1 | 0 | 7 | 8 |
| Utilities | 1 | 0 | 7 | 8 |
| Transports | 7 | 2 | 5 | 14 |
| Auth | 7 | 0 | 3 | 10 |
| **Totals** | **36** | **3** | **44** | **83** |

**Compliance Rate: ~47%** (39/83 features implemented or partially implemented)

---

## Spec Version Changelog Reference

### 2025-06-18 (Missing)
- Tool annotations, structured content, output schemas
- Elicitation (form mode)
- Audio content type
- Resource/content annotations
- OAuth 2.1 auth specification (partially implemented)
- Resource links and embedded resources in tool results

### 2025-11-25 (Missing)
- Tasks (experimental)
- Icons on tools, resources, prompts, templates
- Title field on tools, resources, prompts, templates
- URL mode elicitation
- Sampling with tools
- OpenID Connect Discovery
- Incremental scope consent
- OAuth Client ID Metadata Documents
- MCP-Protocol-Version header
- Origin validation (DNS rebinding protection)
- SSE polling support
- Tool naming guidance
- Enhanced ElicitResult and EnumSchema

---

## Sources

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Changelog 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [MCP Anniversary Blog Post](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/)
- [MCP GitHub Releases](https://github.com/modelcontextprotocol/modelcontextprotocol/releases)
- [Auth0 MCP Spec Updates](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
