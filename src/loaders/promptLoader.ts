import { PromptProtocol } from '../prompts/BasePrompt.js';
import { BaseLoader } from './BaseLoader.js';
import { logger } from '../core/Logger.js';

export class PromptLoader extends BaseLoader<PromptProtocol> {
  constructor(basePath?: string) {
    super(
      {
        subdirectory: 'prompts',
        excludedFiles: ['BasePrompt.js', 'BasePrompt.ts', '*.test.js', '*.spec.js', '*.test.ts', '*.spec.ts', '*.d.ts'],
        extensions: ['.js', '.ts'],
      },
      basePath
    );
  }

  async hasPrompts(): Promise<boolean> {
    return this.hasItems();
  }

  protected validateItem(prompt: any): prompt is PromptProtocol {
    const isValid = Boolean(
      prompt &&
        typeof prompt.name === 'string' &&
        prompt.promptDefinition &&
        typeof prompt.getMessages === 'function'
    );

    if (isValid) {
      logger.debug(`Validated prompt: ${prompt.name}`);
    } else {
      logger.warn(`Invalid prompt found: missing required properties`);
    }

    return isValid;
  }

  protected createInstance(PromptClass: any): PromptProtocol {
    return new PromptClass();
  }

  protected getItemName(prompt: PromptProtocol): string {
    return prompt.name;
  }

  async loadPrompts(): Promise<PromptProtocol[]> {
    return this.loadItems();
  }
}
