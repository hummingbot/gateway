import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Plus } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { AddTokenModal } from './AddTokenModal';
import { TokenDetailsModal } from './TokenDetailsModal';
import { ConfirmModal } from './ConfirmModal';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import { getSelectableTokenList, getTokenSymbol, TokenInfo } from '@/lib/utils';
import type { PositionWithConnector as Position, ConnectorConfig } from '@/lib/gateway-types';
import { capitalize, shortenAddress, getChainNetwork } from '@/lib/utils/string';
import { formatTokenAmount, formatBalance } from '@/lib/utils/format';
import { getCachedPrice, setCachedPrice } from '@/lib/price-cache';

interface Balance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  nativeValue?: number;
  usdcValue?: number;
}

export function PortfolioView() {
  const { selectedChain, selectedNetwork, selectedWallet, gatewayAvailable, gatewayConfig } = useApp();
  const navigate = useNavigate();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddToken, setShowAddToken] = useState(false);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  const [nativeSymbol, setNativeSymbol] = useState<string>('');
  const [tokenToDelete, setTokenToDelete] = useState<Balance | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<Balance | null>(null);
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  const [swapProvider, setSwapProvider] = useState<string>('');

  useEffect(() => {
    loadNetworks();
  }, [selectedChain]);

  useEffect(() => {
    if (!selectedWallet || !gatewayConfig) return;

    console.log('[PortfolioView] Chain/network/wallet changed, clearing state and fetching...');

    // Clear all state when chain/network changes to prevent stale data
    setBalances([]);
    setPositions([]);
    setSwapProvider('');
    setNativeSymbol('');
    setTokenList([]);

    fetchData();
    fetchPositions();
  }, [selectedChain, selectedNetwork, selectedWallet]);


  async function loadNetworks() {
    const configData = await gatewayAPI.config.getChains();
    const chainData = configData.chains?.find((c) => c.chain === selectedChain);
    if (chainData?.networks) {
      setAvailableNetworks(chainData.networks);
    }
  }

  // Fetch prices in background and update cache
  async function fetchPricesInBackground(tokens: string[], connector: string, nativeCurrency: string) {
    try {
      const chainNetwork = getChainNetwork(selectedChain, selectedNetwork);

      // Helper to get tradeable symbol (ETH → WETH)
      const getTradableSymbol = (symbol: string) => symbol === 'ETH' ? 'WETH' : symbol;

      // Fetch native→USDC rate
      let nativeToUsdcRate = 1;
      if (nativeCurrency !== 'USDC') {
        try {
          const quote = await gatewayAPI.trading.quoteSwap({
            chainNetwork,
            connector,
            baseToken: getTradableSymbol(nativeCurrency),
            quoteToken: 'USDC',
            amount: 1,
            side: 'SELL',
            slippagePct: 1,
          });
          nativeToUsdcRate = quote.amountOut;
        } catch (err) {
          console.warn(`Failed to fetch ${nativeCurrency}→USDC rate:`, err);
        }
      }

      // Fetch all token→native prices in parallel
      const pricePromises = tokens
        .filter((token) => token !== nativeCurrency && getTradableSymbol(token) !== getTradableSymbol(nativeCurrency))
        .map(async (token) => {
          try {
            const quote = await gatewayAPI.trading.quoteSwap({
              chainNetwork,
              connector,
              baseToken: getTradableSymbol(token),
              quoteToken: getTradableSymbol(nativeCurrency),
              amount: 1,
              side: 'SELL',
              slippagePct: 1,
            });

            const nativePrice = quote.amountOut;
            const usdcPrice = nativePrice * nativeToUsdcRate;

            // Update cache
            setCachedPrice(selectedChain, selectedNetwork, token, {
              nativePrice,
              usdcPrice,
              timestamp: Date.now(),
            });

            return { token, success: true };
          } catch (err) {
            console.warn(`Failed to fetch price for ${token}:`, err);
            return { token, success: false };
          }
        });

      await Promise.all(pricePromises);

      // Update native currency price
      setCachedPrice(selectedChain, selectedNetwork, nativeCurrency, {
        nativePrice: 1,
        usdcPrice: nativeToUsdcRate,
        timestamp: Date.now(),
      });

      // Add WETH if native is ETH
      const tradableNative = getTradableSymbol(nativeCurrency);
      if (tradableNative !== nativeCurrency) {
        setCachedPrice(selectedChain, selectedNetwork, tradableNative, {
          nativePrice: 1,
          usdcPrice: nativeToUsdcRate,
          timestamp: Date.now(),
        });
      }

      // Add USDC price
      if (nativeCurrency !== 'USDC') {
        setCachedPrice(selectedChain, selectedNetwork, 'USDC', {
          nativePrice: 1 / nativeToUsdcRate,
          usdcPrice: 1,
          timestamp: Date.now(),
        });
      }

      // Update balances with new prices from cache
      setBalances(prev => prev.map(balance => {
        const cachedPrice = getCachedPrice(selectedChain, selectedNetwork, balance.symbol);
        if (!cachedPrice) return balance;

        const balanceNum = parseFloat(balance.balance);
        return {
          ...balance,
          nativeValue: balanceNum * cachedPrice.nativePrice,
          usdcValue: balanceNum * cachedPrice.usdcPrice,
        };
      }));
    } catch (err) {
      console.error('Failed to fetch prices:', err);
    }
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      if (!gatewayConfig) {
        throw new Error('Gateway config not loaded');
      }

      // Get network config from gatewayConfig
      const networkKey = getChainNetwork(selectedChain, selectedNetwork);
      const networkConfig = gatewayConfig[networkKey];

      if (!networkConfig) {
        throw new Error(`Network config not found for ${networkKey}`);
      }

      // Get swapProvider and nativeCurrency from config
      const swapProvider = networkConfig.swapProvider;
      const nativeCurrency = networkConfig.nativeCurrencySymbol;

      setSwapProvider(swapProvider);
      setNativeSymbol(nativeCurrency);

      // Get selectable token list (native token first, no duplicates)
      const tokenList = await getSelectableTokenList(selectedChain, selectedNetwork);

      // Fetch wallet balances
      const balanceData = await gatewayAPI.chains.getBalances(selectedChain, {
        network: selectedNetwork,
        address: selectedWallet,
      });

      // Create a map of balances by symbol
      const balanceMap = new Map<string, string>();
      if (balanceData.balances) {
        Object.entries(balanceData.balances).forEach(([symbol, balance]) => {
          balanceMap.set(symbol, String(balance));
        });
      }

      // Build balances list from token list
      const mergedBalances: Balance[] = tokenList.map((token) => {
        const balanceStr = balanceMap.get(token.symbol) || '0';
        const balanceNum = parseFloat(balanceStr);

        // Get price from cache (will be undefined if not cached yet)
        const cachedPrice = getCachedPrice(selectedChain, selectedNetwork, token.symbol);

        return {
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          balance: balanceStr,
          nativeValue: cachedPrice ? balanceNum * cachedPrice.nativePrice : undefined,
          usdcValue: cachedPrice ? balanceNum * cachedPrice.usdcPrice : undefined,
        };
      });

      setBalances(mergedBalances);
      setTokenList(tokenList);

      // Fetch prices for tokens with non-zero balances (in background, updates cache)
      const tokensToFetch = mergedBalances
        .filter((b) => parseFloat(b.balance) > 0)
        .map((b) => b.symbol);

      if (tokensToFetch.length > 0) {
        fetchPricesInBackground(tokensToFetch, swapProvider, nativeCurrency);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }

  async function fetchPositions() {
    try {
      setLoadingPositions(true);

      // Fetch available CLMM connectors
      const configData = await gatewayAPI.config.getConnectors();
      const clmmConnectors = configData.connectors
        .filter((c) =>
          c.chain === selectedChain &&
          c.networks.includes(selectedNetwork) &&
          c.trading_types.includes('clmm')
        )
        .map((c) => c.name);

      // Fetch positions from all CLMM connectors
      const chainNetwork = getChainNetwork(selectedChain, selectedNetwork);
      const positionPromises = clmmConnectors.map(async (connector) => {
        const data = await gatewayAPI.clmm.getPositionsOwned(
          connector,
          chainNetwork,
          selectedWallet
        );
        return data.map((position) => ({
          ...position,
          connector,
        }));
      });

      const positionResults = await Promise.all(positionPromises);
      const allPositions = positionResults.flat();

      setPositions(allPositions);
    } catch (err) {
      setPositions([]);
      throw err;
    } finally {
      setLoadingPositions(false);
    }
  }

  async function handleAddToken(chain: string, network: string, address: string) {
    try {
      // Format chainNetwork parameter (e.g., "solana-mainnet-beta" or "ethereum-mainnet")
      const chainNetwork = getChainNetwork(chain, network);

      const response = await gatewayAPI.tokens.save(address, chainNetwork);

      // Reload data
      await fetchData();
      await showSuccessNotification(`${response.token.symbol} added successfully!`);
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to add token');
    }
  }

  async function handleDeleteToken() {
    if (!tokenToDelete || !tokenToDelete.address) return;

    const tokenSymbol = tokenToDelete.symbol;

    try {
      await gatewayAPI.tokens.delete(tokenToDelete.address, selectedChain, selectedNetwork);

      // Reload data
      await fetchData();
      await showSuccessNotification(`${tokenSymbol} deleted successfully!`);
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to delete token');
    } finally {
      setTokenToDelete(null);
    }
  }

  // Check Gateway availability first
  if (gatewayAvailable === null) {
    return <LoadingState message="Checking Gateway connection..." />;
  }

  if (gatewayAvailable === false) {
    return (
      <EmptyState
        title="Gateway API Unavailable"
        message="Please make sure the Gateway server is running at localhost:15888"
        icon="⚠️"
      />
    );
  }

  if (!selectedWallet) {
    return (
      <EmptyState
        title="No Wallet Selected"
        message="Please select a wallet from the dropdown above to view your portfolio."
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading portfolio..." />;
  }

  if (error) {
    return (
      <EmptyState
        title="Error"
        message={error}
      />
    );
  }

  // Calculate total portfolio values
  const totalNativeValue = balances.reduce((sum, b) => sum + (b.nativeValue || 0), 0);
  const totalUsdcValue = balances.reduce((sum, b) => sum + (b.usdcValue || 0), 0);

  // Calculate total positions values
  const totalPositionsNativeValue = positions.reduce((sum, position) => {
    const baseSymbol = getTokenSymbol(position.baseTokenAddress, tokenList, nativeSymbol);
    const quoteSymbol = getTokenSymbol(position.quoteTokenAddress, tokenList, nativeSymbol);

    const basePrice = getCachedPrice(selectedChain, selectedNetwork, baseSymbol);
    const quotePrice = getCachedPrice(selectedChain, selectedNetwork, quoteSymbol);

    const baseAmount = parseFloat(position.baseTokenAmount);
    const quoteAmount = parseFloat(position.quoteTokenAmount);

    const baseValue = basePrice ? baseAmount * basePrice.nativePrice : 0;
    const quoteValue = quotePrice ? quoteAmount * quotePrice.nativePrice : 0;

    return sum + baseValue + quoteValue;
  }, 0);

  const totalPositionsUsdcValue = positions.reduce((sum, position) => {
    const baseSymbol = getTokenSymbol(position.baseTokenAddress, tokenList, nativeSymbol);
    const quoteSymbol = getTokenSymbol(position.quoteTokenAddress, tokenList, nativeSymbol);

    const basePrice = getCachedPrice(selectedChain, selectedNetwork, baseSymbol);
    const quotePrice = getCachedPrice(selectedChain, selectedNetwork, quoteSymbol);

    const baseAmount = parseFloat(position.baseTokenAmount);
    const quoteAmount = parseFloat(position.quoteTokenAmount);

    const baseValue = basePrice ? baseAmount * basePrice.usdcPrice : 0;
    const quoteValue = quotePrice ? quoteAmount * quotePrice.usdcPrice : 0;

    return sum + baseValue + quoteValue;
  }, 0);

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-6">
      {/* Balances */}
      <Card>
        <CardHeader className="p-3 md:p-6">
          <div className="flex justify-between items-center">
            <CardTitle>Tokens</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-2xl font-bold">${formatBalance(totalUsdcValue.toString(), 2)}</span>
                <span className="text-sm text-muted-foreground">{formatBalance(totalNativeValue.toString(), 2)} {nativeSymbol}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 mt-3">
            <Checkbox
              id="hideZero"
              checked={hideZeroBalances}
              onCheckedChange={(checked) => setHideZeroBalances(checked === true)}
            />
            <Label htmlFor="hideZero" className="cursor-pointer text-sm">Hide Zero Balances</Label>
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6">
          <div className="space-y-4">
            {balances.length === 0 ? (
              <p className="text-muted-foreground">No tokens found</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Value ({nativeSymbol})</TableHead>
                      <TableHead className="text-right">Value (USDC)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balances
                      .filter(balance => !hideZeroBalances || balance.balance !== '0')
                      .map((balance, i) => {
                        const formattedBalance = formatBalance(balance.balance, 6);
                        const formattedNativeValue = balance.nativeValue
                          ? formatBalance(balance.nativeValue.toString(), 4)
                          : '-';
                        const formattedUsdcValue = balance.usdcValue
                          ? '$' + formatBalance(balance.usdcValue.toString(), 2)
                          : '-';

                        return (
                          <TableRow
                            key={i}
                            onClick={() => {
                              const token = tokenList.find(t => t.symbol === balance.symbol);
                              if (token) {
                                setSelectedToken(token);
                                setSelectedBalance(balance);
                              }
                            }}
                            className="cursor-pointer hover:bg-accent/50"
                          >
                            <TableCell>
                              {balance.symbol}
                            </TableCell>
                            <TableCell>
                              {balance.name}
                            </TableCell>
                            <TableCell className="text-right">
                              {formattedBalance}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formattedNativeValue}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formattedUsdcValue}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
                <div className="flex justify-start pt-2">
                  <Button onClick={() => setShowAddToken(true)} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Token
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Positions */}
      <Card>
        <CardHeader className="p-3 md:p-6">
          <div className="flex justify-between items-center">
            <CardTitle>Positions</CardTitle>
            {positions.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-2xl font-bold">${formatBalance(totalPositionsUsdcValue.toString(), 2)}</span>
                  <span className="text-sm text-muted-foreground">{formatBalance(totalPositionsNativeValue.toString(), 2)} {nativeSymbol}</span>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6">
          {loadingPositions ? (
            <p className="text-sm text-muted-foreground">Loading positions...</p>
          ) : positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No positions found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>Trading Pair</TableHead>
                  <TableHead className="text-right">Base Amount</TableHead>
                  <TableHead className="text-right">Quote Amount</TableHead>
                  <TableHead className="text-right">Value ({nativeSymbol})</TableHead>
                  <TableHead className="text-right">Value (USDC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position, i) => {
                  // Get token symbols from token list by address
                  const baseSymbol = getTokenSymbol(position.baseTokenAddress, tokenList, nativeSymbol);
                  const quoteSymbol = getTokenSymbol(position.quoteTokenAddress, tokenList, nativeSymbol);
                  const tradingPair = `${baseSymbol}/${quoteSymbol}`;

                  // Calculate position value
                  const basePrice = getCachedPrice(selectedChain, selectedNetwork, baseSymbol);
                  const quotePrice = getCachedPrice(selectedChain, selectedNetwork, quoteSymbol);

                  const baseAmount = parseFloat(position.baseTokenAmount);
                  const quoteAmount = parseFloat(position.quoteTokenAmount);

                  const baseNativeValue = basePrice ? baseAmount * basePrice.nativePrice : 0;
                  const quoteNativeValue = quotePrice ? quoteAmount * quotePrice.nativePrice : 0;
                  const positionNativeValue = baseNativeValue + quoteNativeValue;

                  const baseUsdcValue = basePrice ? baseAmount * basePrice.usdcPrice : 0;
                  const quoteUsdcValue = quotePrice ? quoteAmount * quotePrice.usdcPrice : 0;
                  const positionUsdcValue = baseUsdcValue + quoteUsdcValue;

                  const formattedNativeValue = positionNativeValue > 0
                    ? formatBalance(positionNativeValue.toString(), 4)
                    : '-';
                  const formattedUsdcValue = positionUsdcValue > 0
                    ? '$' + formatBalance(positionUsdcValue.toString(), 2)
                    : '-';

                  return (
                    <TableRow
                      key={i}
                      onClick={() => {
                        navigate(`/pools/${position.poolAddress}`);
                      }}
                      className="cursor-pointer hover:bg-accent/50"
                    >
                      <TableCell>{capitalize(position.connector)}</TableCell>
                      <TableCell>{tradingPair}</TableCell>
                      <TableCell className="text-right">
                        {formatTokenAmount(position.baseTokenAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatTokenAmount(position.quoteTokenAmount)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formattedNativeValue}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formattedUsdcValue}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Token Modal */}
      <AddTokenModal
        open={showAddToken}
        onOpenChange={setShowAddToken}
        onAddToken={handleAddToken}
        defaultChain={selectedChain}
        defaultNetwork={selectedNetwork}
        availableNetworks={availableNetworks}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!tokenToDelete}
        onOpenChange={(open) => {
          if (!open) setTokenToDelete(null);
        }}
        title="Delete Token"
        description={tokenToDelete ? `Are you sure you want to delete ${tokenToDelete.symbol} (${tokenToDelete.name}) from your token list?` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteToken}
        destructive={true}
      />

      {/* Token Details Modal */}
      <TokenDetailsModal
        open={!!selectedToken}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedToken(null);
            setSelectedBalance(null);
          }
        }}
        token={selectedToken}
        balance={selectedBalance}
        chain={selectedChain}
        network={selectedNetwork}
        nativeSymbol={nativeSymbol}
        onDeleteToken={(balance) => {
          setTokenToDelete(balance);
        }}
      />
    </div>
  );
}
