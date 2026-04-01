import { describe, it, expect } from '@jest/globals';
import { ToolLoader } from '../../src/loaders/toolLoader.js';
import { PromptLoader } from '../../src/loaders/promptLoader.js';
import { ResourceLoader } from '../../src/loaders/resourceLoader.js';

describe('Loader TypeScript file support (tsx compatibility)', () => {
  describe('ToolLoader', () => {
    it('should accept .ts extension in config', () => {
      const loader = new ToolLoader('/tmp/test');
      // Access the protected config via any cast
      const config = (loader as any).config;
      expect(config.extensions).toContain('.js');
      expect(config.extensions).toContain('.ts');
    });

    it('should exclude .d.ts files', () => {
      const loader = new ToolLoader('/tmp/test');
      const config = (loader as any).config;
      expect(config.excludedFiles).toContain('*.d.ts');
    });

    it('should exclude TypeScript test files', () => {
      const loader = new ToolLoader('/tmp/test');
      const config = (loader as any).config;
      expect(config.excludedFiles).toContain('*.test.ts');
      expect(config.excludedFiles).toContain('*.spec.ts');
    });

    it('should exclude base class TypeScript files', () => {
      const loader = new ToolLoader('/tmp/test');
      const config = (loader as any).config;
      expect(config.excludedFiles).toContain('BaseTool.ts');
    });
  });

  describe('PromptLoader', () => {
    it('should accept .ts extension in config', () => {
      const loader = new PromptLoader('/tmp/test');
      const config = (loader as any).config;
      expect(config.extensions).toContain('.js');
      expect(config.extensions).toContain('.ts');
    });

    it('should exclude .d.ts and test files', () => {
      const loader = new PromptLoader('/tmp/test');
      const config = (loader as any).config;
      expect(config.excludedFiles).toContain('*.d.ts');
      expect(config.excludedFiles).toContain('*.test.ts');
      expect(config.excludedFiles).toContain('BasePrompt.ts');
    });
  });

  describe('ResourceLoader', () => {
    it('should accept .ts extension in config', () => {
      const loader = new ResourceLoader('/tmp/test');
      const config = (loader as any).config;
      expect(config.extensions).toContain('.js');
      expect(config.extensions).toContain('.ts');
    });

    it('should exclude .d.ts and test files', () => {
      const loader = new ResourceLoader('/tmp/test');
      const config = (loader as any).config;
      expect(config.excludedFiles).toContain('*.d.ts');
      expect(config.excludedFiles).toContain('*.test.ts');
      expect(config.excludedFiles).toContain('BaseResource.ts');
    });
  });
});
