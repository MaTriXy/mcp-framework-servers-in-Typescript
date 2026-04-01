import { MCP_APP_URI_SCHEME, MCP_APP_MAX_RECOMMENDED_SIZE } from './types.js';
import { logger } from '../core/Logger.js';

/**
 * Validates that a resource URI uses the required ui:// scheme.
 * @throws Error if the URI is invalid.
 */
export function validateAppUri(uri: string, context: string): void {
  if (!uri.startsWith(MCP_APP_URI_SCHEME)) {
    throw new Error(
      `Invalid app resource URI in ${context}: "${uri}". ` +
        `URI must start with "${MCP_APP_URI_SCHEME}".`,
    );
  }
  if (uri === MCP_APP_URI_SCHEME) {
    throw new Error(
      `Invalid app resource URI in ${context}: "${uri}". ` +
        `URI must have a path after "${MCP_APP_URI_SCHEME}".`,
    );
  }
}

/**
 * Validates the visibility array for an app tool.
 * @throws Error if visibility contains invalid values or is empty.
 */
export function validateAppToolVisibility(
  visibility: Array<string> | undefined,
  toolName: string,
): void {
  if (!visibility) return;
  const valid = ['model', 'app'];
  for (const v of visibility) {
    if (!valid.includes(v)) {
      throw new Error(
        `Invalid visibility "${v}" for tool "${toolName}". Must be "model" or "app".`,
      );
    }
  }
  if (visibility.length === 0) {
    throw new Error(
      `Empty visibility array for tool "${toolName}". ` +
        `Must contain at least one of: "model", "app".`,
    );
  }
}

/**
 * Logs a warning if the HTML content exceeds the recommended size.
 */
export function warnContentSize(content: string, appName: string): void {
  const size = Buffer.byteLength(content, 'utf-8');
  if (size > MCP_APP_MAX_RECOMMENDED_SIZE) {
    const sizeKB = Math.round(size / 1024);
    logger.warn(
      `App "${appName}" HTML content is ${sizeKB}KB. ` +
        `Recommended maximum is ${MCP_APP_MAX_RECOMMENDED_SIZE / 1024}KB for optimal performance.`,
    );
  }
}

/**
 * Returns true if the tool should be hidden from the LLM agent's tools/list.
 */
export function isAppOnlyTool(visibility?: Array<string>): boolean {
  if (!visibility) return false;
  return !visibility.includes('model');
}
