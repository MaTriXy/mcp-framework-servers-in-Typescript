import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import createProject directly for unit testing
import { createProject } from '../../src/cli/project/create.js';

describe('mcp create . (current directory)', () => {
  let tempDir: string;
  const originalCwd = process.cwd();
  const originalExit = process.exit;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exit = originalExit;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should scaffold project in the current directory when name is "."', async () => {
    // Create a specifically named subdirectory to control the derived name
    const projectDir = join(tempDir, 'my-test-server');
    const { mkdirSync } = await import('fs');
    mkdirSync(projectDir);
    process.chdir(projectDir);

    await createProject('.', { install: false, example: true });

    // Verify files were created in the current directory (not a subdirectory)
    expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'index.ts'))).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'tools', 'ExampleTool.ts'))).toBe(true);
    expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(projectDir, 'README.md'))).toBe(true);

    // No subdirectory should have been created
    expect(existsSync(join(projectDir, '.'))).toBe(true);

    // Verify project name was derived from directory name
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-test-server');
    expect(pkg.description).toBe('my-test-server MCP server');
    expect(pkg.bin['my-test-server']).toBe('./dist/index.js');
  });

  it('should derive a valid npm name from directory with uppercase/special chars', async () => {
    const projectDir = join(tempDir, 'My_Cool.Server');
    const { mkdirSync } = await import('fs');
    mkdirSync(projectDir);
    process.chdir(projectDir);

    await createProject('.', { install: false, example: false });

    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
    // Uppercase → lowercase, underscores/dots → hyphens
    expect(pkg.name).toBe('my-cool-server');
  });

  it('should reject when current directory has conflicting files', async () => {
    const projectDir = join(tempDir, 'existing-project');
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, 'package.json'), '{}');
    process.chdir(projectDir);

    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('process.exit called');
    }) as never;

    await expect(createProject('.', { install: false })).rejects.toThrow('process.exit called');
    expect(exitCode).toBe(1);
  });
});
