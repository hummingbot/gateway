
export interface Fee {
  pool_id: string;
  volume_24h: number;
  volume_7d: number;
  fees_spent_24h: number;
  fees_spent_7d: number;
  fees_percentage: string;
}

export const fetchFees = async (): Promise<Fee[]> => {
  const url = 'https://api-osmosis.imperator.co/fees/v1/pools';
  return fetch(url)
    // .then(handleError)
    .then((res) => res.json())
    .then((res) => res.data);
};

type PoolReward = {
  day_usd: number;
  month_usd: number;
  year_usd: number;
};

type Rewards = {
  pools: {
    [key: number]: PoolReward;
  };
  total_day_usd: number;
  total_month_usd: number;
  total_year_usd: number;
};

export const fetchRewards = async (address: string): Promise<Rewards> => {
  const url = `https://api-osmosis-chain.imperator.co/lp/v1/rewards/estimation/${address}`;
  return fetch(url)
    // .then(handleError)
    .then((res) => res.json());
};

