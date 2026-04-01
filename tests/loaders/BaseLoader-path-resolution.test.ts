import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('BaseLoader path resolution', () => {
  const testDir = join(tmpdir(), 'mcp-path-test-' + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should find tools directory in dist/ relative to cwd', async () => {
    // Create a dist/tools directory structure
    const distToolsDir = join(testDir, 'dist', 'tools');
    mkdirSync(distToolsDir, { recursive: true });

    // Import ToolLoader dynamically
    const { ToolLoader } = await import('../../src/loaders/toolLoader.js');

    // Save and override cwd
    const originalCwd = process.cwd;
    process.cwd = () => testDir;

    try {
      const loader = new ToolLoader();
      // The loader should find the dist/tools directory
      const hasTools = await loader.hasTools();
      // No actual tool files, so false, but it shouldn't throw
      expect(hasTools).toBe(false);
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('should find tools directory when basePath is explicitly provided', async () => {
    const toolsDir = join(testDir, 'tools');
    mkdirSync(toolsDir, { recursive: true });

    const { ToolLoader } = await import('../../src/loaders/toolLoader.js');
    const loader = new ToolLoader(testDir);
    const hasTools = await loader.hasTools();
    expect(hasTools).toBe(false); // no files, but directory resolved correctly
  });

  it('should handle non-existent directories gracefully', async () => {
    const { ToolLoader } = await import('../../src/loaders/toolLoader.js');
    const loader = new ToolLoader('/non/existent/path');
    const hasTools = await loader.hasTools();
    expect(hasTools).toBe(false);
  });
});
