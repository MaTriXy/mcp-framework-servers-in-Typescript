# SATP Agent Trust Verification

Verify agent identity and behavioral trust scores using [AgentFolio/SATP](https://github.com/brainAI-bot/satp-solana-sdk) (Solana Agent Trust Protocol).

## Overview

The `SATPProvider` is an auth provider that checks an agent's on-chain trust score before allowing tool execution. It answers: **"Should I trust this agent for this task?"**

## Quick Start

```typescript
import { MCPServer, SATPProvider } from "mcp-framework";

const server = new MCPServer({
  auth: {
    provider: new SATPProvider({
      minTrustScore: 50,
      onMissing: "allow", // Don't break unidentified agents
    }),
  },
});
```

No API keys needed — the AgentFolio API is public.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | `string` | `"https://api.agentfolio.bot"` | AgentFolio API base URL |
| `minTrustScore` | `number` | `0` | Minimum trust score (0-100) to allow access |
| `requireVerified` | `boolean` | `false` | Require on-chain verification |
| `agentIdHeader` | `string` | `"x-agent-id"` | Header name for agent identity |
| `onMissing` | `"allow" \| "reject"` | `"allow"` | Behavior when agent identity is missing |
| `cacheTtlMs` | `number` | `300000` | Cache TTL in ms (default 5 min) |

## How It Works

1. Agent sends request with `x-agent-id` header (or `Authorization: Agent <id>`)
2. Provider queries AgentFolio for the agent's trust data
3. If trust score meets threshold → request proceeds with trust data attached
4. If below threshold → request rejected with `403` and `X-Trust-Required` header

## Modes

### Annotation mode (default)
```typescript
new SATPProvider({ onMissing: "allow", minTrustScore: 0 })
```
All requests pass through. Trust data is attached to `AuthResult.data.agentTrust` for your tool handlers to use (or ignore).

### Enforcement mode
```typescript
new SATPProvider({ 
  minTrustScore: 50,
  requireVerified: true,
  onMissing: "reject" 
})
```
Only verified agents with trust score ≥ 50 can access tools. Unidentified requests are rejected.

### Graduated trust
```typescript
// In your tool handler, use the trust data for risk-based decisions
const trust = request.context?.agentTrust;

if (trust?.trustScore > 80) {
  // High trust: allow sensitive operations
} else if (trust?.trustScore > 30) {
  // Medium trust: allow read-only operations
} else {
  // Low/no trust: sandbox mode
}
```

## Testing

```bash
# Test with a verified agent
curl -H "x-agent-id: brainGrowth" http://localhost:3000/mcp

# Test without identity (annotation mode passes through)
curl http://localhost:3000/mcp
```

## Trust Data Shape

```typescript
interface AgentTrustResult {
  agentId: string;       // Agent identifier
  trustScore: number;    // 0-100
  verified: boolean;     // On-chain verification status
  name?: string;         // Display name
  capabilities?: string[]; // Capability tags
  lastVerified?: string; // ISO timestamp
}
```

## Composing with Other Providers

SATPProvider works alongside JWT, OAuth, or API key providers. Use it as a secondary check after authentication:

```typescript
// Your custom composed provider
class ComposedProvider implements AuthProvider {
  private jwt = new JWTProvider(jwtConfig);
  private satp = new SATPProvider({ minTrustScore: 30 });

  async authenticate(req: IncomingMessage) {
    const jwtResult = await this.jwt.authenticate(req);
    if (!jwtResult) return false;
    
    const satpResult = await this.satp.authenticate(req);
    return satpResult; // Trust data in result.data.agentTrust
  }
}
```
