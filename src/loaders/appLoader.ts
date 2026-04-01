import { AppProtocol } from '../apps/types.js';
import { BaseLoader } from './BaseLoader.js';
import { logger } from '../core/Logger.js';

export class AppLoader extends BaseLoader<AppProtocol> {
  constructor(basePath?: string) {
    super(
      {
        subdirectory: 'apps',
        excludedFiles: [
          'BaseApp.js',
          'BaseApp.ts',
          'types.js',
          'types.ts',
          'validation.js',
          'validation.ts',
          '*.test.js',
          '*.spec.js',
          '*.test.ts',
          '*.spec.ts',
          '*.d.ts',
        ],
        extensions: ['.js', '.ts'],
      },
      basePath,
    );
  }

  async hasApps(): Promise<boolean> {
    return this.hasItems();
  }

  protected validateItem(app: any): app is AppProtocol {
    const isValid = Boolean(
      app &&
        typeof app.name === 'string' &&
        app.ui &&
        typeof app.ui.resourceUri === 'string' &&
        typeof app.ui.resourceName === 'string' &&
        Array.isArray(app.tools) &&
        app.tools.length > 0 &&
        typeof app.getContent === 'function',
    );

    if (isValid) {
      logger.debug(`Validated app: ${app.name}`);
    } else {
      logger.warn('Invalid app found: missing required properties');
    }

    return isValid;
  }

  protected createInstance(AppClass: any): AppProtocol {
    return new AppClass();
  }

  protected getItemName(app: AppProtocol): string {
    return app.name;
  }

  async loadApps(): Promise<AppProtocol[]> {
    return this.loadItems();
  }
}
