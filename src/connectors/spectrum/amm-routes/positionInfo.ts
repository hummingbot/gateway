import { FastifyPluginAsync } from 'fastify'

import { 
  PositionInfo, 
  PositionInfoSchema,
  GetPositionInfoRequest,
  GetPositionInfoRequestType
} from '../../../schemas/trading-types/amm-schema'



const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
 
  fastify.get<{
    Querystring: GetPositionInfoRequestType
    Reply: PositionInfo
  }>(
    '/position-info',
    {
      schema: {
        description: '',
        tags: [''],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: { 
              type: 'string', 
              examples: [''] 
            },
            walletAddress: { 
              type: 'string', 
              examples: [] 
            }
          }
        },
        response: {
          200: PositionInfoSchema
        }
      }
    },
    async (_) => {
      try {
        throw fastify.httpErrors.internalServerError('Not implemented !')
      } catch (e) {
       
        throw fastify.httpErrors.internalServerError('Failed to fetch position info')
      }
    }
  )
}

export default positionInfoRoute