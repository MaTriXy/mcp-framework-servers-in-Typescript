import { IncomingMessage, ServerResponse } from 'node:http';
import { AuthConfig, AuthResult } from '../../auth/types.js';
import { APIKeyAuthProvider } from '../../auth/providers/apikey.js';
import { OAuthAuthProvider } from '../../auth/providers/oauth.js';
import { DEFAULT_AUTH_ERROR } from '../../auth/types.js';
import { getRequestHeader } from '../../utils/headers.js';
import { logger } from '../../core/Logger.js';

/**
 * Shared authentication handler for transport layers.
 * Handles both API Key and OAuth authentication with proper error responses.
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response object
 * @param authConfig - Authentication configuration from transport
 * @param context - Description of the context (e.g., "initialize", "message", "SSE connection")
 * @returns AuthResult if authenticated, null if authentication failed (response already sent)
 */
export async function handleAuthentication(
  req: IncomingMessage,
  res: ServerResponse,
  authConfig: AuthConfig | undefined,
  context: string
): Promise<AuthResult | null> {
  if (!authConfig?.provider) {
    return { data: {} };
  }

  const isApiKey = authConfig.provider instanceof APIKeyAuthProvider;

  // Special handling for API Key - check header/Bearer/query exists before authenticate
  if (isApiKey) {
    const provider = authConfig.provider as APIKeyAuthProvider;
    const headerValue = getRequestHeader(req.headers, provider.getHeaderName());

    // Also check Authorization Bearer and query parameter as fallbacks
    // (for SSE clients like EventSource that can't send custom headers)
    let hasFallbackKey = false;
    if (!headerValue) {
      const authHeader = req.headers['authorization'];
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        hasFallbackKey = true;
      }

      if (!hasFallbackKey && req.url) {
        try {
          const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
          hasFallbackKey = !!(url.searchParams.get('api_key') || url.searchParams.get('apiKey'));
        } catch {
          // URL parsing failed
        }
      }
    }

    if (!headerValue && !hasFallbackKey) {
      const error = provider.getAuthError?.() || DEFAULT_AUTH_ERROR;
      res.setHeader('WWW-Authenticate', `ApiKey realm="MCP Server", header="${provider.getHeaderName()}"`);
      res.writeHead(error.status).end(
        JSON.stringify({
          error: error.message,
          status: error.status,
          type: 'authentication_error',
        })
      );
      return null;
    }
  }

  // Perform authentication
  const authResult = await authConfig.provider.authenticate(req);

  if (!authResult) {
    const error = authConfig.provider.getAuthError?.() || DEFAULT_AUTH_ERROR;
    logger.warn(`Authentication failed for ${context}:`);
    logger.warn(`- Client IP: ${req.socket.remoteAddress}`);
    logger.warn(`- Error: ${error.message}`);

    // Set appropriate WWW-Authenticate header
    if (isApiKey) {
      const provider = authConfig.provider as APIKeyAuthProvider;
      res.setHeader('WWW-Authenticate', `ApiKey realm="MCP Server", header="${provider.getHeaderName()}"`);
    } else if (authConfig.provider instanceof OAuthAuthProvider) {
      const provider = authConfig.provider as OAuthAuthProvider;
      res.setHeader('WWW-Authenticate', provider.getWWWAuthenticateHeader('invalid_token', 'Missing or invalid authentication token'));
    }

    res.writeHead(error.status).end(
      JSON.stringify({
        error: error.message,
        status: error.status,
        type: 'authentication_error',
      })
    );
    return null;
  }

  // Authentication successful
  logger.info(`Authentication successful for ${context}:`);
  logger.info(`- Client IP: ${req.socket.remoteAddress}`);
  logger.info(`- Auth Type: ${authConfig.provider.constructor.name}`);
  
  if (typeof authResult === 'boolean') {
    return { data: {} };
  }
  return authResult;
}
