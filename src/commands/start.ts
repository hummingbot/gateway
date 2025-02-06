import { Command } from '@oclif/core';
import { startGateway } from '../app';

export default class Start extends Command {
  static description = 'Start the Gateway API server';

  static examples = ['$ gateway start'];

  async run() {
    process.env.START_SERVER = 'true';
    await startGateway();
  }
} 