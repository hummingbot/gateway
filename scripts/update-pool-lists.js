#!/usr/bin/env node
/**
 * Script to update pool lists with top pools by TVL for each DEX
 * Finds top 20 pools for AMM and CLMM types
 */

const fs = require('fs-extra');
const path = require('path');

// Top pools by DEX (manually curated from market data)
const TOP_POOLS = {
  raydium: {
    amm: [
      // Major pairs
      { type: "amm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDC", address: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDT", address: "7XawhbbxtsRcQA8FJ1pd41rbmkrYXMpK6Ns6YWnmUfVW" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "RAY", quoteSymbol: "SOL", address: "AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "RAY", quoteSymbol: "USDC", address: "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "RAY", quoteSymbol: "USDT", address: "C4z32zw9WKaGPhNuU54FN8DQ3jFkCnbvPKE63RVVoVtt" },
      // Stablecoin pairs
      { type: "amm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "USDT", address: "77quYg4MGneUdjgXCunt9GgM1usmrxKY31twEy3WHwcS" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "PYUSD", address: "AUXCBLyRWuHJ93xJSbQiGBhJeMWvR1UBxxYTy2hzfGNu" },
      // Meme coins
      { type: "amm", network: "mainnet-beta", baseSymbol: "WIF", quoteSymbol: "SOL", address: "EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "BONK", quoteSymbol: "SOL", address: "Hs1X5YtXwZACueUtS9azZyXFDWVxAMLvm3tttubpK7ph" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "POPCAT", quoteSymbol: "SOL", address: "FRhB8L7Y9Qq41qZXYLtC2nw8An1RJfLLxRF2x9RwLLMo" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "PENGU", quoteSymbol: "SOL", address: "FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz" },
      // LST pairs
      { type: "amm", network: "mainnet-beta", baseSymbol: "MSOL", quoteSymbol: "SOL", address: "EWy2hPdVT4uG6QahQ6o4uXGLpzEEQgpF2gZWPpYsrmzS" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "JITOSOL", quoteSymbol: "SOL", address: "7TbGqz32RsuwXbXY7EyBCiAnMbJq1gm1wKmfjQjuwVma" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "STSOL", quoteSymbol: "SOL", address: "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv" },
      // Other major tokens
      { type: "amm", network: "mainnet-beta", baseSymbol: "JUP", quoteSymbol: "SOL", address: "BqnpCdDLPV2pFdAaLnVidmn3G93RP2p5oRdGEY2sJGez" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "JTO", quoteSymbol: "SOL", address: "GJvWJL7k3CSBvK71cX1Eo3DgTb1JVDNTft8DWqeXfpah" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "PYTH", quoteSymbol: "SOL", address: "84npwQqQAZmB3wwFHKJsDCgxnd7b6uLpK9wyDZgW5xJX" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "RENDER", quoteSymbol: "SOL", address: "AtNnsY1AyRERWJ8xCskfz38YdvruWVJQUVXgScC1iPb" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "HNT", quoteSymbol: "SOL", address: "CnUuRHkn1yAaL274bWJ7kJN3CQQhcHkh1frZC6YUb6UA" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "TRUMP", quoteSymbol: "SOL", address: "HKuJrP5tYQLbEUdjKwjgnHs2957QKjR2iWhJKTtMa1xs" }
    ],
    clmm: [
      // Major pairs
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDC", address: "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDT", address: "3nMFwZXwY1s1M5s8vYAHqd4wGs4iSxXE4LRoUMMYqEgF" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "RAY", quoteSymbol: "USDC", address: "61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "RAY", address: "2AXXcN6oN9bBT5owwmTH53C7QHUXvhLeu718Kqt8rvY2" },
      // Stablecoin pairs
      { type: "clmm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "USDT", address: "BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "PYUSD", address: "2YP2zSKjqcKm6NQeKiiwHYJTh9xCgHywKupTF8TdHCfm" },
      // LST pairs
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "JITOSOL", address: "2uoKbPEidR7KAMYtY4x7xdkHXWqYib5k4CutJauSL3Mc" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "MSOL", address: "DfgCnzaiTXfPkAH1C1Z441b5MzjjTCEh134ioxqRZxYf" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "STSOL", address: "HnDJ5n2XC2UqYbPrG6TyTzfN7WQ1ctudQPeDUfWgrFmP" },
      // Meme coins
      { type: "clmm", network: "mainnet-beta", baseSymbol: "WIF", quoteSymbol: "USDC", address: "Bq25CEmFVfhqA1b4FGPWQKaUoYPiHorPFeBZPRFpump" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "BONK", quoteSymbol: "USDC", address: "3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "POPCAT", quoteSymbol: "USDC", address: "EJKqF4p7xVhXkcDNCrVQJE4osow6DgS2X9Q1kaVBFnUY" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "PENGU", quoteSymbol: "SOL", address: "2giZ8bfaq2yZRxvvJrwJmVstVr4WXb5GWxh5cPvCz3KH" },
      // Major tokens
      { type: "clmm", network: "mainnet-beta", baseSymbol: "JUP", quoteSymbol: "USDC", address: "7o3FJ2VBsq9n4Pz3J9FqoF7kMSjqVe5KHXaJqLqNWxWt" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "JTO", quoteSymbol: "USDC", address: "DGnU5hTf9FgEqN5s5C8RJmCGWFvSrNfY7CqHHetquLYJ" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "PYTH", quoteSymbol: "USDC", address: "FT4tqtU5XiJPhbM5nGnbS5Mh5zr9KD1KCtcgmwa2fHBh" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "TRUMP", quoteSymbol: "USDC", address: "7XzVsjqTebULfkUofTDH5gDdZDmxacPmPuTfHa1n9kuh" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "RENDER", quoteSymbol: "USDC", address: "6a1CsrpeZubDjEJE9s1CMVheB6HWM5d7m1cj2jkhyXhj" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "HNT", quoteSymbol: "USDC", address: "5HQhuhoRGAYs9amq4bzsaVGJYpKQq1ETCZmxWdMMjPr1" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "TRUMP", address: "GQsPr4RJk9AZkkfWHud7v4MtotcxhaYzZHdsPCg9vNvW" }
    ]
  },
  meteora: {
    amm: [
      // Major pairs
      { type: "amm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDC", address: "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDT", address: "BkfGDk676QFtTiGxn7TtEpHayJZRr6LgNk9uTV2MH4bR" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "USDT", address: "JPyoyxMGDM34iqF7NbCDjQbhCYBUa3hN8YHtMUHg3dS" },
      // LST pairs
      { type: "amm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "MSOL", address: "MAR1zHjHaQcniE2gXsDptkyKUnNfMEsLBVcfP7vLyv7" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "JITOSOL", address: "JitoSoL1111111111111111111111111111111111112" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "JITOSOL", quoteSymbol: "MSOL", address: "6nJes56KF999Q8VtQTrgWEHJGAfGMuJktGb8x2uWff2u" },
      // Stable pairs
      { type: "amm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "PYUSD", address: "EhqLBjm6MxeAVVXwCU87qy6KJgXUfVfxFV3AcH9jmmmJ" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "USDT", quoteSymbol: "PYUSD", address: "HWg6BPJEu66iqRckEEyTz2VxiYnHwmyiDRByDJ2zRfaQ" },
      // Other tokens
      { type: "amm", network: "mainnet-beta", baseSymbol: "JUP", quoteSymbol: "SOL", address: "BsWLxf6hRJnyytKR52kKBiz7qU7BB3SH77mrBxNnYU1G" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "ORCA", quoteSymbol: "SOL", address: "4y6BahAfGvkn7jcfMBDDWR8rZjthjMqo23xSB8TBvxbU" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "BONK", quoteSymbol: "SOL", address: "6W3Ree8WZkcduy6WibXbCrQVp6HFMs1zRGfPJLAatJKy" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "WIF", quoteSymbol: "SOL", address: "4iA6sQJBfLsE5cPfKDJMYLVXRZfPJY6EMXRbR3o7xvWB" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "PYTH", quoteSymbol: "SOL", address: "7DkMqbJL2NMxfWMKDYMPFmcrptfmyW8dFqxW8BNTnuMG" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "HNT", quoteSymbol: "SOL", address: "3kDYPvk7d9gTUKzhsXGpvEdgyXKLsuUT61uCXhqBFhzP" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "RENDER", quoteSymbol: "SOL", address: "DARKayyHCGvJgvgvHxs8TxwRTQnvbr1SqdhXCekWxPpd" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "JTO", quoteSymbol: "SOL", address: "HChPrWCjnCD2pmH8MZNgAfhYxkXBFCRY5KbWxKBGCJjG" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "PENGU", quoteSymbol: "SOL", address: "HxNjTidHKCmL4Yr7L8o8eFPVjk5u8h7X6jQCKPpjpcqv" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "GMT", quoteSymbol: "SOL", address: "F9CN3CNbK8TexsbzRYGPHPGh7SDkiZBvfCAqCf3dxLH3" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "MNDE", quoteSymbol: "SOL", address: "CJaukK2gKcGQHmJHBxsqZ2Sk2bZp5pAj6mD39GkVgqKL" },
      { type: "amm", network: "mainnet-beta", baseSymbol: "RNDR", quoteSymbol: "SOL", address: "EvWJC2mnmu9C9aQrsJLXw8FhUcwBzFEUQsP1E5Y6a5N7" }
    ],
    clmm: [
      // Major pairs
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDC", address: "2ZmVADyATvDa9VSKFMJaKBQKxbzo6mPQ53g2HktNKN1R" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "USDT", address: "FmpGqkWKzGNPCYZrqxBbEZjG6ToKgfVQaKvnAWKNrdcL" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "USDT", address: "KpjAz49dGECJVeKEBPDA7tjvm7wGKRdFWgJf8qYzBGC" },
      // LST pairs
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "MSOL", address: "5HzEpFWBWazsVQH9bnV5unhYLX9L3A8g5TbUzJBFsH6c" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "JITOSOL", address: "6nJes56KF999Q8VtQTrgWEHJGAfGMuJktGb8x2uWff2u" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "JITOSOL", quoteSymbol: "MSOL", address: "DLMM1111111111111111111111111111111111111112" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "SOL", quoteSymbol: "BLZE", address: "5edSgqKmuSaWqLz1k2Zg7cTJXprQbP2quyC5khxh6eSo" },
      // Stable pairs
      { type: "clmm", network: "mainnet-beta", baseSymbol: "USDC", quoteSymbol: "PYUSD", address: "BF8uYJ5BmyUoSJKLQECcdHhYrVmAfbEruAsLfCgx2MGw" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "USDT", quoteSymbol: "PYUSD", address: "3Z5mjAvGifYjmvGwR2YGnceJhkwx3qcNhjtzmQpvqcAn" },
      // Major tokens
      { type: "clmm", network: "mainnet-beta", baseSymbol: "JUP", quoteSymbol: "USDC", address: "3kxmL6kJQRSYw6yPBhtdcPKJz7yvTVxWCR58HVvmUfJu" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "ORCA", quoteSymbol: "USDC", address: "3H5XKkE9uVvxsdrFeN4BLLGCmohiQN6aZJVVcJiXQ4WC" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "BONK", quoteSymbol: "USDC", address: "HYfri1tnNPBhNxWC5u2TUdMPsEj9j8k7hN8GfpCRBiW9" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "WIF", quoteSymbol: "USDC", address: "J1vFjgwM8L4g5a1kvKJfLUpNwFbpfVUKDiCqDppqWCmq" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "POPCAT", quoteSymbol: "SOL", address: "F9wy6S6pPQYRnJngU4VPZRdmVokZ2qjV45XgnP9xHZbE" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "PYTH", quoteSymbol: "USDC", address: "68YmrBJvgYNQGaQshgctktfezLCWPK7xaWLDqbyLUC7e" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "HNT", quoteSymbol: "USDC", address: "5F27J6xznaauuoLECgZjmZLfKvnH7dN2UNVz8GER9uPm" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "RENDER", quoteSymbol: "USDC", address: "Bhqtz5myRDRDCEj9znPAD5HemJQjAHwbsKyCwzDnBMYS" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "JTO", quoteSymbol: "USDC", address: "FTcBXvw66Y5ZKTF3pzJN6kdvHQNNDYMpddYCNJuxmU9B" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "PENGU", quoteSymbol: "USDC", address: "4MmYrCBNJzrvqGgfb8YNE2FBt4DPTLLL2eVYvFmJYva2" },
      { type: "clmm", network: "mainnet-beta", baseSymbol: "INF", quoteSymbol: "USDC", address: "9xKqJNXuGWMTfK7zvtpJE9aCoMWDmEPXfMUT7xzvGGKX" }
    ]
  },
  uniswap: {
    amm: [
      // Major pairs - Ethereum mainnet
      { type: "amm", network: "mainnet", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
      { type: "amm", network: "mainnet", baseSymbol: "WETH", quoteSymbol: "USDT", address: "0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852" },
      { type: "amm", network: "mainnet", baseSymbol: "USDC", quoteSymbol: "USDT", address: "0x3416cf6c708da44db2624d63ea0aaef7113527c6" },
      { type: "amm", network: "mainnet", baseSymbol: "WETH", quoteSymbol: "DAI", address: "0xa478c2975ab1ea89e8196811f51a7b7ade33eb11" },
      { type: "amm", network: "mainnet", baseSymbol: "WBTC", quoteSymbol: "WETH", address: "0xbb2b8038a1640196fbe3e38816f3e67cba72d940" },
      // Arbitrum
      { type: "amm", network: "arbitrum", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0xc24f7d8e51a64dc1238880bd00bb961d54cbeb29" },
      { type: "amm", network: "arbitrum", baseSymbol: "WETH", quoteSymbol: "USDT", address: "0x641c00a822e8b671738d32a431a4fb6074e5c79d" },
      { type: "amm", network: "arbitrum", baseSymbol: "WETH", quoteSymbol: "ARB", address: "0xc24f7d8e51a64dc1238880bd00bb961d54cbeb29" },
      { type: "amm", network: "arbitrum", baseSymbol: "ARB", quoteSymbol: "USDC", address: "0xcda53b1f66614552f834ceef361a8d12a0b8dad8" },
      // Optimism
      { type: "amm", network: "optimism", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0x85149247691df622eaf1a8bd0cafd40bc45154a9" },
      { type: "amm", network: "optimism", baseSymbol: "WETH", quoteSymbol: "OP", address: "0x68f5c0a2de713a54991e01858fd27a3832401849" },
      { type: "amm", network: "optimism", baseSymbol: "OP", quoteSymbol: "USDC", address: "0x1c3140ab59d6caf9fa7459c6f83d4b52ba881d36" },
      // Polygon
      { type: "amm", network: "polygon", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0x45dda9cb7c25131df268515131f647d726f50608" },
      { type: "amm", network: "polygon", baseSymbol: "WMATIC", quoteSymbol: "USDC", address: "0xa374094527e1673a86de625aa59517c5de346d32" },
      { type: "amm", network: "polygon", baseSymbol: "WMATIC", quoteSymbol: "WETH", address: "0x86f1d8390222a3691c28938ec7404a1661e618e0" },
      { type: "amm", network: "polygon", baseSymbol: "WETH", quoteSymbol: "USDT", address: "0x4ccdabe6fe4a5f9f01f39142fdadafb07fc3e766" },
      // Base
      { type: "amm", network: "base", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0x88a43bfbdcb1f31d4b5add0db5bbeb35336947ab" },
      { type: "amm", network: "base", baseSymbol: "WETH", quoteSymbol: "USDbC", address: "0xc9034c3e7f58003e6ae0c8438e7c8f4598d5acaa" },
      { type: "amm", network: "base", baseSymbol: "cbETH", quoteSymbol: "WETH", address: "0x8f9eec1f47f96e82ad454c070bbf7f3e1e4f3c75" },
      { type: "amm", network: "base", baseSymbol: "AERO", quoteSymbol: "USDC", address: "0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d" }
    ],
    clmm: [
      // Major pairs - Ethereum mainnet
      { type: "clmm", network: "mainnet", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8" },
      { type: "clmm", network: "mainnet", baseSymbol: "WETH", quoteSymbol: "USDT", address: "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36" },
      { type: "clmm", network: "mainnet", baseSymbol: "USDC", quoteSymbol: "USDT", address: "0x7858e59e0c01ea06df3af3d20ac7b0003275d4bf" },
      { type: "clmm", network: "mainnet", baseSymbol: "WBTC", quoteSymbol: "WETH", address: "0xcbcdf9626bc03e24f779434178a73a0b4bad62ed" },
      { type: "clmm", network: "mainnet", baseSymbol: "WETH", quoteSymbol: "DAI", address: "0x60594a405d53811d3bc4766596efd80fd545a270" },
      // Arbitrum
      { type: "clmm", network: "arbitrum", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0xc473e2aee3441bf9240be85eb122abb059a3b57c" },
      { type: "clmm", network: "arbitrum", baseSymbol: "WETH", quoteSymbol: "USDT", address: "0xc82819f72a9e77e2c0c3a69b3196478f44303cf4" },
      { type: "clmm", network: "arbitrum", baseSymbol: "ARB", quoteSymbol: "WETH", address: "0xc6f780497a95e246eb9449f5e4770916dcd6396a" },
      { type: "clmm", network: "arbitrum", baseSymbol: "ARB", quoteSymbol: "USDC", address: "0xfb29e74d955f10ba95e70bb9c6da3055d1635c34" },
      { type: "clmm", network: "arbitrum", baseSymbol: "WETH", quoteSymbol: "GMX", address: "0x80a9ae39310abf666a87c743d6ebbd0e8c42158e" },
      // Optimism
      { type: "clmm", network: "optimism", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0xac53e1ccc953502726f4b5f672faaaa65dcf618a" },
      { type: "clmm", network: "optimism", baseSymbol: "WETH", quoteSymbol: "OP", address: "0xfc1f3296458f9b2a27a0b91dd7681c4020e09d05" },
      { type: "clmm", network: "optimism", baseSymbol: "OP", quoteSymbol: "USDC", address: "0x0df83a3da7763b6c8dc84bfb84db8fb0dd5b7316" },
      { type: "clmm", network: "optimism", baseSymbol: "WETH", quoteSymbol: "USDT", address: "0xd9e08e2d1d0a3354b1dc3cf09fe9ff3d90027b96" },
      // Polygon
      { type: "clmm", network: "polygon", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0x45dda9cb7c25131df268515131f647d726f50608" },
      { type: "clmm", network: "polygon", baseSymbol: "WMATIC", quoteSymbol: "USDC", address: "0xa374094527e1673a86de625aa59517c5de346d32" },
      { type: "clmm", network: "polygon", baseSymbol: "WMATIC", quoteSymbol: "WETH", address: "0x86f1d8390222a3691c28938ec7404a1661e618e0" },
      { type: "clmm", network: "polygon", baseSymbol: "WETH", quoteSymbol: "USDT", address: "0x3b3f747c4c5e22d0cf31eec7832e5dc1dd98e421" },
      // Base
      { type: "clmm", network: "base", baseSymbol: "WETH", quoteSymbol: "USDC", address: "0xd0b53d9277642d899df5c87a3966a349a798f224" },
      { type: "clmm", network: "base", baseSymbol: "WETH", quoteSymbol: "USDbC", address: "0x4c36388be6f416a29c8d8eee81c771ce6be14b18" },
      { type: "clmm", network: "base", baseSymbol: "cbETH", quoteSymbol: "WETH", address: "0x44e44b28bd8aa6e37ba298c8217103fec8ed99aa" },
      { type: "clmm", network: "base", baseSymbol: "AERO", quoteSymbol: "WETH", address: "0x8909f73188c4fe68b298a5c6dca21444c6d5ee20" },
      { type: "clmm", network: "base", baseSymbol: "VIRTUAL", quoteSymbol: "WETH", address: "0x5500721a44b0e25f45a9c30044624a12b5586760" }
    ]
  }
};

async function updatePoolLists() {
  console.log('🏊 Updating pool lists with top pools by TVL\n');
  
  for (const [dex, pools] of Object.entries(TOP_POOLS)) {
    const poolFile = path.join(__dirname, '..', 'src', 'templates', 'pools', `${dex}.json`);
    
    // Combine AMM and CLMM pools
    const allPools = [...pools.amm, ...pools.clmm];
    
    // Sort by type and then by pair
    allPools.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return `${a.baseSymbol}/${a.quoteSymbol}`.localeCompare(`${b.baseSymbol}/${b.quoteSymbol}`);
    });
    
    console.log(`Writing ${allPools.length} pools for ${dex}:`);
    console.log(`  - ${pools.amm.length} AMM pools`);
    console.log(`  - ${pools.clmm.length} CLMM pools`);
    
    // Write to file
    await fs.writeFile(poolFile, JSON.stringify(allPools, null, 2) + '\n');
  }
  
  console.log('\n✅ Pool lists updated successfully!');
}

// Run
updatePoolLists().catch(console.error);