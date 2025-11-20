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
  amount: string;
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
  amount,
  onSelect,
}: QuoteCardProps) {
  const displayName = connector.charAt(0).toUpperCase() + connector.slice(1);

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all',
        selected && 'ring-2 ring-primary',
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
          <div className="flex items-center justify-between gap-6">
            {/* Router Name & Badge */}
            <div className="flex items-center gap-2 min-w-[120px]">
              <div className="font-semibold">{displayName}</div>
              {isBest && (
                <Badge variant="default" className="text-xs">
                  Best
                </Badge>
              )}
            </div>

            {/* Price - Primary metric */}
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">Price:</span>
              <span className="text-2xl font-bold">
                {quote.price !== undefined
                  ? parseFloat(quote.price.toFixed(4)).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })
                  : 'N/A'}
              </span>
            </div>

            {/* Key Metrics - Hidden on mobile */}
            <div className="hidden md:flex items-center gap-8 text-sm">
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">You Pay</span>
                <span className="font-medium">
                  {parseFloat(parseFloat(amount).toFixed(4)).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  })}{' '}
                  {fromToken}
                </span>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">You Receive</span>
                <span className="font-medium">
                  {parseFloat((quote.amountOut || 0).toFixed(4)).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  })}{' '}
                  {toToken}
                </span>
              </div>

              {quote.priceImpactPct !== undefined && (
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Price Impact</span>
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
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
