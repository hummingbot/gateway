import { Command } from '@oclif/core';
import { execSync } from 'child_process';
import { logger } from '../services/logger';

export default class Build extends Command {
  static description = 'Build Gateway by compiling Typescript into Javascript';

  static examples = ['$ gateway build'];

  async run() {
    try {
      // Execute prebuild script
      logger.info('Cleaning dist directory...');
      execSync('npx rimraf dist && mkdir dist', { stdio: 'inherit' });

      // Execute TypeScript compilation
      logger.info('Compiling TypeScript...');
      execSync('npx tsc --skipLibCheck --project ./', { stdio: 'inherit' });

      // Execute copy-files script
      logger.info('Copying additional files...');
      execSync(
        "npx copyfiles 'src/**/schema/*.json' 'src/templates/*.yml' 'src/templates/lists/*.json' 'test/services/data/**/*.*' dist",
        { stdio: 'inherit' }
      );

      logger.info('Build completed successfully');
    } catch (error) {
      this.error('Build failed: ' + error.message);
    }
  }
} 