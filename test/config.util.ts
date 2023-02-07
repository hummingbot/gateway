import { ConfigManagerV2 } from '../src/services/config-manager-v2';

export class OverrideConfigs {
  public nonceDbPath: string;
  public transactionDbPath: string;
  #testNonceDbPath: string = '';
  #testTransactionDbPath: string = '';
  #initialized: boolean = false;

  public constructor() {
    this.nonceDbPath = ConfigManagerV2.getInstance().get('server.nonceDbPath');
    this.transactionDbPath = ConfigManagerV2.getInstance().get(
      'server.transactionDbPath'
    );
  }

  init(): void {
    if (!this.#initialized) {
      this.#testNonceDbPath = this.nonceDbPath + '.test';
      this.#testTransactionDbPath = this.transactionDbPath + '.test';
      this.#initialized = true;
    }
  }

  updateConfigs(): void {
    ConfigManagerV2.getInstance().set(
      'server.nonceDbPath',
      this.#testNonceDbPath
    );
    ConfigManagerV2.getInstance().set(
      'server.transactionDbPath',
      this.#testTransactionDbPath
    );
  }

  resetConfigs(): void {
    ConfigManagerV2.getInstance().set('server.nonceDbPath', this.nonceDbPath);
    ConfigManagerV2.getInstance().set(
      'server.transactionDbPath',
      this.transactionDbPath
    );
  }
}

export const DBPathOverride = new OverrideConfigs();
