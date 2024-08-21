import { logger } from '../../services/logger';
import { latency } from '../../services/base';
import { PositionRequest, PositionResponse } from '../../amm/amm.requests';
import { OrcaLPish } from '../../services/common-interfaces';

export async function positionInfo(
    orcaish: OrcaLPish,
    req: PositionRequest
  ): Promise<PositionResponse> {
    const startTimestamp: number = Date.now();
  
    const posInfo = await orcaish.getPositions();
  
    logger.info(`Position info for position ${req.tokenId} retrieved.`);
  
    return {
      network: req.network,
      timestamp: startTimestamp,
      latency: latency(startTimestamp, Date.now()),
      ...posInfo,
    };
  }