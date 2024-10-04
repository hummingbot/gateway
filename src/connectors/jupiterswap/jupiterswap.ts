// import { ExpectedTrade, Uniswapish } from '../../services/common-interfaces';
//
// export class Jupiterswap implements Uniswapish {
//   gasLimitEstimate: number;
//   router: string;
//   routerAbi: any;
//   ttl: number;
//
//   estimateBuyTrade(
//     quoteToken: Tokenish,
//     baseToken: Tokenish,
//     amount: BigNumber,
//     allowedSlippage?: string,
//     poolId?: string,
//   ): Promise<ExpectedTrade> {
//     return Promise.resolve(undefined);
//   }
//
//   estimateSellTrade(
//     baseToken: Tokenish,
//     quoteToken: Tokenish,
//     amount: BigNumber,
//     allowedSlippage?: string,
//     poolId?: string,
//   ): Promise<ExpectedTrade> {
//     return Promise.resolve(undefined);
//   }
//
//   executeTrade(
//     wallet: Wallet,
//     trade: UniswapishTrade,
//     gasPrice: number,
//     uniswapRouter: string,
//     ttl: number,
//     abi: ContractInterface,
//     gasLimit: number,
//     nonce?: number,
//     maxFeePerGas?: BigNumber,
//     maxPriorityFeePerGas?: BigNumber,
//     allowedSlippage?: string,
//     poolId?: string,
//   ): Promise<Transaction> {
//     return Promise.resolve(undefined);
//   }
//
//   getTokenByAddress(address: string): Tokenish {
//     return undefined;
//   }
//
//   init(): Promise<void> {
//     return Promise.resolve(undefined);
//   }
//
//   ready(): boolean {
//     return false;
//   }
// }
