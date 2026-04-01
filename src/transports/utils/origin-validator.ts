import { IncomingMessage, ServerResponse } from 'http';
import { logger } from '../../core/Logger.js';

export interface OriginValidationConfig {
  allowedOrigins?: string[];
}

/**
 * Validates the Origin header on incoming requests.
 * Returns true if the request should be allowed, false if rejected.
 * When rejecting, sends a 403 response.
 */
export function validateOrigin(
  req: IncomingMessage,
  res: ServerResponse,
  config: OriginValidationConfig
): boolean {
  const origin = req.headers['origin'];

  // No Origin header = non-browser client (curl, SDK) - allow
  if (!origin) {
    return true;
  }

  // No allowedOrigins configured = allow all (backwards compat)
  if (!config.allowedOrigins || config.allowedOrigins.length === 0) {
    return true;
  }

  // Origin: null is a security risk when allowedOrigins is configured
  if (origin === 'null') {
    rejectOrigin(res, origin);
    return false;
  }

  // Normalize and compare
  const normalizedOrigin = normalizeOrigin(origin);
  const allowed = config.allowedOrigins.some(
    (allowed) => normalizeOrigin(allowed) === normalizedOrigin
  );

  if (!allowed) {
    rejectOrigin(res, origin);
    return false;
  }

  return true;
}

/**
 * Returns the validated origin for use in CORS headers, or '*' if no validation configured.
 */
export function getValidatedCorsOrigin(
  req: IncomingMessage,
  config: OriginValidationConfig
): string {
  if (!config.allowedOrigins || config.allowedOrigins.length === 0) {
    return '*';
  }
  const origin = req.headers['origin'];
  if (origin && origin !== 'null') {
    return origin;
  }
  return config.allowedOrigins[0];
}

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    // Remove default ports
    let host = url.hostname.toLowerCase();
    let port = url.port;
    if (
      (url.protocol === 'http:' && port === '80') ||
      (url.protocol === 'https:' && port === '443')
    ) {
      port = '';
    }
    return `${url.protocol}//${host}${port ? ':' + port : ''}`;
  } catch {
    return origin.toLowerCase();
  }
}

function rejectOrigin(res: ServerResponse, origin: string): void {
  logger.warn(`Rejected request from origin: ${origin}`);
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: `Forbidden: origin '${origin}' is not allowed`,
      },
    })
  );
}
