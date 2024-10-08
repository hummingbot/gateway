import { Solana } from '../../chains/solana/solana';
import { Jupiter } from './jupiter';
import { PriceRequest } from '../../amm/amm.requests';
import axios from 'axios';
import { JupiterPriceResponse } from './jupiter.request';

export async function getPairData(base: string, quote: string) {
  const baseURL = `https://api.jup.ag/price/v2?ids=${base},${quote}&showExtraInfo=true`;
  const response = await axios.get<JupiterPriceResponse>(baseURL);
  return response.data;
}

export async function jupiterPrice(
  solana: Solana,
  jupiter: Jupiter,
  req: PriceRequest,
) {
  const data = await jupiter.price(req);
  return {
    ...data,
    network: solana.network,
    gasPriceToken: solana.nativeTokenSymbol,
    gasCost: '0',
  };
}

// export async function jupiterTrade(
//   solana: Solana,
//   jupiter: Jupiter,
//   req: TradeRequest,
// ) {
//   // const startTimestamp: number = Date.now();
//   //
//   // const { address, limitPrice } = req;
//   // const keypair = await solana.getAccountFromAddress(address);
//   // const limitPrice = req.limitPrice;
//   // const trade = await jupiter.price(<PriceRequest>req);
//   // const estimatedPrice = trade.expectedPrice;
// }
