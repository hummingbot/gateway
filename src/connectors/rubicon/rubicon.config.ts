import { TokenList } from '@uniswap/token-lists';
import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

const configManager = ConfigManagerV2.getInstance();

export namespace RubiconCLOBConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
    url: string;
    privateKeys: Record<string, string>;
  }

  export const config: NetworkConfig = {
    tradingTypes: ['CLOB_SPOT'],
    chainType: 'EVM',
    allowedSlippage: "2/100",
    availableNetworks: [ { chain: 'ethereum', networks: ['mainnet', 'arbitrum', 'arbitrumSepolia', 'optimism', 'base'] } ],
    url: "https://gladius.rubicon.finance",
    privateKeys: configManager.get('rubicon.privateKeys')
  };
}

export enum Network {
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GOERLI = 5,
  KOVAN = 42,
  OPTIMISM_KOVAN = 69,
  OPTIMISM_MAINNET = 10,
  OPTIMISM_SEPOLIA = 11155420,
  POLYGON_MAINNET = 137,
  POLYGON_MUMBAI = 80001, //MATIC
  BSC_MAINNET = 56,
  GNOSIS_CHAIN_MAINNET = 100,
  FANTOM_OPERA_MAINNET = 250,
  ARBITRUM_MAINNET = 42161,
  ARBITRUM_SEPOLIA = 421614,
  ARBITRUM_GOERLI = 421613,
  BASE_MAINNET = 8453,
  BASE_GOERLI = 84531,
  BASE_SEPOLIA = 84532,
  AVALANCHE_C_CHAIN_MAINNET = 43114,
  AURORA_MAINNET = 1313161554,
  OPTIMISM_GOERLI = 420, //OPG
}

export const tokenList: TokenList = {
  name: 'Rubicon Token List',
  timestamp: new Date().toISOString(),
  version: {
    major: 1,
    minor: 0,
    patch: 0,
  },
  tokens: [
    // Note: all tokens need to have their associated underlyingAssetGeckoID so we can query Coin Gecko and get price info
    // *NOTE THE FIRST COIN IN THE LIST WILL BE THE DEFAULT SELECTED TOKEN*
    // ** ERC20s **
    // **** TODO ENFORCE TYPE CAST ON REQUIRED EXTENSIONS ****

    // ** V1 MAINNET **

    // ** QUOTES **
    {
      name: 'USDC Stablecoin',
      symbol: 'USDC',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      decimals: 6,
      
      extensions: {
        quote: true,
        underlyingAssetGeckoID: 'usd-coin',
      },
    },
    {
      name: 'DAI Stablecoin',
      symbol: 'DAI',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
      
      extensions: {
        quote: true,
        underlyingAssetGeckoID: 'dai',
      },
    },
    {
      name: 'USDT Stablecoin',
      symbol: 'USDT',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      decimals: 6,
      
      extensions: {
        quote: true,
        underlyingAssetGeckoID: 'tether',
      },
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      decimals: 18,
      
      address: '0x4200000000000000000000000000000000000006',
      chainId: Network.OPTIMISM_MAINNET,
      extensions: {
        underlyingAssetGeckoID: 'ethereum',
        //NEEDED FOR ANY INTERACTION THAT IS WRAPPER FOR NATIVE ASSET
        isNativeAssetWrapper: true,
      },
    },
    {
      symbol: 'OP',
      name: 'Optimism',
      decimals: 18,
      
      address: '0x4200000000000000000000000000000000000042',
      chainId: Network.OPTIMISM_MAINNET,
      extensions: {
        unsupportedQuotes: {
          USDT: true,
          DAI: true,
        },
        underlyingAssetGeckoID: 'optimism',
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      decimals: 8,
      
      address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      chainId: Network.OPTIMISM_MAINNET,
      extensions: {
        unsupportedQuotes: {
          USDT: true,
          DAI: true,
        },
        underlyingAssetGeckoID: 'wrapped-bitcoin',
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      symbol: 'SNX',
      name: 'Synthetix',
      decimals: 18,
      
      address: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4',
      chainId: Network.OPTIMISM_MAINNET,
      extensions: {
        unsupportedQuotes: {
          USDT: true,
          DAI: true,
        },
        underlyingAssetGeckoID: 'havven',
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },

    //  ** V1 Mainnet Bath Tokens ***

    {
      symbol: 'bathDAI',
      name: 'bathDAI v1',
      decimals: 18,
      
      address: '0x60daEC2Fc9d2e0de0577A5C708BcaDBA1458A833',
      chainId: Network.OPTIMISM_MAINNET,
      extensions: {
        underlyingTicker: 'DAI',
        rewardsLive: true,
        underlyingAssetGeckoID: 'dai',
        bathBuddy: '0x5fafd12ead4234270db300352104632187ed763a',
      },
    },

    {
      name: 'bathUSDC v1',
      symbol: 'bathUSDC',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0xe0e112e8f33d3f437D1F895cbb1A456836125952',
      decimals: 6,
      
      extensions: {
        underlyingTicker: 'USDC',
        rewardsLive: true,
        underlyingAssetGeckoID: 'usd-coin',
        bathBuddy: '0xfd6fd41bea9fd489ffdf05cd8118a69bf98caa5d',
      },
    },
    {
      symbol: 'bathUSDT',
      name: 'bathUSDT v1',
      decimals: 6,
      
      chainId: Network.OPTIMISM_MAINNET,
      address: '0xfFBD695bf246c514110f5DAe3Fa88B8c2f42c411',
      extensions: {
        underlyingTicker: 'USDT',
        rewardsLive: true,
        underlyingAssetGeckoID: 'tether',
        bathBuddy: '0xdffdbb54b9968fee543a8d2bd3ce7a80d66cd49f',
      },
    },
    {
      address: '0xB0bE5d911E3BD4Ee2A8706cF1fAc8d767A550497',
      chainId: Network.OPTIMISM_MAINNET,
      symbol: 'bathETH',
      extensions: {
        underlyingTicker: 'WETH',
        rewardsLive: true,
        underlyingAssetGeckoID: 'ethereum',
        bathBuddy: '0xf882defd9d5d988d05c6bca9061fc6f817f491c0',
        //NEEDED FOR ANY INTERACTION THAT IS WRAPPER FOR NATIVE ASSET
        isNativeAssetWrapper: true,
      },
      name: 'bathETH v1',
      decimals: 18,
      
    },
    {
      address: '0x7571CC9895D8E997853B1e0A1521eBd8481aa186',
      symbol: 'bathWBTC',
      extensions: {
        underlyingTicker: 'WBTC',
        rewardsLive: true,
        underlyingAssetGeckoID: 'bitcoin',
        bathBuddy: '0x30f5fe161da1cb92ac09e10b734de07d5c120fdd',
      },
      name: 'bathWBTC v1',
      decimals: 8,
      
      chainId: Network.OPTIMISM_MAINNET,
    },
    {
      address: '0xeb5F29AfaaA3f44eca8559c3e8173003060e919f',
      chainId: Network.OPTIMISM_MAINNET,
      symbol: 'bathSNX',
      extensions: {
        underlyingTicker: 'SNX',
        rewardsLive: true,
        underlyingAssetGeckoID: 'havven',
        bathBuddy: '0x505fb5d94c3cf68e13b5ba2ca1868f2b580007cc',
      },
      name: 'bathSNX v1',
      decimals: 18,
      
    },
    {
      address: '0x574a21fE5ea9666DbCA804C9d69d8Caf21d5322b',
      chainId: Network.OPTIMISM_MAINNET,
      symbol: 'bathOP',
      extensions: {
        underlyingTicker: 'OP',
        underlyingAssetGeckoID: 'optimism',
        rewardsLive: true,
        bathBuddy: '0xd528e1c99b0bdf1caf14f968f31adab81c59dcc8',
      },
      name: 'bathOP v1',
      decimals: 18,
      
    },
    {
      name: 'Worldcoin',
      symbol: 'WLD',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0xdC6fF44d5d932Cbd77B52E5612Ba0529DC6226F1',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Wrapped Liquid Staked Ether',
      symbol: 'wstETH',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '100',
      },
    },
    {
      name: 'Kwenta',
      symbol: 'KWENTA',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0x920Cf626a271321C151D027030D5d08aF699456b',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'PERP',
      symbol: 'PERP',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Synth sUSD',
      symbol: 'sUSD',
      chainId: Network.OPTIMISM_MAINNET,
      address: '0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'USDC',
        referenceVenueFeeTier: '100',
      },
    },

    /// *** ARBITRUM MAINNET ***
    {
      name: 'Wrapped Ethereum',
      symbol: 'WETH',
      chainId: Network.ARBITRUM_MAINNET,
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      decimals: 18,
      
      extensions: {
        underlyingAssetGeckoID: 'ethereum',
        isNativeAssetWrapper: true,
      },
    },
    {
      name: 'USDC Stablecoin',
      symbol: 'USDC',
      chainId: Network.ARBITRUM_MAINNET,
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Bridged USDC Stablecoin',
      symbol: 'USDC.e',
      chainId: Network.ARBITRUM_MAINNET,
      address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      decimals: 6,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'DAI Stablecoin',
      symbol: 'DAI',
      chainId: Network.ARBITRUM_MAINNET,
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Tether',
      symbol: 'USDT',
      chainId: Network.ARBITRUM_MAINNET,
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      chainId: Network.ARBITRUM_MAINNET,
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      decimals: 8,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Arbitrum',
      symbol: 'ARB',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Pendle',
      symbol: 'PENDLE',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Fluidity',
      symbol: 'FLY',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0x000F1720A263f96532D1ac2bb9CDC12b72C6f386',
      decimals: 6,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'USDC',
        referenceVenueFeeTier: '100',
      },
    },
    {
      name: 'GMX',
      symbol: 'GMX',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Graph Token',
      symbol: 'GRT',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0x9623063377AD1B27544C965cCd7342f7EA7e88C7',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Xai',
      symbol: 'XAI',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0x4Cb9a7AE498CEDcBb5EAe9f25736aE7d428C9D66',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'MAGIC',
      symbol: 'MAGIC',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Gains Network',
      symbol: 'GNS',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0x18c11FD286C5EC11c3b683Caa813B77f5163A122',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'ChainLink Token',
      symbol: 'LINK',
      chainId: Network.ARBITRUM_MAINNET,
      
      address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
      decimals: 18,
    },

    // *** BASE MAINNET ***
    {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      chainId: Network.BASE_MAINNET,
      
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
      extensions: {
        underlyingAssetGeckoID: 'ethereum',
        isNativeAssetWrapper: true,
      },
    },
    {
      name: 'USD Base Coin',
      symbol: 'USDbC',
      chainId: Network.BASE_MAINNET,
       // TODO: update to USDbC logo
      address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      decimals: 6,
      extensions: {
        quote: true,
      },
    },
    {
      name: 'USDC Stablecoin',
      symbol: 'USDC',
      chainId: Network.BASE_MAINNET,
       // TODO: update to USDbC logo
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      extensions: {
        quote: true,
      },
    },
    // {
    //   name: 'Coinbase Wrapped Staked ETH',
    //   symbol: 'cbETH',
    //   chainId: Network.BASE_MAINNET,
    //   
    //   address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    //   decimals: 18,
    // },
    {
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      chainId: Network.BASE_MAINNET,
      
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      decimals: 18,
      extensions: {
        quote: true,
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '500',
      },
    },

    // // Add Base MemeCoins: BALD, DEGEN, ELONrwa, TOSHI, BRETT, MOCHI, NORMIE
    // {
    //   name: 'Bald Coin',
    //   symbol: 'BALD',
    //   chainId: Network.BASE_MAINNET,
    //   // 
    //   address: '0xFe20C1B85ABa875EA8cecac8200bF86971968F3A',
    //   decimals: 18,
    // },
    {
      name: 'The Big Guy',
      symbol: 'BGUY',
      chainId: Network.BASE_MAINNET,
      
      address: '0x8931eE05EC111325c1700b68E5ef7B887e00661d',
      decimals: 9,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '500',
      },
    },

    {
      name: 'Degen Coin',
      symbol: 'DEGEN',
      chainId: Network.BASE_MAINNET,
      
      address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'higher',
      symbol: 'HIGHER',
      chainId: Network.BASE_MAINNET,
      
      address: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '10000',
      },
    },
    // {
    //   name: 'Elonrwa Coin',
    //   symbol: 'ELONrwa',
    //   chainId: Network.BASE_MAINNET,
    //   // 
    //   address: '0xAa6Cccdce193698D33deb9ffd4be74eAa74c4898',
    //   decimals: 18,
    // },
    {
      name: 'Aerodrome',
      symbol: 'AERO',
      chainId: Network.BASE_MAINNET,
      
      address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'BLERF',
      symbol: 'BLERF',
      chainId: Network.BASE_MAINNET,
      
      address: '0x347F500323D51E9350285Daf299ddB529009e6AE',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '100',
      },
    },
    {
      name: 'Toshi Coin',
      symbol: 'TOSHI',
      chainId: Network.BASE_MAINNET,
      
      address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '10000',
      },
    },
    {
      name: 'Keyboard Cat',
      symbol: 'KEYCAT',
      chainId: Network.BASE_MAINNET,
      
      address: '0x9a26F5433671751C3276a065f57e5a02D2817973',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '10000',
      },
    },
    {
      name: 'Internet Coin',
      symbol: 'INT',
      chainId: Network.BASE_MAINNET,
      
      address: '0x968D6A288d7B024D5012c0B25d67A889E4E3eC19',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '10000',
      },
    },
    {
      name: 'Brett Coin',
      symbol: 'BRETT',
      chainId: Network.BASE_MAINNET,
      
      address: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
      decimals: 18,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '10000',
      },
    },
    // {
    //   name: 'Mochi Coin',
    //   symbol: 'MOCHI',
    //   chainId: Network.BASE_MAINNET,
    //   // 
    //   address: '0xF6e932Ca12afa26665dC4dDE7e27be02A7c02e50',
    //   decimals: 18,
    // },
    {
      name: 'Normie Coin',
      symbol: 'NORMIE',
      chainId: Network.BASE_MAINNET,
      
      address: '0x7F12d13B34F5F4f0a9449c16Bcd42f0da47AF200',
      decimals: 9,
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '10000',
      },
    },
    // *** Arbitrum Sepolia
    {
      name: 'USDC Stablecoin',
      symbol: 'USDC',
      chainId: Network.ARBITRUM_SEPOLIA,
      address: '0xd28301B86800bBCF1f09a55642ee3E115Edb1f67',
      decimals: 18,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Test Token',
      symbol: 'TEST',
      chainId: Network.ARBITRUM_SEPOLIA,
      address: '0x2fc8011B01c988249ace25ec2c624079ac146e04',
      decimals: 18,
      
    },
    {
      name: 'Wrapped Ethereum',
      symbol: 'WETH',
      chainId: Network.ARBITRUM_SEPOLIA,
      address: '0xc556bAe1e86B2aE9c22eA5E036b07E55E7596074',
      decimals: 18,
      
      extensions: {
        underlyingAssetGeckoID: 'ethereum',
        isNativeAssetWrapper: true,
      },
    },

    // *** Arbitrum Goerli
    {
      name: 'Wrapped Ethereum',
      symbol: 'WETH',
      chainId: Network.ARBITRUM_GOERLI,
      address: '0x175a6d830579cacf1086ecc718fab2a86b12e0d3',
      decimals: 18,
      
      extensions: {
        underlyingAssetGeckoID: 'ethereum',
        isNativeAssetWrapper: true,
      },
    },
    {
      name: 'USDC Stablecoin',
      symbol: 'USDC',
      chainId: Network.ARBITRUM_GOERLI,
      address: '0x34cB584d2E4f3Cd37e93A46A4C754044085439b4',
      decimals: 18,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'DAI Stablecoin',
      symbol: 'DAI',
      chainId: Network.ARBITRUM_GOERLI,
      address: '0xb37b4399880AfEF7025755d65C193363966b8b89',
      decimals: 18,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Tether',
      symbol: 'USDT',
      chainId: Network.ARBITRUM_GOERLI,
      address: '0x6ABc1231d85D422c9Fe25b5974B4C0D4AB85d9b5',
      decimals: 18,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      chainId: Network.ARBITRUM_GOERLI,
      address: '0x710c1A969cbC8ab5644571697824c655ffBDE926',
      decimals: 18,
      
    },
    {
      name: 'Test Token',
      symbol: 'TEST',
      chainId: Network.ARBITRUM_GOERLI,
      
      address: '0x83250b2783554D4D401c45c39fF8A161dE44BC15',
      decimals: 18,
    },

    // Mumbai testing
    {
      address: '0x6aeda41c98ab5399044fc36162B57d39c13b658a',
      chainId: Network.POLYGON_MUMBAI,
      
      symbol: 'TEST',
      decimals: 18,
      name: 'Test Coin',
    },
    {
      address: '0xcC5f8571D858DAD7fA2238FB9df4Ad384493013C',
      chainId: Network.POLYGON_MUMBAI,
      symbol: 'USDC',
      
      decimals: 18,
      name: 'USDC Stablecoin',
      extensions: {
        quote: true,
      },
    },
    {
      address: '0xE412a307764cCBE02E055e926516ebD74230cfE0',
      chainId: Network.POLYGON_MUMBAI,
      symbol: 'WMATIC',
      
      decimals: 18,
      name: 'Wrapped Matic',
      extensions: {
        isNativeAssetWrapper: true,
      },
    },
    {
      address: '0xAb647DF8262580c1caB61Eb165B22616365d3C67',
      chainId: Network.POLYGON_MUMBAI,
      symbol: 'DAI',
      
      decimals: 18,
      name: 'DAI Stablecoin',
      extensions: {
        quote: true,
      },
    },

    // *** Ethereum Mainnet

    {
      name: 'Wrapped Ethereum',
      symbol: 'WETH',
      chainId: Network.MAINNET,
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      decimals: 18,
      
      extensions: {
        underlyingAssetGeckoID: 'ethereum',
        isNativeAssetWrapper: true,
      },
    },
    {
      name: 'USDC Stablecoin',
      symbol: 'USDC',
      chainId: Network.MAINNET,
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      decimals: 6,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'DAI Stablecoin',
      symbol: 'DAI',
      chainId: Network.MAINNET,
      address: '0x6b175474e89094c44da98b954eedeac495271d0f',
      decimals: 18,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Tether',
      symbol: 'USDT',
      chainId: Network.MAINNET,
      address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      decimals: 6,
      
      extensions: {
        quote: true,
      },
    },
    {
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      chainId: Network.MAINNET,
      address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
      decimals: 8,
      
    },
    // TODO: Plug in most liquid pair...
    {
      name: 'Synthetix Network Token',
      symbol: 'SNX',
      chainId: Network.MAINNET,
      address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Uniswap',
      symbol: 'UNI',
      chainId: Network.MAINNET,
      address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'ChainLink Token',
      symbol: 'LINK',
      chainId: Network.MAINNET,
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Aave Token',
      symbol: 'AAVE',
      chainId: Network.MAINNET,
      address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Compound',
      symbol: 'COMP',
      chainId: Network.MAINNET,
      address: '0xc00e94cb662c3520282e6f5717214004a7f26888',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Maker',
      symbol: 'MKR',
      chainId: Network.MAINNET,
      address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'SHIBA INU',
      symbol: 'SHIB',
      chainId: Network.MAINNET,
      address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
    {
      name: 'Ondo Finance',
      symbol: 'ONDO',
      chainId: Network.MAINNET,
      address: '0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3',
      decimals: 18,
      
      extensions: {
        referenceVenue: 'univ3',
        referenceVenueQuote: 'WETH',
        referenceVenueFeeTier: '3000',
      },
    },
  ],
};