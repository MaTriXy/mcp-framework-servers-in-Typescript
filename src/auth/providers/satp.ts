import { IncomingMessage } from "node:http";
import { AuthProvider, AuthResult, DEFAULT_AUTH_ERROR } from "../types.js";

/**
 * Trust verification result from SATP/AgentFolio
 */
export interface AgentTrustResult {
  /** Agent identifier */
  agentId: string;
  /** Trust score (0-100) */
  trustScore: number;
  /** Whether the agent is verified on-chain */
  verified: boolean;
  /** Agent display name */
  name?: string;
  /** Capabilities tags */
  capabilities?: string[];
  /** Last verification timestamp */
  lastVerified?: string;
}

/**
 * Configuration for SATP agent trust verification
 */
export interface SATPConfig {
  /**
   * AgentFolio API base URL
   * @default "https://api.agentfolio.bot"
   */
  apiUrl?: string;

  /**
   * Minimum trust score required (0-100)
   * Set to 0 to allow all agents but still annotate requests with trust data
   * @default 0
   */
  minTrustScore?: number;

  /**
   * Require on-chain verification
   * @default false
   */
  requireVerified?: boolean;

  /**
   * Header name for agent identity
   * @default "x-agent-id"
   */
  agentIdHeader?: string;

  /**
   * Behavior when agent identity is missing from request
   * - "reject": Return 401
   * - "allow": Continue without trust data
   * @default "allow"
   */
  onMissing?: "reject" | "allow";

  /**
   * Cache TTL in milliseconds for trust score lookups
   * @default 300000 (5 minutes)
   */
  cacheTtlMs?: number;
}

/**
 * SATP Agent Trust Provider
 *
 * Verifies agent identity and trust scores via AgentFolio/SATP.
 * Can be used standalone or composed with other auth providers.
 *
 * @example
 * ```typescript
 * import { MCPServer, SATPProvider } from "mcp-framework";
 *
 * const server = new MCPServer({
 *   auth: {
 *     provider: new SATPProvider({
 *       minTrustScore: 50,
 *       requireVerified: true,
 *     }),
 *   },
 * });
 * ```
 */
export class SATPProvider implements AuthProvider {
  private config: Required<SATPConfig>;
  private cache: Map<string, { result: AgentTrustResult; expiry: number }> =
    new Map();

  constructor(config: SATPConfig = {}) {
    this.config = {
      apiUrl: config.apiUrl ?? "https://api.agentfolio.bot",
      minTrustScore: config.minTrustScore ?? 0,
      requireVerified: config.requireVerified ?? false,
      agentIdHeader: config.agentIdHeader ?? "x-agent-id",
      onMissing: config.onMissing ?? "allow",
      cacheTtlMs: config.cacheTtlMs ?? 300_000,
    };
  }

  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    const agentId = this.extractAgentId(req);

    if (!agentId) {
      return this.config.onMissing === "allow" ? { data: { agentTrust: null } } : false;
    }

    const trust = await this.queryTrust(agentId);

    if (!trust) {
      return this.config.onMissing === "allow" ? { data: { agentTrust: null } } : false;
    }

    // Check minimum trust score
    if (trust.trustScore < this.config.minTrustScore) {
      return false;
    }

    // Check verification requirement
    if (this.config.requireVerified && !trust.verified) {
      return false;
    }

    return {
      data: {
        agentTrust: trust,
      },
    };
  }

  getAuthError(): { status: number; message: string; headers?: Record<string, string> } {
    return {
      status: 403,
      message: "Agent trust verification failed",
      headers: {
        "X-Trust-Required": `min-score=${this.config.minTrustScore}`,
      },
    };
  }

  /**
   * Extract agent ID from request headers or MCP metadata
   */
  private extractAgentId(req: IncomingMessage): string | null {
    // Check custom header first
    const headerValue = req.headers[this.config.agentIdHeader];
    if (headerValue) {
      return Array.isArray(headerValue) ? headerValue[0] : headerValue;
    }

    // Check Authorization header for agent token
    const auth = req.headers.authorization;
    if (auth?.startsWith("Agent ")) {
      return auth.slice(6).trim();
    }

    return null;
  }

  /**
   * Query AgentFolio API for agent trust data with caching
   */
  private async queryTrust(agentId: string): Promise<AgentTrustResult | null> {
    // Check cache
    const cached = this.cache.get(agentId);
    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    try {
      const response = await fetch(
        `${this.config.apiUrl}/v1/agents/${encodeURIComponent(agentId)}/trust`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "mcp-framework-satp/1.0",
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as AgentTrustResult;
      const result: AgentTrustResult = {
        agentId: data.agentId ?? agentId,
        trustScore: data.trustScore ?? 0,
        verified: data.verified ?? false,
        name: data.name,
        capabilities: data.capabilities,
        lastVerified: data.lastVerified,
      };

      // Cache result
      this.cache.set(agentId, {
        result,
        expiry: Date.now() + this.config.cacheTtlMs,
      });

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Clear the trust score cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
