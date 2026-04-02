/**
 * Web Standard authentication handler.
 *
 * Authenticates Web Standard Request objects by shimming them into
 * Node.js IncomingMessage format, allowing existing AuthProvider
 * implementations to work unchanged.
 */

import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { AuthConfig, AuthResult, DEFAULT_AUTH_ERROR } from '../auth/types.js';
import { APIKeyAuthProvider } from '../auth/providers/apikey.js';
import { OAuthAuthProvider } from '../auth/providers/oauth.js';
import { getRequestHeader } from '../utils/headers.js';
import { logger } from '../core/Logger.js';

/**
 * Create a minimal IncomingMessage shim from a Web Standard Request.
 * Existing AuthProvider implementations only read req.headers, req.url,
 * and req.socket.remoteAddress — this shim satisfies all three.
 */
export function createIncomingMessageShim(
  request: Request,
  sourceIp?: string,
): IncomingMessage {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', {
    value: sourceIp ?? '0.0.0.0',
    writable: false,
  });

  const msg = new IncomingMessage(socket);

  // Copy headers — Node.js format is Record<string, string | string[]> with lowercase keys
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  msg.headers = headers;

  // Set URL (OAuthAuthProvider reads req.url for token-in-query-string check)
  const url = new URL(request.url);
  msg.url = url.pathname + url.search;

  msg.method = request.method;

  return msg;
}

/**
 * Authenticate a Web Standard Request using the framework's auth system.
 *
 * Returns `{ result }` on success or `{ response }` on failure.
 * The failure response is a fully-formed Web Standard Response with
 * proper status code, WWW-Authenticate header, and JSON error body.
 */
export async function authenticateWebRequest(
  request: Request,
  authConfig: AuthConfig | undefined,
  context: string,
  sourceIp?: string,
): Promise<{ result: AuthResult } | { response: Response }> {
  if (!authConfig?.provider) {
    return { result: { data: {} } };
  }

  const shimReq = createIncomingMessageShim(request, sourceIp);
  const isApiKey = authConfig.provider instanceof APIKeyAuthProvider;

  // Pre-check for API Key header (mirrors handleAuthentication logic)
  if (isApiKey) {
    const provider = authConfig.provider as APIKeyAuthProvider;
    const headerValue = getRequestHeader(shimReq.headers, provider.getHeaderName());

    if (!headerValue) {
      const error = provider.getAuthError?.() || DEFAULT_AUTH_ERROR;
      return {
        response: new Response(
          JSON.stringify({
            error: error.message,
            status: error.status,
            type: 'authentication_error',
          }),
          {
            status: error.status,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': `ApiKey realm="MCP Server", header="${provider.getHeaderName()}"`,
            },
          },
        ),
      };
    }
  }

  // Call existing provider (works via IncomingMessage shim)
  const authResult = await authConfig.provider.authenticate(shimReq);

  if (!authResult) {
    const error = authConfig.provider.getAuthError?.() || DEFAULT_AUTH_ERROR;
    logger.warn(`Authentication failed for ${context}:`);
    logger.warn(`- Client IP: ${sourceIp ?? 'unknown'}`);
    logger.warn(`- Error: ${error.message}`);

    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isApiKey) {
      const provider = authConfig.provider as APIKeyAuthProvider;
      responseHeaders['WWW-Authenticate'] =
        `ApiKey realm="MCP Server", header="${provider.getHeaderName()}"`;
    } else if (authConfig.provider instanceof OAuthAuthProvider) {
      const provider = authConfig.provider as OAuthAuthProvider;
      responseHeaders['WWW-Authenticate'] = provider.getWWWAuthenticateHeader(
        'invalid_token',
        'Missing or invalid authentication token',
      );
    }

    return {
      response: new Response(
        JSON.stringify({
          error: error.message,
          status: error.status,
          type: 'authentication_error',
        }),
        { status: error.status, headers: responseHeaders },
      ),
    };
  }

  // Success
  logger.info(`Authentication successful for ${context}:`);
  logger.info(`- Client IP: ${sourceIp ?? 'unknown'}`);
  logger.info(`- Auth Type: ${authConfig.provider.constructor.name}`);

  if (typeof authResult === 'boolean') {
    return { result: { data: {} } };
  }
  return { result: authResult };
}
