import { Progress } from './ui/progress';
import { capitalize, shortenAddress } from '@/lib/utils/string';
import { formatTokenAmount } from '@/lib/utils/format';
import type { PositionWithConnector as Position } from '@/lib/gateway-types';

interface LiquidityPositionCardProps {
  position: Position;
}

export function LiquidityPositionCard({ position }: LiquidityPositionCardProps) {
  // Calculate total token amounts and percentages for progress bars
  const totalAmount = position.baseTokenAmount + position.quoteTokenAmount;
  const basePercentage = totalAmount > 0 ? (position.baseTokenAmount / totalAmount) * 100 : 50;
  const quotePercentage = totalAmount > 0 ? (position.quoteTokenAmount / totalAmount) * 100 : 50;

  const totalFees = position.baseFeeAmount + position.quoteFeeAmount;
  const baseFeePercentage = totalFees > 0 ? (position.baseFeeAmount / totalFees) * 100 : 50;
  const quoteFeePercentage = totalFees > 0 ? (position.quoteFeeAmount / totalFees) * 100 : 50;

  return (
    <div className="border rounded p-3 md:p-4 text-xs md:text-sm space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-muted-foreground">Connector:</span>
          <p className="font-medium">{capitalize(position.connector)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Pool:</span>
          <p className="font-mono text-xs truncate">{shortenAddress(position.poolAddress, 8, 6)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Price Range:</span>
          <p className="font-medium">
            {formatTokenAmount(position.lowerPrice)} - {formatTokenAmount(position.upperPrice)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Current Price:</span>
          <p className="font-medium">{formatTokenAmount(position.price)}</p>
        </div>
      </div>

      {/* Token Amounts with Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Token Amounts</span>
          <span className="text-muted-foreground">{formatTokenAmount(totalAmount)} total</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>Base: {formatTokenAmount(position.baseTokenAmount)}</span>
            <span className="text-muted-foreground">{basePercentage.toFixed(1)}%</span>
          </div>
          <Progress value={basePercentage} className="h-2" />
          <div className="flex justify-between text-xs">
            <span>Quote: {formatTokenAmount(position.quoteTokenAmount)}</span>
            <span className="text-muted-foreground">{quotePercentage.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Fees with Progress Bar */}
      {totalFees > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Unclaimed Fees</span>
            <span className="text-muted-foreground">{formatTokenAmount(totalFees)} total</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Base: {formatTokenAmount(position.baseFeeAmount)}</span>
              <span className="text-muted-foreground">{baseFeePercentage.toFixed(1)}%</span>
            </div>
            <Progress value={baseFeePercentage} className="h-2" />
            <div className="flex justify-between text-xs">
              <span>Quote: {formatTokenAmount(position.quoteFeeAmount)}</span>
              <span className="text-muted-foreground">{quoteFeePercentage.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Rewards */}
      {position.rewardAmount !== undefined && position.rewardAmount > 0 && (
        <div className="pt-2 border-t">
          <span className="text-muted-foreground text-xs">Rewards:</span>
          <p className="font-medium">{formatTokenAmount(position.rewardAmount)}</p>
        </div>
      )}
    </div>
  );
}
