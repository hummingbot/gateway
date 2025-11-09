import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { gatewayGet, gatewayPost } from '@/lib/api';
import { useApp } from '@/lib/AppContext';

interface QuoteResult {
  expectedAmount: string;
  priceImpact?: number;
  route?: string[];
}

export function SwapView() {
  const { selectedNetwork, selectedWallet } = useApp();
  const [connector, setConnector] = useState('jupiter');
  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGetQuote() {
    if (!amount || !fromToken || !toToken) return;

    try {
      setLoading(true);
      setError(null);

      const quoteData = await gatewayGet<any>(
        `/connectors/${connector}/router/quote-swap?network=${selectedNetwork}&baseToken=${fromToken}&quoteToken=${toToken}&amount=${amount}&side=SELL`
      );

      setQuote({
        expectedAmount: quoteData.expectedAmount || '0',
        priceImpact: quoteData.priceImpact,
        route: quoteData.route,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteSwap() {
    if (!quote || !selectedWallet) return;

    try {
      setLoading(true);
      setError(null);

      await gatewayPost(`/connectors/${connector}/router/execute-swap`, {
        network: selectedNetwork,
        address: selectedWallet,
        baseToken: fromToken,
        quoteToken: toToken,
        amount: parseFloat(amount),
        side: 'SELL',
      });

      alert('Swap executed successfully!');
      setAmount('');
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute swap');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Swap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connector Selection */}
          <div>
            <label className="text-sm font-medium">Connector</label>
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
            <CardContent className="pt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">From</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Token symbol"
                    value={fromToken}
                    onChange={(e) => setFromToken(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Swap Direction Indicator */}
          <div className="flex justify-center">
            <span className="text-2xl">⇅</span>
          </div>

          {/* To Token */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">To</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Token symbol"
                    value={toToken}
                    onChange={(e) => setToToken(e.target.value)}
                    className="flex-1"
                  />
                </div>
                {quote && (
                  <div className="text-sm text-muted-foreground">
                    Expected: {parseFloat(quote.expectedAmount).toFixed(6)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quote Details */}
          {quote && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Expected Amount:</span>
                    <span className="font-semibold">
                      {parseFloat(quote.expectedAmount).toFixed(6)} {toToken}
                    </span>
                  </div>
                  {quote.priceImpact !== undefined && (
                    <div className="flex justify-between">
                      <span>Price Impact:</span>
                      <span>{quote.priceImpact.toFixed(2)}%</span>
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
