import { Asset } from '@chain-registry/types';

import {
  PriceHash,
} from '@osmonauts/math/dist/types';
import { CosmosAsset } from '../cosmos/cosmos-base';

type CoinGeckoId = string;
type CoinGeckoUSD = { usd: number };
type CoinGeckoUSDResponse = Record<CoinGeckoId, CoinGeckoUSD>;

const getAssetsWithGeckoIds = (assets: Asset[]) => {
  return assets.filter((asset) => !!asset?.coingecko_id);
};

const getGeckoIds = (assets: Asset[]) => {
  return assets.map((asset) => asset.coingecko_id) as string[];
};

const formatPrices = (
  prices: CoinGeckoUSDResponse,
  assets: Asset[]
): Record<string, number> => {
  return Object.entries(prices).reduce((priceHash, cur) => {
    const key = assets.find((asset) => asset.coingecko_id === cur[0])!.base;
    // const key = assets.find((asset) => asset.coingecko_id === cur[0])!.symbol;  // hash by symbol
    return { ...priceHash, [key]: cur[1].usd };
  }, {});
};

export const getCoinGeckoPrices = async (assets: Asset[]): Promise<Record<string, number>> => {
  const assetsWithGeckoIds = getAssetsWithGeckoIds(assets);
  const geckoIds = getGeckoIds(assetsWithGeckoIds);

  const priceData: CoinGeckoUSDResponse | undefined = await getData(geckoIds);
  if (priceData){
    return formatPrices(priceData, assetsWithGeckoIds)
  }
  throw new Error('Osmosis failed to get prices from coingecko.com')
};


const getData = async (
  geckoIds: string[]
): Promise<CoinGeckoUSDResponse | undefined> => {
  let prices: CoinGeckoUSDResponse;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join()}&vs_currencies=usd`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw Error('Get price error');
    prices = (await response.json()) as CoinGeckoUSDResponse;
    return prices;
  } catch (err) {
    console.error(err);
  }
  return undefined;
};

export const getImperatorPriceHash = async (tokenList?: CosmosAsset[]) => {
  let prices = [];

  try {
    const response = await fetch(
      'https://api-osmosis.imperator.co/tokens/v2/all'
    );
    if (!response.ok) throw Error('Get price error');
    prices = (await response.json()) as any[];
  } catch (err) {
    console.error(err);
  }

  var priceHash: PriceHash = {};
  // need to sort from symbol->denom input to make testnet denoms work (prices always come with mainnet denoms)
  if (tokenList && tokenList.length>0){
    prices.forEach((element) => {
      if (element.symbol){
        var testnet_element = tokenList.find(({symbol}) => symbol==element.symbol);
        if (testnet_element){
          priceHash[testnet_element.base] = element.price;
        }else{
          priceHash[element.denom] = element.price;
        }
      }else{
        priceHash[element.denom] = element.price;
      }
    });
  }else{
    priceHash = prices.reduce(
      (prev: any, cur: { denom: any; price: any }) => ({
        ...prev,
        [cur.denom]: cur.price,
      }),
      {}
    );
  }

  return priceHash;
};