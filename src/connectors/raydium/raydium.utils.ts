import {
  AMM_V4,
  AMM_STABLE,
  CLMM_PROGRAM_ID,
  DEVNET_PROGRAM_ID,
  CREATE_CPMM_POOL_PROGRAM,
  DEV_CREATE_CPMM_POOL_PROGRAM
} from '@raydium-io/raydium-sdk-v2'

const VALID_AMM_PROGRAM_ID = new Set([
  AMM_V4.toBase58(),
  AMM_STABLE.toBase58(), 
  DEVNET_PROGRAM_ID.AmmV4.toBase58(),
  DEVNET_PROGRAM_ID.AmmStable.toBase58()
])

const VALID_CLMM_PROGRAM_ID = new Set([
  CLMM_PROGRAM_ID.toBase58(),
  DEVNET_PROGRAM_ID.CLMM.toBase58()
])

const VALID_CPMM_PROGRAM_ID = new Set([
  CREATE_CPMM_POOL_PROGRAM.toBase58(),
  DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()
])

export const isValidClmm = (id: string) => VALID_CLMM_PROGRAM_ID.has(id)
export const isValidAmm = (id: string) => VALID_AMM_PROGRAM_ID.has(id) 
export const isValidCpmm = (id: string) => VALID_CPMM_PROGRAM_ID.has(id)