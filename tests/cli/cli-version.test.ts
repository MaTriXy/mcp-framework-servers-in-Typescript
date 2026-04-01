import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('CLI version consistency', () => {
  it('should have consistent version across package.json and CLI', () => {
    const packageJson = require('../../package.json');
    expect(packageJson.version).toBeDefined();
    expect(typeof packageJson.version).toBe('string');
    // Version should be a valid semver
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should use the framework version for created projects', async () => {
    // Read the create.ts source to verify it references frameworkPackageJson.version
    const { readFileSync } = await import('fs');
    const createSource = readFileSync('src/cli/project/create.ts', 'utf-8');

    // Should NOT contain hardcoded mcp-framework version
    expect(createSource).not.toMatch(/'mcp-framework':\s*'\^0\.2\.2'/);
    // Should reference frameworkPackageJson.version dynamically
    expect(createSource).toContain('frameworkPackageJson.version');
  });

  it('should use dynamic version in CLI program definition', async () => {
    const { readFileSync } = await import('fs');
    const cliSource = readFileSync('src/cli/index.ts', 'utf-8');

    // Should NOT contain hardcoded version
    expect(cliSource).not.toMatch(/\.version\(['"]0\.2\.\d+['"]\)/);
    // Should reference frameworkPackageJson.version
    expect(cliSource).toContain('frameworkPackageJson.version');
  });
});
