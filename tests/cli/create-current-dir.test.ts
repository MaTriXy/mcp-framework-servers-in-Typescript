import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

import { createProject } from '../../src/cli/project/create.js';

describe('mcp create . (current directory)', () => {
  let tempDir: string;
  const originalCwd = process.cwd();
  const originalExit = process.exit;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exit = originalExit;
    rmSync(tempDir, { recursive: true, force: true });
  });

  function mockProcessExit(): { getExitCode: () => number | undefined } {
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('process.exit called');
    }) as never;
    return { getExitCode: () => exitCode };
  }

  describe('scaffolding', () => {
    it('should create all project files in the current directory', async () => {
      const projectDir = join(tempDir, 'my-test-server');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: true });

      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'src', 'index.ts'))).toBe(true);
      expect(existsSync(join(projectDir, 'src', 'tools', 'ExampleTool.ts'))).toBe(true);
      expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
      expect(existsSync(join(projectDir, 'README.md'))).toBe(true);
    });

    it('should not create a subdirectory', async () => {
      const projectDir = join(tempDir, 'test-server');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      // No nested subdirectory should exist with the project name
      expect(existsSync(join(projectDir, 'test-server'))).toBe(false);
    });

    it('should skip example tool when --no-example is used', async () => {
      const projectDir = join(tempDir, 'no-example');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      expect(existsSync(join(projectDir, 'src', 'tools', 'ExampleTool.ts'))).toBe(false);
      expect(existsSync(join(projectDir, 'src', 'index.ts'))).toBe(true);
    });

    it('should generate HTTP transport config when --http is used', async () => {
      const projectDir = join(tempDir, 'http-server');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, http: true, port: 3000 });

      const indexTs = readFileSync(join(projectDir, 'src', 'index.ts'), 'utf-8');
      expect(indexTs).toContain('http-stream');
      expect(indexTs).toContain('3000');
    });
  });

  describe('project name derivation', () => {
    it('should derive name from directory name', async () => {
      const projectDir = join(tempDir, 'my-test-server');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('my-test-server');
      expect(pkg.description).toBe('my-test-server MCP server');
      expect(pkg.bin['my-test-server']).toBe('./dist/index.js');
    });

    it('should lowercase uppercase directory names', async () => {
      const projectDir = join(tempDir, 'MyServer');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('myserver');
    });

    it('should replace special characters with hyphens', async () => {
      const projectDir = join(tempDir, 'My_Cool.Server');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('my-cool-server');
    });

    it('should collapse consecutive hyphens', async () => {
      const projectDir = join(tempDir, 'my___server');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('my-server');
    });

    it('should strip leading and trailing hyphens', async () => {
      const projectDir = join(tempDir, '-my-server-');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('my-server');
    });
  });

  describe('conflict detection', () => {
    it('should reject when package.json exists', async () => {
      const projectDir = join(tempDir, 'has-pkg');
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, 'package.json'), '{}');
      process.chdir(projectDir);

      const { getExitCode } = mockProcessExit();

      await expect(createProject('.', { install: false })).rejects.toThrow('process.exit called');
      expect(getExitCode()).toBe(1);
    });

    it('should reject when tsconfig.json exists', async () => {
      const projectDir = join(tempDir, 'has-tsconfig');
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, 'tsconfig.json'), '{}');
      process.chdir(projectDir);

      const { getExitCode } = mockProcessExit();

      await expect(createProject('.', { install: false })).rejects.toThrow('process.exit called');
      expect(getExitCode()).toBe(1);
    });

    it('should reject when src directory exists', async () => {
      const projectDir = join(tempDir, 'has-src');
      mkdirSync(projectDir);
      mkdirSync(join(projectDir, 'src'));
      process.chdir(projectDir);

      const { getExitCode } = mockProcessExit();

      await expect(createProject('.', { install: false })).rejects.toThrow('process.exit called');
      expect(getExitCode()).toBe(1);
    });

    it('should allow directories with other non-conflicting files', async () => {
      const projectDir = join(tempDir, 'has-readme');
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, 'notes.txt'), 'hello');
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
    });
  });

  describe('git init behavior', () => {
    it('should skip git init when .git already exists', async () => {
      const projectDir = join(tempDir, 'git-exists');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      // Initialize a git repo before running create
      spawnSync('git', ['init'], { cwd: projectDir, stdio: 'ignore' });
      expect(existsSync(join(projectDir, '.git'))).toBe(true);

      // Capture console output to verify git init was skipped
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      await createProject('.', { install: false, example: false });

      console.log = originalLog;

      expect(logs.some((l) => l.includes('Initializing git'))).toBe(false);
      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
    });

    it('should run git init when no .git exists', async () => {
      const projectDir = join(tempDir, 'no-git');
      mkdirSync(projectDir);
      process.chdir(projectDir);

      await createProject('.', { install: false, example: false });

      expect(existsSync(join(projectDir, '.git'))).toBe(true);
    });
  });
});
