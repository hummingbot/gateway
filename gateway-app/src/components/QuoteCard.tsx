import { Card, CardContent } from './ui/card';
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
        'cursor-pointer transition-all hover:bg-accent/50',
        selected && 'ring-2 ring-primary bg-accent/30',
        loading && 'opacity-60',
        error && 'border-destructive'
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        {loading && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="font-semibold">{displayName}</div>
            </div>
            <div className="text-sm text-muted-foreground">Loading quote...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between">
            <div className="font-semibold">{displayName}</div>
            <Alert variant="destructive" className="py-1 px-3 max-w-md">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {quote && !loading && !error && (
          <div className="flex items-center justify-between gap-4">
            {/* Router Name & Badge */}
            <div className="flex items-center gap-2 min-w-[120px]">
              <div className="font-semibold">{displayName}</div>
              {isBest && (
                <Badge variant="default" className="text-xs">
                  Best
                </Badge>
              )}
            </div>

            {/* Amount Out - Primary metric */}
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">You receive:</span>
              <span className="text-2xl font-bold">
                {formatTokenAmount(quote.amountOut || 0)}
              </span>
              <span className="text-sm text-muted-foreground">{toToken}</span>
            </div>

            {/* Key Metrics */}
            <div className="flex items-center gap-6 text-sm">
              {quote.price !== undefined && (
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Rate</span>
                  <span className="font-medium">
                    {quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                </div>
              )}

              {quote.priceImpactPct !== undefined && (
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Impact</span>
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
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Min Out</span>
                  <span className="font-medium">{formatTokenAmount(quote.minAmountOut)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
