import { SolanaController } from '../solana/solana.controller';
import DLMM from '@meteora-ag/dlmm';
import { Cluster, PublicKey } from '@solana/web3.js';

const dlmmPools: Map<string, DLMM> = new Map();
const dlmmPoolPromises: Map<string, Promise<DLMM>> = new Map();

export class MeteoraController extends SolanaController {
  constructor() {
    super();
  }

  async getDlmmPool(poolAddress: string): Promise<DLMM> {
    if (dlmmPools.has(poolAddress)) {
      return dlmmPools.get(poolAddress);
    }

    if (dlmmPoolPromises.has(poolAddress)) {
      return dlmmPoolPromises.get(poolAddress);
    }

    // Create a promise for the DLMM instance and store it in the promises map
    const dlmmPoolPromise = DLMM.create(this.connectionPool.getNextConnection(), new PublicKey(poolAddress), {
      cluster: this.network as Cluster,
    }).then((dlmmPool) => {
      dlmmPools.set(poolAddress, dlmmPool); // Store the actual DLMM instance
      dlmmPoolPromises.delete(poolAddress); // Remove the promise from the map
      return dlmmPool;
    });

    dlmmPoolPromises.set(poolAddress, dlmmPoolPromise); // Temporarily store the promise

    return dlmmPoolPromise;
  }
}
