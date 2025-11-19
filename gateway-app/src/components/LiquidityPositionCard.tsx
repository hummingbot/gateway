import { useMemo } from 'react';
import { Button } from './ui/button';
import { capitalize, shortenAddress } from '@/lib/utils/string';
import { formatTokenAmount } from '@/lib/utils/format';
import type { PositionWithConnector as Position } from '@/lib/gateway-types';
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

interface LiquidityPositionCardProps {
  position: Position;
  onCollectFees?: (position: Position) => void;
  onClosePosition?: (position: Position) => void;
}

export function LiquidityPositionCard({ position, onCollectFees, onClosePosition }: LiquidityPositionCardProps) {
  // Generate chart data for step area chart
  const chartData = useMemo(() => {
    const currentPrice = position.price;
    const quoteLiquidity = position.quoteTokenAmount;
    const baseLiquidity = position.baseTokenAmount * currentPrice;

    return [
      {
        price: position.lowerPrice,
        quote: quoteLiquidity,
        base: 0,
      },
      {
        price: currentPrice,
        quote: quoteLiquidity,
        base: 0,
      },
      {
        price: currentPrice,
        quote: 0,
        base: baseLiquidity,
      },
      {
        price: position.upperPrice,
        quote: 0,
        base: baseLiquidity,
      },
    ];
  }, [position]);

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
      </div>

      {/* Position Liquidity Visualization */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Liquidity Distribution</div>
        <ChartContainer
          config={{
            quote: {
              label: 'Quote',
              color: 'hsl(var(--accent))',
            },
            base: {
              label: 'Base',
              color: 'hsl(var(--primary))',
            },
          }}
          className="h-[120px] w-full"
        >
          <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="fillQuote" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillBase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="price"
              tickFormatter={(value: any) => value.toFixed(2)}
              tick={{ fontSize: 10 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_: any, payload: any) => {
                    if (payload && payload[0]) {
                      return `Price: ${payload[0].payload.price.toFixed(4)}`;
                    }
                    return '';
                  }}
                  formatter={(value: any, name: any) => {
                    if (value === 0) return null;
                    return [`${Number(value).toFixed(4)}`, name === 'quote' ? 'Quote' : 'Base'];
                  }}
                />
              }
            />
            <ReferenceLine
              x={position.price}
              stroke="hsl(var(--foreground))"
              strokeDasharray="3 3"
              label={{ value: 'Current', position: 'top', fontSize: 10 }}
            />
            <Area
              type="step"
              dataKey="quote"
              stroke="hsl(var(--accent))"
              fill="url(#fillQuote)"
              fillOpacity={1}
            />
            <Area
              type="step"
              dataKey="base"
              stroke="hsl(var(--primary))"
              fill="url(#fillBase)"
              fillOpacity={1}
            />
          </AreaChart>
        </ChartContainer>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {formatTokenAmount(position.lowerPrice)} - {formatTokenAmount(position.upperPrice)}
          </span>
          <span className="text-muted-foreground">
            Current: {formatTokenAmount(position.price)}
          </span>
        </div>
      </div>

      {/* Unclaimed Fees */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Unclaimed Fees</div>
        <div className="flex justify-between text-xs">
          <span>Base:</span>
          <span className="font-medium">{formatTokenAmount(position.baseFeeAmount)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>Quote:</span>
          <span className="font-medium">{formatTokenAmount(position.quoteFeeAmount)}</span>
        </div>
      </div>

      {/* Rewards */}
      {position.rewardAmount !== undefined && position.rewardAmount > 0 && (
        <div className="pt-2 border-t">
          <span className="text-muted-foreground text-xs">Rewards:</span>
          <p className="font-medium">{formatTokenAmount(position.rewardAmount)}</p>
        </div>
      )}

      {/* Action Buttons */}
      {(onCollectFees || onClosePosition) && (
        <div className="pt-3 border-t flex gap-2">
          {onCollectFees && (
            <Button
              onClick={() => onCollectFees(position)}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              Collect Fees
            </Button>
          )}
          {onClosePosition && (
            <Button
              onClick={() => onClosePosition(position)}
              size="sm"
              variant="destructive"
              className="flex-1"
            >
              Close Position
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
