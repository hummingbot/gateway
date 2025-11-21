import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Route, ArrowDownUp, ExternalLink } from 'lucide-react';
import { TokenAmountInput } from './TokenAmountInput';
import { QuoteCard } from './QuoteCard';
import { SwapConfirmDialog } from './SwapConfirmDialog';
import { toast } from 'sonner';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { getSelectableTokenList, TokenInfo } from '@/lib/utils';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import type { RouterQuoteResponse } from '@/lib/gateway-types';
import { shortenAddress } from '@/lib/utils/string';
import { getRouterConnectors } from '@/lib/utils/api-helpers';
import { getExplorerTxUrl } from '@/lib/utils/explorer';
import { openExternalUrl } from '@/lib/utils/external-link';

interface QuoteResult {
  quote: RouterQuoteResponse | null;
  error: string | null;
  loading: boolean;
}

export function SwapView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
  const [selectedRouters, setSelectedRouters] = useState<Set<string>>(new Set());
  const [fromToken, setFromToken] = useState('');
  const [toToken, setToToken] = useState('');
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<Map<string, QuoteResult>>(new Map());
  const [selectedQuote, setSelectedQuote] = useState<{
    connector: string;
    quote: RouterQuoteResponse;
  } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<string[]>([]);

  // Fetch available routers for the network
  useEffect(() => {
    async function fetchConnectors() {
      try {
        const connectors = await getRouterConnectors(selectedChain, selectedNetwork);
        setAvailableConnectors(connectors);

        // Fetch network status to get swapProvider
        const status = await gatewayAPI.chains.getStatus(selectedChain, selectedNetwork);

        // Select only the swapProvider by default, or all if not specified
        if (status.swapProvider) {
          // Extract connector name from swapProvider (e.g., "jupiter/router" -> "jupiter")
          const connectorName = status.swapProvider.split('/')[0];
          setSelectedRouters(new Set([connectorName]));
        } else {
          setSelectedRouters(new Set(connectors));
        }
      } catch (err) {
        console.error('Failed to fetch connectors:', err);
      }
    }

    fetchConnectors();
  }, [selectedChain, selectedNetwork]);

  // Fetch available tokens
  useEffect(() => {
    async function fetchTokens() {
      try {
        const tokens = await getSelectableTokenList(selectedChain, selectedNetwork);
        setAvailableTokens(tokens);

        if (tokens.length > 0) {
          setFromToken(tokens[0].symbol);
        }
        if (tokens.length > 1) {
          setToToken(tokens[1].symbol);
        }
      } catch (err) {
        console.error('Failed to fetch tokens:', err);
      }
    }

    fetchTokens();
  }, [selectedChain, selectedNetwork]);

  // Fetch wallet balances
  useEffect(() => {
    if (!selectedWallet) return;

    async function fetchBalances() {
      try {
        const balanceData = await gatewayAPI.chains.getBalances(selectedChain, {
          network: selectedNetwork,
          address: selectedWallet,
        });

        if (balanceData.balances) {
          const balancesMap: Record<string, string> = {};
          Object.entries(balanceData.balances).forEach(([symbol, balance]) => {
            balancesMap[symbol] = String(balance);
          });
          setBalances(balancesMap);
        }
      } catch (err) {
        console.error('Failed to fetch balances:', err);
      }
    }

    fetchBalances();
  }, [selectedChain, selectedNetwork, selectedWallet]);

  function handleRouterToggle(values: string[]) {
    setSelectedRouters(new Set(values));
  }

  function handleMaxClick() {
    const balance = balances[fromToken];
    if (balance) {
      setAmount(balance);
      setQuotes(new Map());
      setSelectedQuote(null);
    }
  }

  function handleAmountChange(newAmount: string) {
    setAmount(newAmount);
    setQuotes(new Map());
    setSelectedQuote(null);
  }

  function handleFromTokenChange(newToken: string) {
    setFromToken(newToken);
    setQuotes(new Map());
    setSelectedQuote(null);
  }

  function handleSwapDirection() {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    setQuotes(new Map());
    setSelectedQuote(null);
  }

  function handleToTokenChange(newToken: string) {
    setToToken(newToken);
    setQuotes(new Map());
    setSelectedQuote(null);
  }

  async function handleGetQuotes() {
    if (!amount || !fromToken || !toToken || selectedRouters.size === 0) return;

    const routerArray = Array.from(selectedRouters);

    // Initialize loading states
    const initialQuotes = new Map<string, QuoteResult>();
    routerArray.forEach((connector) => {
      initialQuotes.set(connector, { quote: null, error: null, loading: true });
    });
    setQuotes(initialQuotes);
    setSelectedQuote(null);

    // Fetch quotes in parallel
    const quotePromises = routerArray.map(async (connector) => {
      try {
        const quoteData = await gatewayAPI.router.quoteSwap(connector, {
          network: selectedNetwork,
          baseToken: fromToken,
          quoteToken: toToken,
          amount: parseFloat(amount),
          side: 'SELL',
        });

        return {
          connector,
          result: { quote: quoteData, error: null, loading: false },
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to get quote';
        return {
          connector,
          result: { quote: null, error: errorMsg, loading: false },
        };
      }
    });

    // Wait for all quotes and update state
    const results = await Promise.all(quotePromises);
    const updatedQuotes = new Map<string, QuoteResult>();
    results.forEach(({ connector, result }) => {
      updatedQuotes.set(connector, result);
    });
    setQuotes(updatedQuotes);

    // Auto-select best quote (highest amountOut)
    let bestConnector: string | null = null;
    let bestAmountOut = 0;
    results.forEach(({ connector, result }) => {
      if (result.quote && !result.error && result.quote.amountOut !== undefined) {
        if (result.quote.amountOut > bestAmountOut) {
          bestAmountOut = result.quote.amountOut;
          bestConnector = connector;
        }
      }
    });
    if (bestConnector) {
      const bestResult = updatedQuotes.get(bestConnector);
      if (bestResult?.quote) {
        setSelectedQuote({ connector: bestConnector, quote: bestResult.quote });
      }
    }
  }

  function handleQuoteSelect(connector: string, quote: RouterQuoteResponse) {
    setSelectedQuote({ connector, quote });
  }

  function handleExecuteClick() {
    if (selectedQuote) {
      setShowConfirmDialog(true);
    }
  }

  async function handleExecuteSwap() {
    if (!selectedQuote || !selectedWallet) return;

    const { connector, quote } = selectedQuote;

    try {
      setExecuting(true);

      const result = await gatewayAPI.router.executeSwap(connector, {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        baseToken: fromToken,
        quoteToken: toToken,
        amount: parseFloat(amount),
        side: 'SELL',
      });

      // Close dialog
      setShowConfirmDialog(false);

      // Show notification with transaction link
      const txHash = result.signature;
      if (txHash) {
        const explorerUrl = getExplorerTxUrl(selectedChain, selectedNetwork, txHash);

        toast.success(
          <div className="flex flex-col gap-1">
            <div>
              Swapped {amount} {fromToken} for {toToken}
            </div>
            <button
              onClick={() => openExternalUrl(explorerUrl)}
              className="text-xs text-primary hover:underline text-left flex items-center gap-1"
            >
              {shortenAddress(txHash, 8, 6)} <ExternalLink className="h-3 w-3" />
            </button>
          </div>,
          { duration: 3000 }
        );
      } else {
        await showSuccessNotification(`Swapped ${amount} ${fromToken} for ${toToken}`);
      }

      // Clear form
      setAmount('');
      setQuotes(new Map());
      setSelectedQuote(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to execute swap';
      await showErrorNotification(errorMsg);
    } finally {
      setExecuting(false);
    }
  }

  // Determine best quote based on highest amountOut
  function getBestConnector(): string | null {
    let bestConnector: string | null = null;
    let bestAmountOut = 0;

    quotes.forEach((result, connector) => {
      if (result.quote && !result.error && result.quote.amountOut !== undefined) {
        if (result.quote.amountOut > bestAmountOut) {
          bestAmountOut = result.quote.amountOut;
          bestConnector = connector;
        }
      }
    });

    return bestConnector;
  }

  const fromBalance = balances[fromToken] || '0';
  const bestConnector = getBestConnector();
  const hasQuotes = Array.from(quotes.values()).some((r) => r.quote !== null);
  const isLoadingAny = Array.from(quotes.values()).some((r) => r.loading);

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-xl md:text-2xl">Swap</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Compare quotes from multiple routers
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-4 md:p-6">
          {/* Router Selection */}
          <div>
            <label className="text-sm font-medium block mb-2">
              Routers ({selectedRouters.size} selected)
            </label>
            {availableConnectors.length > 0 ? (
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={Array.from(selectedRouters)}
                onValueChange={handleRouterToggle}
                className="justify-start"
              >
                {availableConnectors.map((connector) => (
                  <ToggleGroupItem
                    key={connector}
                    value={connector}
                    aria-label={`Toggle ${connector}`}
                    className="data-[state=on]:bg-transparent data-[state=on]:border-accent [&[data-state=on]_svg]:stroke-accent"
                  >
                    <Route className="h-4 w-4" />
                    {connector.charAt(0).toUpperCase() + connector.slice(1)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <p className="text-sm text-muted-foreground">
                No router connectors available for this network
              </p>
            )}
          </div>

          {/* From Token */}
          <TokenAmountInput
            label="From"
            symbol={fromToken}
            amount={amount}
            balance={fromBalance}
            onAmountChange={handleAmountChange}
            onSymbolChange={handleFromTokenChange}
            availableTokens={availableTokens}
          />

          {/* Swap Direction Indicator */}
          <div className="flex justify-center -my-2">
            <Button
              onClick={handleSwapDirection}
              variant="ghost"
              size="icon"
              className="rounded-full h-12 w-12"
              title="Swap direction"
            >
              <ArrowDownUp className="h-6 w-6" />
            </Button>
          </div>

          {/* To Token */}
          <TokenAmountInput
            label="To"
            symbol={toToken}
            amount={
              selectedQuote?.quote?.amountOut
                ? selectedQuote.quote.amountOut.toFixed(4)
                : ''
            }
            balance={balances[toToken] || '0'}
            onAmountChange={() => {}}
            onSymbolChange={handleToTokenChange}
            availableTokens={availableTokens}
          />

          {/* Get Quotes Button */}
          <Button
            onClick={handleGetQuotes}
            disabled={isLoadingAny || !amount || selectedRouters.size === 0}
            className="w-full h-12 text-base"
          >
            {isLoadingAny ? 'Fetching Quotes...' : 'Get Quotes'}
          </Button>

          {!selectedWallet && (
            <p className="text-sm text-muted-foreground text-center">
              Please select a wallet to execute swaps
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quote Cards - Full Width, Sorted by Best */}
      {quotes.size > 0 && (
        <div className="w-full max-w-4xl mx-auto space-y-4">
          <h3 className="text-lg font-semibold px-1">
            {hasQuotes ? 'Compare Quotes' : 'Loading...'}
          </h3>

          {/* Sorted Quote Cards */}
          <div className="space-y-2">
            {Array.from(quotes.entries())
              .sort(([, a], [, b]) => {
                // Sort by amountOut descending (highest amountOut first = best)
                const amountOutA = a.quote?.amountOut ?? 0;
                const amountOutB = b.quote?.amountOut ?? 0;
                return amountOutB - amountOutA;
              })
              .map(([connector, result]) => (
                <QuoteCard
                  key={connector}
                  connector={connector}
                  quote={result.quote}
                  error={result.error}
                  loading={result.loading}
                  selected={selectedQuote?.connector === connector}
                  isBest={!result.loading && !result.error && connector === bestConnector}
                  fromToken={fromToken}
                  toToken={toToken}
                  amount={amount}
                  onSelect={
                    result.quote ? () => handleQuoteSelect(connector, result.quote!) : undefined
                  }
                />
              ))}
          </div>

          {/* Execute Quote Button */}
          {hasQuotes && selectedQuote && (
            <Button
              onClick={handleExecuteClick}
              disabled={!selectedWallet}
              className="w-full h-12 text-base"
              size="lg"
            >
              Execute Swap on {selectedQuote.connector.charAt(0).toUpperCase() + selectedQuote.connector.slice(1)}
            </Button>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      {selectedQuote && (
        <SwapConfirmDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
          connector={selectedQuote.connector}
          quote={selectedQuote.quote}
          fromToken={fromToken}
          toToken={toToken}
          amount={amount}
          onConfirm={handleExecuteSwap}
          loading={executing}
        />
      )}
    </div>
  );
}
