import { PollRequest, PollResponse } from '../algorand/algorand.requests';
import { Algorand } from './algorand';

export async function poll(
  algorand: Algorand,
  req: PollRequest
): Promise<PollResponse> {
  return await algorand.getTransaction(req.txHash);
}
