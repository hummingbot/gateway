import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { getSelectableTokenList, TokenInfo } from '@/lib/utils';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import type { RouterQuoteResponse } from '@/lib/gateway-types';
import { shortenAddress } from '@/lib/utils/string';
import { formatTokenAmount, formatPrice, formatPercent } from '@/lib/utils/format';

// Extended quote result with additional UI-specific fields
interface QuoteResult extends Partial<RouterQuoteResponse> {
  expectedAmount?: string;
  priceImpactPct?: number;
}

export function SwapView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
  const [connector, setConnector] = useState('jupiter');
  const [fromToken, setFromToken] = useState('');
  const [toToken, setToToken] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);

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

      // Show pending notification
      await showSuccessNotification('⏳ Transaction pending... Swap is being executed');

      const result = await gatewayAPI.router.executeSwap(connector, {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        baseToken: fromToken,
        quoteToken: toToken,
        amount: parseFloat(amount),
        side: 'SELL',
      });

      // Show success notification with signature
      const txHash = result.signature;
      const successMessage = txHash
        ? `Swapped ${amount} ${fromToken} for ${toToken}\nTx: ${shortenAddress(txHash, 8, 6)}`
        : `Swapped ${amount} ${fromToken} for ${toToken}`;

      await showSuccessNotification(
        `✅ Swap executed successfully! ${successMessage}`
      );

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
        </CardHeader>
        <CardContent className="space-y-4 p-3 md:p-6">
          {/* Connector Selection */}
          <div>
            <label className="text-xs md:text-sm font-medium">Connector</label>
            <Select
              value={connector}
              onChange={(e) => setConnector(e.target.value)}
            >
              <option value="jupiter">Jupiter (Router)</option>
              <option value="0x">0x (Router)</option>
              <option value="uniswap">Uniswap (Router)</option>
            </Select>
          </div>

          {/* From Token */}
          <Card>
            <CardContent className="p-3 md:pt-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs md:text-sm font-medium">From</label>
                  <div className="text-xs md:text-sm text-muted-foreground">
                    Balance: {formatTokenAmount(fromBalance)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={fromToken}
                    onChange={(e) => setFromToken(e.target.value)}
                    className="w-32"
                  >
                    {availableTokens.map((token) => (
                      <option key={token.symbol} value={token.symbol}>
                        {token.symbol}
                      </option>
                    ))}
                  </Select>
                  <div className="flex-1 flex gap-2">
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleMaxClick}
                      variant="outline"
                      size="sm"
                      disabled={!fromBalance || fromBalance === '0'}
                    >
                      Max
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Swap Direction Indicator */}
          <div className="flex justify-center">
            <button
              onClick={handleSwapDirection}
              className="text-2xl p-2 hover:bg-accent rounded-full transition-colors cursor-pointer"
              title="Swap direction"
            >
              ⇅
            </button>
          </div>

          {/* To Token */}
          <Card>
            <CardContent className="p-3 md:pt-6">
              <div className="space-y-2">
                <label className="text-xs md:text-sm font-medium">To</label>
                <div className="flex gap-2">
                  <Select
                    value={toToken}
                    onChange={(e) => setToToken(e.target.value)}
                    className="w-32"
                  >
                    {availableTokens.map((token) => (
                      <option key={token.symbol} value={token.symbol}>
                        {token.symbol}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="text"
                    placeholder="0.0"
                    value={quote && quote.expectedAmount ? formatTokenAmount(quote.expectedAmount) : ''}
                    readOnly
                    className="flex-1 bg-muted"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

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
                    <div className="flex justify-between">
                      <span>Price:</span>
                      <span>{formatPrice(quote.price)}</span>
                    </div>
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
            <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
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
