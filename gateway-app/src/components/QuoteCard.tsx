import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { formatTokenAmount, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { RouterQuoteResponse } from '@/lib/gateway-types';

interface QuoteCardProps {
  connector: string;
  quote?: RouterQuoteResponse | null;
  error?: string | null;
  loading?: boolean;
  selected?: boolean;
  isBest?: boolean;
  fromToken: string;
  toToken: string;
  onSelect?: () => void;
}

export function QuoteCard({
  connector,
  quote,
  error,
  loading,
  selected,
  isBest,
  fromToken,
  toToken,
  onSelect,
}: QuoteCardProps) {
  const displayName = connector.charAt(0).toUpperCase() + connector.slice(1);

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        selected && 'ring-2 ring-primary',
        loading && 'opacity-60',
        error && 'border-destructive'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{displayName}</CardTitle>
          {isBest && !error && !loading && (
            <Badge variant="default" className="text-xs">
              Best
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="text-sm text-muted-foreground">Loading quote...</div>
        )}

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {quote && !loading && !error && (
          <>
            {/* Amount Out - Primary metric */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">You receive</div>
              <div className="text-2xl font-bold">
                {formatTokenAmount(quote.amountOut || 0)}
              </div>
              <div className="text-sm text-muted-foreground">{toToken}</div>
            </div>

            {/* Key Metrics */}
            <div className="space-y-2 pt-2 border-t">
              {quote.price !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rate:</span>
                  <span className="font-medium">
                    1 {fromToken} = {quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {toToken}
                  </span>
                </div>
              )}

              {quote.priceImpactPct !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price Impact:</span>
                  <span
                    className={cn(
                      'font-medium',
                      quote.priceImpactPct > 5 && 'text-destructive',
                      quote.priceImpactPct > 1 && quote.priceImpactPct <= 5 && 'text-yellow-600',
                      quote.priceImpactPct <= 1 && 'text-green-600'
                    )}
                  >
                    {formatPercent(quote.priceImpactPct)}
                  </span>
                </div>
              )}

              {quote.minAmountOut !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Min Received:</span>
                  <span>{formatTokenAmount(quote.minAmountOut)} {toToken}</span>
                </div>
              )}

              {quote.quoteId && (
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>Quote ID:</span>
                  <span className="font-mono">{quote.quoteId.substring(0, 8)}...</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
