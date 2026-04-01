import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  validateAppUri,
  validateAppToolVisibility,
  warnContentSize,
  isAppOnlyTool,
} from '../../src/apps/validation.js';
import {
  MCP_APP_MIME_TYPE,
  MCP_APP_URI_SCHEME,
  MCP_APP_EXTENSION_ID,
  MCP_APP_MAX_RECOMMENDED_SIZE,
} from '../../src/apps/types.js';
import { logger } from '../../src/core/Logger.js';

jest.spyOn(logger, 'warn').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validateAppUri', () => {
  it('APP-001-U01: accepts valid ui:// URIs', () => {
    expect(() => validateAppUri('ui://my-app/view', 'test')).not.toThrow();
    expect(() => validateAppUri('ui://weather-server/dashboard-template', 'test')).not.toThrow();
    expect(() => validateAppUri('ui://x', 'test')).not.toThrow();
  });

  it('APP-001-U02: rejects non-ui:// URIs', () => {
    expect(() => validateAppUri('https://example.com', 'test')).toThrow('must start with "ui://"');
    expect(() => validateAppUri('file:///path', 'test')).toThrow('must start with "ui://"');
    expect(() => validateAppUri('', 'test')).toThrow('must start with "ui://"');
    expect(() => validateAppUri('resource://foo', 'test')).toThrow('must start with "ui://"');
  });

  it('APP-001-U03: rejects bare ui:// with no path', () => {
    expect(() => validateAppUri('ui://', 'test')).toThrow('must have a path');
  });
});

describe('validateAppToolVisibility', () => {
  it('APP-001-U04: accepts valid visibility arrays', () => {
    expect(() => validateAppToolVisibility(['model', 'app'], 'tool')).not.toThrow();
    expect(() => validateAppToolVisibility(['model'], 'tool')).not.toThrow();
    expect(() => validateAppToolVisibility(['app'], 'tool')).not.toThrow();
  });

  it('APP-001-U05: rejects invalid values', () => {
    expect(() => validateAppToolVisibility(['model', 'invalid'], 'tool')).toThrow('Invalid visibility');
    expect(() => validateAppToolVisibility(['unknown'], 'tool')).toThrow('Invalid visibility');
  });

  it('APP-001-U06: rejects empty array', () => {
    expect(() => validateAppToolVisibility([], 'tool')).toThrow('Empty visibility array');
  });

  it('APP-001-U07: passes through undefined', () => {
    expect(() => validateAppToolVisibility(undefined, 'tool')).not.toThrow();
  });
});

describe('warnContentSize', () => {
  it('APP-001-U08: warns on large content', () => {
    const large = 'x'.repeat(MCP_APP_MAX_RECOMMENDED_SIZE + 1024);
    warnContentSize(large, 'test-app');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('KB'));
  });

  it('APP-001-U09: does not warn on small content', () => {
    warnContentSize('small html', 'test-app');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('isAppOnlyTool', () => {
  it('APP-001-U10: returns true for app-only visibility', () => {
    expect(isAppOnlyTool(['app'])).toBe(true);
  });

  it('APP-001-U11: returns false for model-visible tools', () => {
    expect(isAppOnlyTool(['model', 'app'])).toBe(false);
    expect(isAppOnlyTool(['model'])).toBe(false);
    expect(isAppOnlyTool(undefined)).toBe(false);
  });
});

describe('Constants', () => {
  it('APP-001-U12: MCP_APP_MIME_TYPE', () => {
    expect(MCP_APP_MIME_TYPE).toBe('text/html;profile=mcp-app');
  });

  it('APP-001-U13: MCP_APP_URI_SCHEME', () => {
    expect(MCP_APP_URI_SCHEME).toBe('ui://');
  });

  it('APP-001-U14: MCP_APP_EXTENSION_ID', () => {
    expect(MCP_APP_EXTENSION_ID).toBe('io.modelcontextprotocol/ui');
  });
});
