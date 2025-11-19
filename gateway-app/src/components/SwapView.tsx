import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { TokenAmountInput } from './TokenAmountInput';
import { toast } from 'sonner';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { getSelectableTokenList, TokenInfo } from '@/lib/utils';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import type { RouterQuoteResponse } from '@/lib/gateway-types';
import { shortenAddress } from '@/lib/utils/string';
import { formatTokenAmount, formatPrice, formatPercent } from '@/lib/utils/format';
import { getRouterConnectors } from '@/lib/utils/api-helpers';
import { getExplorerTxUrl } from '@/lib/utils/explorer';

// Extended quote result with additional UI-specific fields
interface QuoteResult extends Partial<RouterQuoteResponse> {
  expectedAmount?: string;
  priceImpactPct?: number;
}

export function SwapView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
  const [connector, setConnector] = useState('');
  const [fromToken, setFromToken] = useState('');
  const [toToken, setToToken] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<string[]>([]);

  useEffect(() => {
    async function fetchConnectors() {
      try {
        const connectors = await getRouterConnectors(selectedChain, selectedNetwork);
        setAvailableConnectors(connectors);

        // Set first available connector as default if current not in list
        if (connectors.length > 0 && !connectors.includes(connector)) {
          setConnector(connectors[0]);
        }
      } catch (err) {
        console.error('Failed to fetch router connectors:', err);
      }
    }

    fetchConnectors();
  }, [selectedChain, selectedNetwork]);

  useEffect(() => {
    async function fetchTokens() {
      try {
        const tokens = await getSelectableTokenList(selectedChain, selectedNetwork);
        setAvailableTokens(tokens);

        // Set default tokens on first load or when switching networks
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

  useEffect(() => {
    if (!selectedWallet) return;

    async function fetchBalances() {
      try {
        const balanceData = await gatewayAPI.chains.getBalances(selectedChain, {
          network: selectedNetwork,
          address: selectedWallet,
        });

        if (balanceData.balances) {
          // Convert balances from number to string for UI consistency
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

  function handleMaxClick() {
    const balance = balances[fromToken];
    if (balance) {
      setAmount(balance);
    }
  }

  function handleSwapDirection() {
    // Swap from and to tokens
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);

    // Clear quote since direction changed
    setQuote(null);
  }

  async function handleGetQuote() {
    if (!amount || !fromToken || !toToken) return;

    try {
      setLoading(true);
      setError(null);

      const quoteData = await gatewayAPI.router.quoteSwap(connector, {
        network: selectedNetwork,
        baseToken: fromToken,
        quoteToken: toToken,
        amount: parseFloat(amount),
        side: 'SELL',
      });

      setQuote({
        expectedAmount: String(quoteData.amountOut || '0'),
        priceImpactPct: quoteData.priceImpactPct,
        tokenIn: quoteData.tokenIn,
        tokenOut: quoteData.tokenOut,
        amountIn: quoteData.amountIn,
        amountOut: quoteData.amountOut,
        minAmountOut: quoteData.minAmountOut,
        maxAmountIn: quoteData.maxAmountIn,
        price: quoteData.price,
        quoteId: quoteData.quoteId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote');
      console.error('Quote error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteSwap() {
    if (!quote || !selectedWallet) return;

    try {
      setLoading(true);
      setError(null);

      const result = await gatewayAPI.router.executeSwap(connector, {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        baseToken: fromToken,
        quoteToken: toToken,
        amount: parseFloat(amount),
        side: 'SELL',
      });

      // Show notification with transaction link
      const txHash = result.signature;
      if (txHash) {
        const explorerUrl = getExplorerTxUrl(selectedChain, selectedNetwork, txHash);

        // Show custom toast with link
        toast.success(
          <div className="flex flex-col gap-1">
            <div>Swapped {amount} {fromToken} for {toToken}</div>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              {shortenAddress(txHash, 8, 6)} ↗
            </a>
          </div>,
          { duration: 3000 }
        );
      } else {
        await showSuccessNotification(`Swapped ${amount} ${fromToken} for ${toToken}`);
      }

      setAmount('');
      setQuote(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to execute swap';
      setError(errorMsg);
      await showErrorNotification(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  const fromBalance = balances[fromToken] || '0';

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-6">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="p-3 md:p-6">
          <CardTitle>Swap</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Router connectors only</p>
        </CardHeader>
        <CardContent className="space-y-4 p-3 md:p-6">
          {/* Connector Selection */}
          <div>
            <label className="text-xs md:text-sm font-medium block mb-2">Connector</label>
            <Select
              value={connector}
              onValueChange={setConnector}
              disabled={availableConnectors.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={availableConnectors.length === 0 ? "No router connectors available" : "Select connector"} />
              </SelectTrigger>
              <SelectContent>
                {availableConnectors.map((conn) => (
                  <SelectItem key={conn} value={conn}>
                    {conn.charAt(0).toUpperCase() + conn.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* From Token */}
          <TokenAmountInput
            label="From"
            symbol={fromToken}
            amount={amount}
            balance={fromBalance}
            onAmountChange={setAmount}
            onSymbolChange={setFromToken}
            availableTokens={availableTokens}
            showMaxButton={true}
          />

          {/* Swap Direction Indicator */}
          <div className="flex justify-center">
            <Button
              onClick={handleSwapDirection}
              variant="ghost"
              size="icon"
              className="text-2xl rounded-full"
              title="Swap direction"
            >
              ⇅
            </Button>
          </div>

          {/* To Token */}
          <TokenAmountInput
            label="To"
            symbol={toToken}
            amount={quote && quote.expectedAmount ? formatTokenAmount(quote.expectedAmount) : ''}
            balance={balances[toToken] || '0'}
            onAmountChange={() => {}}
            onSymbolChange={setToToken}
            availableTokens={availableTokens}
            showMaxButton={false}
            disabled={true}
          />

          {/* Quote Details */}
          {quote && (
            <Card>
              <CardContent className="p-3 md:pt-6">
                <div className="space-y-2 text-xs md:text-sm">
                  {quote.quoteId && (
                    <div className="flex justify-between border-b pb-2 mb-2">
                      <span>Quote ID:</span>
                      <span className="font-mono text-xs">{quote.quoteId.substring(0, 8)}...</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Amount In:</span>
                    <span className="font-semibold">
                      {formatTokenAmount(quote.amountIn || 0)} {fromToken}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount Out:</span>
                    <span className="font-semibold">
                      {formatTokenAmount(quote.amountOut || 0)} {toToken}
                    </span>
                  </div>
                  {quote.minAmountOut !== undefined && (
                    <div className="flex justify-between">
                      <span>Min Amount Out:</span>
                      <span>{formatTokenAmount(quote.minAmountOut)} {toToken}</span>
                    </div>
                  )}
                  {quote.price !== undefined && (
                    <>
                      <div className="flex justify-between">
                        <span>Price - {fromToken}/{toToken}:</span>
                        <span>{quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Price - {toToken}/{fromToken}:</span>
                        <span>{(1 / quote.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
                      </div>
                    </>
                  )}
                  {quote.priceImpactPct !== undefined && (
                    <div className="flex justify-between">
                      <span>Price Impact:</span>
                      <span>{formatPercent(quote.priceImpactPct)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleGetQuote}
              disabled={loading || !amount}
              className="flex-1"
              variant="outline"
            >
              {loading ? 'Loading...' : 'Get Quote'}
            </Button>
            <Button
              onClick={handleExecuteSwap}
              disabled={loading || !quote || !selectedWallet}
              className="flex-1"
            >
              {loading ? 'Executing...' : 'Swap'}
            </Button>
          </div>

          {!selectedWallet && (
            <p className="text-sm text-muted-foreground text-center">
              Please select a wallet to execute swaps
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
