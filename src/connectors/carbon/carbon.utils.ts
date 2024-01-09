const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();

export const decodeStrategyId = (strategyIdRaw: string): string[] => {
  const strategyId = BigInt(strategyIdRaw);
  const pairId = (strategyId >> BigInt(128)).toString();

  const strategyIndex = (
    strategyId & BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
  ).toString(10);

  return [pairId, strategyIndex];
};

export const encodeStrategyId = (
  strategyIndexRaw: string,
  pairIdRaw: string
): string => {
  const pairId = BigInt(pairIdRaw);
  const strategyIndex = BigInt(strategyIndexRaw);

  const strategyID = (pairId << BigInt(128)) | strategyIndex;

  return '0x' + strategyID.toString(16);
};

export const isETHAddress = (address: string) => {
  return address.toLowerCase() === ETH_ADDRESS;
};
