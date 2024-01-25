import { Oraichain } from '../../chains/oraichain/oraichain';

export class OraidexModel {
  /**
   *
   * @private
   */
  oraichainNetwork: Oraichain;
  /**
   *
   */
  chain: string;

  /**
   *
   */
  network: string;

  /**
   *
   * @private
   */
  private static _instances: { [name: string]: OraidexModel };

  /**
   * Get the Kujira instance for the given chain and network.
   *
   * @param chain
   * @param network
   */
  public static getInstance(chain: string, network: string): OraidexModel {
    if (OraidexModel._instances === undefined) {
      OraidexModel._instances = {};
    }

    const key = `${chain}:${network}`;

    if (!(key in OraidexModel._instances)) {
      OraidexModel._instances[key] = new OraidexModel(chain, network);
    }

    return OraidexModel._instances[key];
  }

  /**
   * Creates a new instance of Oraichain.
   *
   * @param chain
   * @param network
   * @private
   */
  private constructor(chain: string, network: string) {
    this.chain = chain;
    this.network = network;

    this.oraichainNetwork = Oraichain.getInstance(network);
  }
}
