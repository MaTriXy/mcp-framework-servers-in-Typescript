import { IncomingMessage, Server as HttpServer, ServerResponse, createServer } from "node:http";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport as SDKSSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server as SDKServer } from "@modelcontextprotocol/sdk/server/index.js";
import { AbstractTransport } from "../base.js";
import { DEFAULT_SSE_CONFIG, SSETransportConfig, SSETransportConfigInternal, DEFAULT_CORS_CONFIG, CORSConfig } from "./types.js";
import { logger } from "../../core/Logger.js";
import { setResponseHeaders } from "../../utils/headers.js";
import { ProtectedResourceMetadata } from "../../auth/metadata/protected-resource.js";
import { handleAuthentication } from "../utils/auth-handler.js";
import { initializeOAuthMetadata } from "../utils/oauth-metadata.js";
import { validateOrigin } from "../utils/origin-validator.js";
import { requestContext, RequestContextData } from "../../utils/requestContext.js";
import { AuthResult } from "../../auth/types.js";

/**
 * Factory function type for creating configured SDK Server instances.
 * Each SSE session gets its own SDK Server with all handlers registered.
 */
export type SDKServerFactory = () => SDKServer;

interface SSESession {
  transport: SDKSSEServerTransport;
  server: SDKServer;
}

export class SSEServerTransport extends AbstractTransport {
  readonly type = "sse"

  private _server?: HttpServer
  private _sessions: Map<string, SSESession> = new Map()
  private _config: SSETransportConfigInternal
  private _oauthMetadata?: ProtectedResourceMetadata
  private _corsHeaders: Record<string, string>
  private _corsHeadersWithMaxAge: Record<string, string>
  private _serverFactory?: SDKServerFactory

  constructor(config: SSETransportConfig = {}) {
    super()
    this._config = {
      ...DEFAULT_SSE_CONFIG,
      ...config
    }

    // Initialize OAuth metadata if OAuth provider is configured
    this._oauthMetadata = initializeOAuthMetadata(this._config.auth, 'SSE');

    // Cache CORS headers for better performance
    const corsConfig = {
      allowOrigin: DEFAULT_CORS_CONFIG.allowOrigin,
      allowMethods: DEFAULT_CORS_CONFIG.allowMethods,
      allowHeaders: DEFAULT_CORS_CONFIG.allowHeaders,
      exposeHeaders: DEFAULT_CORS_CONFIG.exposeHeaders,
      maxAge: DEFAULT_CORS_CONFIG.maxAge,
      ...this._config.cors
    } as Required<CORSConfig>

    this._corsHeaders = {
      "Access-Control-Allow-Origin": corsConfig.allowOrigin,
      "Access-Control-Allow-Methods": corsConfig.allowMethods,
      "Access-Control-Allow-Headers": corsConfig.allowHeaders,
      "Access-Control-Expose-Headers": corsConfig.exposeHeaders
    }

    this._corsHeadersWithMaxAge = {
      ...this._corsHeaders,
      "Access-Control-Max-Age": corsConfig.maxAge
    }

    logger.debug(`SSE transport configured with: ${JSON.stringify({
      ...this._config,
      auth: this._config.auth ? {
        provider: this._config.auth.provider.constructor.name,
        endpoints: this._config.auth.endpoints
      } : undefined
    })}`)
  }

  /**
   * Set the factory function used to create a new SDK Server for each SSE session.
   * Must be called before start().
   */
  setServerFactory(factory: SDKServerFactory): void {
    this._serverFactory = factory;
  }

  private getCorsHeaders(includeMaxAge: boolean = false): Record<string, string> {
    return includeMaxAge ? this._corsHeadersWithMaxAge : this._corsHeaders
  }

  async start(): Promise<void> {
    if (this._server) {
      throw new Error("SSE transport already started")
    }

    return new Promise((resolve) => {
      this._server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
          await this.handleRequest(req, res)
        } catch (error: any) {
          logger.error(`Error handling request: ${error instanceof Error ? error.message : String(error)}`)
          res.writeHead(500).end("Internal Server Error")
        }
      })

      const host = this._config.host ?? '127.0.0.1';
      this._server.listen(this._config.port, host, () => {
        logger.info(`SSE transport listening on ${host}:${this._config.port}`)
        resolve()
      })

      this._server.on("error", (error: Error) => {
        logger.error(`SSE server error: ${error.message}`)
        this._onerror?.(error)
      })

      this._server.on("close", () => {
        logger.info("SSE server closed")
        this._onclose?.()
      })
    })
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    logger.debug(`Incoming request: ${req.method} ${req.url}`)

    // Validate Origin header for DNS rebinding protection (MCP spec 2025-11-25)
    if (!validateOrigin(req, res, { allowedOrigins: this._config.cors?.allowedOrigins })) {
      return
    }

    if (req.method === "OPTIONS") {
      setResponseHeaders(res, this.getCorsHeaders(true))
      res.writeHead(204).end()
      return
    }

    setResponseHeaders(res, this.getCorsHeaders())

    const url = new URL(req.url!, `http://${req.headers.host}`)
    const sessionId = url.searchParams.get("sessionId")

    if (req.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      if (this._oauthMetadata) {
        this._oauthMetadata.serve(res);
      } else {
        res.writeHead(404).end("Not Found");
      }
      return;
    }

    if (req.method === "GET" && url.pathname === this._config.endpoint) {
      if (this._config.auth?.endpoints?.sse) {
        const isAuthenticated = await handleAuthentication(req, res, this._config.auth, "SSE connection")
        if (!isAuthenticated) return
      }

      await this.setupSSEConnection(res);
      return;
    }

    if (req.method === "POST" && url.pathname === this._config.messageEndpoint) {
      let authData: RequestContextData = {};

      if (this._config.auth?.endpoints?.messages !== false) {
        const authResult = await handleAuthentication(req, res, this._config.auth, "message")
        if (!authResult) return
        authData = (authResult as AuthResult).data as RequestContextData || {};
      }

      if (!sessionId || !this._sessions.has(sessionId)) {
        logger.warn(`Rejecting message: no active SSE session for sessionId: ${sessionId}`);
        res.writeHead(404).end("Session not found");
        return;
      }

      const session = this._sessions.get(sessionId)!;
      await requestContext.run(authData, async () => {
        await session.transport.handlePostMessage(req, res);
      });
      return;
    }

    res.writeHead(404).end("Not Found")
  }

  private async setupSSEConnection(res: ServerResponse): Promise<void> {
    if (!this._serverFactory) {
      logger.error("Server factory not set. Call setServerFactory() before accepting SSE connections.");
      res.writeHead(500).end("Internal Server Error");
      return;
    }

    // Set CORS and SSE headers on the response before passing to SDK transport
    setResponseHeaders(res, {
      ...this.getCorsHeaders(),
      ...(this._config.headers || {}),
    });

    const sdkTransport = new SDKSSEServerTransport(
      this._config.messageEndpoint,
      res
    );

    const sdkServer = this._serverFactory();
    const sessionId = sdkTransport.sessionId;

    let sessionClosed = false;
    const cleanupSession = () => {
      if (sessionClosed) return;
      sessionClosed = true;
      logger.info(`SSE session closed: ${sessionId}`);
      this._sessions.delete(sessionId);
    };

    sdkTransport.onclose = () => {
      cleanupSession();
    };

    sdkTransport.onerror = (error: Error) => {
      logger.error(`SSE session error for ${sessionId}: ${error.message}`);
      this._onerror?.(error);
    };

    this._sessions.set(sessionId, { transport: sdkTransport, server: sdkServer });

    // Connect the per-session SDK server to the per-session SDK transport.
    // This calls sdkTransport.start() internally, writing SSE headers and
    // the endpoint event to the client.
    await sdkServer.connect(sdkTransport);

    logger.info(`SSE connection established for session: ${sessionId}`);
  }

  /**
   * Broadcast a message to all connected sessions.
   * Used for server-initiated notifications and sampling responses.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this._sessions.size === 0) {
      logger.warn("Attempted to send message, but no clients are connected.");
      return;
    }

    logger.debug(`Broadcasting message to ${this._sessions.size} sessions: ${JSON.stringify(message)}`);

    for (const [sessionId, session] of this._sessions.entries()) {
      try {
        await session.transport.send(message);
      } catch (error: any) {
        logger.error(`Error sending to session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async close(): Promise<void> {
    logger.info(`Closing SSE transport and ${this._sessions.size} sessions.`);

    // Copy entries and clear map first to prevent re-entrant cleanup
    const sessions = Array.from(this._sessions.entries());
    this._sessions.clear();

    for (const [sessionId, session] of sessions) {
      try {
        await session.transport.close();
      } catch (e: any) {
        logger.warn(`Error closing session ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return new Promise((resolve) => {
      if (!this._server) {
        logger.debug("Server already stopped.");
        resolve();
        return;
      }
      this._server.close(() => {
        logger.info("SSE server stopped");
        this._server = undefined;
        this._onclose?.();
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return Boolean(this._server)
  }
}
