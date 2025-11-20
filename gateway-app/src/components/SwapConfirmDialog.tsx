import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { formatTokenAmount, formatPercent } from '@/lib/utils/format';
import type { RouterQuoteResponse } from '@/lib/gateway-types';

interface SwapConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connector: string;
  quote: RouterQuoteResponse;
  fromToken: string;
  toToken: string;
  amount: string;
  onConfirm: () => void;
  loading?: boolean;
}

export function SwapConfirmDialog({
  open,
  onOpenChange,
  connector,
  quote,
  fromToken,
  toToken,
  amount,
  onConfirm,
  loading,
}: SwapConfirmDialogProps) {
  const displayConnector = connector.charAt(0).toUpperCase() + connector.slice(1);

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Swap</DialogTitle>
          <DialogDescription>
            Review your swap details before confirming the transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Router Info */}
          <div className="flex justify-between items-center p-3 bg-muted rounded-md">
            <span className="text-sm font-medium">Router:</span>
            <span className="text-sm font-bold">{displayConnector}</span>
          </div>

          {/* Swap Details */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">You pay:</span>
              <span className="text-sm font-semibold">
                {amount} {fromToken}
              </span>
            </div>

            <div className="flex justify-center text-muted-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </svg>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">You receive:</span>
              <span className="text-sm font-semibold">
                {formatTokenAmount(quote.amountOut || 0)} {toToken}
              </span>
            </div>
          </div>

          {/* Quote Details */}
          <div className="space-y-2 pt-3 border-t">
            {quote.price !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rate:</span>
                <span>
                  1 {fromToken} ={' '}
                  {quote.price.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 8,
                  })}{' '}
                  {toToken}
                </span>
              </div>
            )}

            {quote.priceImpactPct !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price Impact:</span>
                <span>{formatPercent(quote.priceImpactPct)}</span>
              </div>
            )}

            {quote.minAmountOut !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Min Received:</span>
                <span>
                  {formatTokenAmount(quote.minAmountOut)} {toToken}
                </span>
              </div>
            )}

            {quote.quoteId && (
              <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                <span>Quote ID:</span>
                <span className="font-mono">{quote.quoteId.substring(0, 12)}...</span>
              </div>
            )}
          </div>

          {/* Warning for high price impact */}
          {quote.priceImpactPct !== undefined && quote.priceImpactPct > 5 && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                High price impact ({formatPercent(quote.priceImpactPct)}). You may receive
                significantly less than expected.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading ? 'Confirming...' : 'Confirm Swap'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
