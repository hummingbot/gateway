/**
 * Minimal ABI for the Fibrous EVM router contract.
 *
 * Only the `swap` entrypoint is included, since that is the sole function
 * Gateway encodes. The full ABI is published at:
 * https://github.com/Fibrous-Finance/router-contract-abi
 *
 * The tuple layouts below mirror the `route` and `swap_parameters` objects
 * returned verbatim by the Fibrous `POST /{network}/v2/calldata` endpoint.
 */
export const FibrousRouterABI = [
  {
    type: 'function',
    name: 'swap',
    inputs: [
      {
        name: 'route',
        type: 'tuple',
        internalType: 'struct RouteParam',
        components: [
          { name: 'token_in', type: 'address', internalType: 'address' },
          { name: 'token_out', type: 'address', internalType: 'address' },
          { name: 'amount_in', type: 'uint256', internalType: 'uint256' },
          { name: 'amount_out', type: 'uint256', internalType: 'uint256' },
          { name: 'min_received', type: 'uint256', internalType: 'uint256' },
          { name: 'destination', type: 'address', internalType: 'address' },
          { name: 'swap_type', type: 'uint8', internalType: 'enum SwapType' },
        ],
      },
      {
        name: 'swap_parameters',
        type: 'tuple[]',
        internalType: 'struct SwapParams[]',
        components: [
          { name: 'token_in', type: 'address', internalType: 'address' },
          { name: 'token_out', type: 'address', internalType: 'address' },
          { name: 'rate', type: 'uint32', internalType: 'uint32' },
          { name: 'protocol_id', type: 'int24', internalType: 'int24' },
          { name: 'pool_address', type: 'address', internalType: 'address' },
          { name: 'swap_type', type: 'uint8', internalType: 'enum SwapType' },
          { name: 'extra_data', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'payable',
  },
] as const;
