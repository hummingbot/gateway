import {
  InitializationError,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { PositionInfo, OrcaLPish } from '../../services/common-interfaces';
import { OrcaConfig } from './orca.config';
import { Solana } from '../../chains/solana/solana';
// import { TokenInfo, TokenListContainer } from '@solana/spl-token-registry';

export class Orca implements OrcaLPish {
  private static _instances: { [name: string]: Orca };
  protected chain: Solana;
  private _whirlpoolsConfig: string;
  private _ready: boolean = false;
  // private tokenList: TokenInfo[] = [];

  private constructor(chain: string, network: string) {
    this._whirlpoolsConfig = OrcaConfig.config.routerAddress(network);
    if (chain === 'solana') {
      this.chain = Solana.getInstance(network);
    } else {
      throw new Error('Unsupported chain');
    }
  }

  public async init() {
    const chainName = this.chain.toString();
    if (!this.chain.ready())
        throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE(chainName),
        SERVICE_UNITIALIZED_ERROR_CODE
        );
    // this.tokenList = await this.chain.getTokenList();
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  public get whirlpoolsConfig(): string {
    return this._whirlpoolsConfig;
  }

  public static getInstance(chain: string, network: string): Orca {
    if (Orca._instances === undefined) {
      Orca._instances = {};
    }
    if (!(chain + network in Orca._instances)) {
      Orca._instances[chain + network] = new Orca(
        chain,
        network,
      );
    }

    return Orca._instances[chain + network];
  }

  async getPositions(): Promise<PositionInfo> {
    return {
      token0: "SOL",
      token1: "USDC",
      // fee: v3.FeeAmount[position.fee],
      // lowerPrice: positionInst.token0PriceLower.toFixed(8),
      // upperPrice: positionInst.token0PriceUpper.toFixed(8),
      // amount0: positionInst.amount0.toFixed(),
      // amount1: positionInst.amount1.toFixed(),
      // unclaimedToken0: utils.formatUnits(
      //   feeInfo.amount0.toString(),
      //   token0.decimals,
      // ),
      // unclaimedToken1: utils.formatUnits(
      //   feeInfo.amount1.toString(),
      //   token1.decimals,
      // ),
    };
  }
}