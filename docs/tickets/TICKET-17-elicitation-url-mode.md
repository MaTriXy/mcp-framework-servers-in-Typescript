# TICKET-17: Elicitation URL Mode

**Priority:** P3 — Low
**Phase:** 6 — Advanced Features
**Depends on:** TICKET-13 (form mode elicitation)
**Estimated scope:** Medium
**Breaking change:** No (opt-in)

---

## Summary

Add URL mode elicitation per MCP spec 2025-11-25, enabling servers to direct users to
external URLs for out-of-band interactions (OAuth flows, payment processing, sensitive
credential entry).

---

## Checklist

### Type Definitions
- [ ] Extend elicitation types:
      ```typescript
      interface URLElicitationParams {
        mode: 'url';
        message: string;
        url: string;            // HTTPS URL for the interaction
        elicitationId: string;  // Unique ID for tracking
      }
      ```
- [ ] Define `URLElicitationRequiredError`:
      ```typescript
      // Error code: -32042
      interface URLElicitationRequiredErrorData {
        elicitations: Array<{
          mode: 'url';
          elicitationId: string;
          url: string;
          message: string;
        }>;
      }
      ```

### MCPTool Changes
- [ ] Add `elicitURL()` method:
      ```typescript
      protected async elicitURL(
        message: string,
        url: string,
        elicitationId?: string
      ): Promise<ElicitationResult>
      ```
- [ ] Generate `elicitationId` if not provided (randomUUID)
- [ ] Check client capabilities: `elicitation.url`

### Completion Notification
- [ ] Add `sendElicitationComplete(elicitationId)` method on MCPServer
- [ ] Sends `notifications/elicitation/complete` with the elicitationId

### URLElicitationRequiredError
- [ ] Add helper to throw URLElicitationRequiredError from tools:
      ```typescript
      protected throwURLElicitationRequired(
        elicitations: Array<{ url: string; message: string; elicitationId?: string }>
      ): never
      ```
- [ ] Framework catches this specific error and returns JSON-RPC error -32042

### Unit Tests (`tests/core/elicitation-url.test.ts`)
- [ ] `elicitURL()` sends correct request format with mode 'url'
- [ ] User accepts → returns `{ action: 'accept' }` (no content for URL mode)
- [ ] User declines → returns `{ action: 'decline' }`
- [ ] Client doesn't support URL elicitation → error
- [ ] Completion notification sent → correct format
- [ ] URLElicitationRequiredError → JSON-RPC error -32042 with elicitations data
- [ ] URL validation: HTTPS → accepted
- [ ] URL validation: HTTP → accepted (but warned in non-production)
- [ ] ElicitationId uniqueness → each call gets unique ID

### Security Tests
- [ ] URL doesn't contain user credentials or PII
- [ ] URL is not pre-authenticated
- [ ] Elicitation bound to user identity

### Backwards Compat
- [ ] Existing tools → unchanged
- [ ] Client without URL elicitation support → clear error
- [ ] All existing tests pass

---

## Edge Cases & Gotchas

1. **Security-critical**: URL mode is the ONLY way to handle sensitive data (passwords,
   API keys, payment info). Form mode MUST NOT be used for these. Document this.

2. **Out-of-band interaction**: The client opens a URL, the user interacts with a web
   page, but the MCP client has NO visibility into what happens. The server must
   verify the user's identity independently.

3. **Phishing prevention**: The server MUST verify that the user who opens the URL is
   the same user who initiated the elicitation. Without this, an attacker could trick
   another user into completing an authorization flow on their behalf.

4. **Completion notification is optional**: The server MAY send
   `notifications/elicitation/complete`, but clients MUST NOT rely on it. Clients should
   provide manual retry/cancel controls.

5. **HTTP vs HTTPS**: URLs SHOULD be HTTPS in non-development environments. Don't
   reject HTTP (dev servers use it), but log a warning.

6. **No sensitive info in URL**: The URL itself must not contain credentials, PII, or
   pre-authenticated tokens. It should be a starting point for the interaction, not a
   credential.

---

## Acceptance Criteria

- [ ] Tools can direct users to URLs via `elicitURL()`
- [ ] Completion notifications work
- [ ] URLElicitationRequiredError pattern works
- [ ] Client capability check for URL mode
- [ ] Security constraints documented and enforced where possible
