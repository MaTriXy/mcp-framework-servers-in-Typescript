/**
 * Lambda adapter utilities.
 *
 * Pure functions to convert between AWS API Gateway events and
 * Web Standard Request/Response objects. No framework dependencies.
 */

import type {
  LambdaEvent,
  LambdaResult,
  APIGatewayV1Event,
  APIGatewayV2Event,
  APIGatewayV1Result,
  APIGatewayV2Result,
} from './types.js';

/** Type guard: true for API Gateway v2 (HTTP API / Function URL) events. */
export function isV2Event(event: LambdaEvent): event is APIGatewayV2Event {
  return 'version' in event && (event as any).version === '2.0';
}

/** Extract source IP from a Lambda event (v1 or v2). */
export function getSourceIp(event: LambdaEvent): string | undefined {
  if (isV2Event(event)) {
    return event.requestContext.http.sourceIp;
  }
  return (event as APIGatewayV1Event).requestContext?.identity?.sourceIp;
}

/** Convert a Lambda event (v1 or v2) to a Web Standard Request. */
export function lambdaEventToRequest(event: LambdaEvent, basePath?: string): Request {
  let method: string;
  let path: string;
  let queryString: string;
  const headers = new Headers();

  if (isV2Event(event)) {
    method = event.requestContext.http.method;
    path = event.rawPath ?? event.requestContext.http.path;
    queryString = event.rawQueryString ?? '';

    // Copy headers
    if (event.headers) {
      for (const [key, value] of Object.entries(event.headers)) {
        if (value !== undefined) {
          headers.set(key, value);
        }
      }
    }
  } else {
    const v1 = event as APIGatewayV1Event;
    method = v1.httpMethod;
    path = v1.path;

    // Reconstruct query string from multiValueQueryStringParameters (preserves duplicates)
    // Fall back to queryStringParameters if multi-value not present
    if (v1.multiValueQueryStringParameters) {
      const parts: string[] = [];
      for (const [key, values] of Object.entries(v1.multiValueQueryStringParameters)) {
        if (values) {
          for (const val of values) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
          }
        }
      }
      queryString = parts.join('&');
    } else if (v1.queryStringParameters) {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(v1.queryStringParameters)) {
        if (value !== undefined) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
      }
      queryString = parts.join('&');
    } else {
      queryString = '';
    }

    // Copy headers — use multiValueHeaders to preserve duplicates
    if (v1.multiValueHeaders) {
      for (const [key, values] of Object.entries(v1.multiValueHeaders)) {
        if (values) {
          for (const val of values) {
            headers.append(key, val);
          }
        }
      }
    } else if (v1.headers) {
      for (const [key, value] of Object.entries(v1.headers)) {
        if (value !== undefined) {
          headers.set(key, value);
        }
      }
    }
  }

  // Strip basePath prefix
  if (basePath && path.startsWith(basePath)) {
    path = path.slice(basePath.length) || '/';
  }

  const url = `https://lambda.local${path}${queryString ? '?' + queryString : ''}`;

  // Decode body
  let body: string | undefined;
  if (event.body != null && event.body !== '') {
    body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
  }

  // Only set body on methods that support it
  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());

  return new Request(url, {
    method,
    headers,
    body: hasBody ? (body ?? '') : undefined,
  });
}

/** Convert a Web Standard Response to a Lambda result (v1 or v2 format). */
export async function responseToLambdaResult(
  response: Response,
  event: LambdaEvent,
): Promise<LambdaResult> {
  const body = await response.text();
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  if (isV2Event(event)) {
    const result: APIGatewayV2Result = {
      statusCode: response.status,
      headers,
      body,
      isBase64Encoded: false,
    };
    return result;
  }

  // v1: also include multiValueHeaders for Set-Cookie etc.
  const multiValueHeaders: Record<string, string[]> = {};
  response.headers.forEach((value, key) => {
    if (!multiValueHeaders[key]) {
      multiValueHeaders[key] = [];
    }
    multiValueHeaders[key].push(value);
  });

  const result: APIGatewayV1Result = {
    statusCode: response.status,
    headers,
    multiValueHeaders,
    body,
    isBase64Encoded: false,
  };
  return result;
}
