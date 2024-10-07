import { Solana } from './solana';
import { BalancesRequest, PollRequest } from './solana.request';

export class SolanaController {
  static async poll(solana: Solana, req: PollRequest) {
    return solana.getTransaction(req?.txHash);
  }
  static async balances(solana: Solana, req: BalancesRequest) {
    const balances: Record<string, string> = {};
    const account = await solana.getAccountFromAddress(req.address);
    if (req.tokenSymbols.includes(solana.nativeTokenSymbol)) {
      balances[solana.nativeTokenSymbol] =
        await solana.getNativeBalance(account);
    }

    for (const token of req.tokenSymbols) {
      if (token === solana.nativeTokenSymbol) continue;
      balances[token] = await solana.getAssetBalance(account, token);
    }
  }
}
