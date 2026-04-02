/**
 * Lambda / serverless type definitions.
 *
 * Lightweight types for API Gateway v1 (REST API) and v2 (HTTP API / Function URL).
 * No dependency on @types/aws-lambda — keeps the framework lightweight.
 */

/** API Gateway v1 (REST API) event */
export interface APIGatewayV1Event {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  multiValueHeaders?: Record<string, string[] | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  multiValueQueryStringParameters?: Record<string, string[] | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: {
    identity?: {
      sourceIp?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** API Gateway v2 (HTTP API / Function URL) event */
export interface APIGatewayV2Event {
  version: '2.0';
  requestContext: {
    http: {
      method: string;
      path: string;
      sourceIp?: string;
    };
    domainName?: string;
    [key: string]: unknown;
  };
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
  rawPath?: string;
  rawQueryString?: string;
  [key: string]: unknown;
}

export type LambdaEvent = APIGatewayV1Event | APIGatewayV2Event;

/** API Gateway v1 result */
export interface APIGatewayV1Result {
  statusCode: number;
  headers: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: string;
  isBase64Encoded: boolean;
}

/** API Gateway v2 result */
export interface APIGatewayV2Result {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

export type LambdaResult = APIGatewayV1Result | APIGatewayV2Result;

export type LambdaContext = Record<string, unknown>;

/** Configuration for the Lambda handler */
export interface LambdaHandlerConfig {
  /**
   * CORS configuration for Lambda responses.
   * Set to false to disable CORS headers entirely.
   * @default { allowOrigin: '*' }
   */
  cors?: {
    allowOrigin?: string;
    allowMethods?: string;
    allowHeaders?: string;
    exposeHeaders?: string;
    maxAge?: string;
  } | false;

  /**
   * Base path prefix to strip from the incoming request path.
   * Useful when API Gateway has a stage prefix (e.g., '/prod').
   */
  basePath?: string;
}
