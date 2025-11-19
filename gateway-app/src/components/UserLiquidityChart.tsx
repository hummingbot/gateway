import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface UserLiquidityChartProps {
  poolBins: Array<{
    binId: number;
    price: number;
    baseTokenAmount: number;
    quoteTokenAmount: number;
  }>;
  activeBinId: number;
  lowerPrice: number;
  upperPrice: number;
  userBaseAmount: number;
  userQuoteAmount: number;
  baseSymbol: string;
  quoteSymbol: string;
}

export function UserLiquidityChart({
  poolBins,
  activeBinId,
  lowerPrice,
  upperPrice,
  userBaseAmount,
  userQuoteAmount,
  baseSymbol,
  quoteSymbol,
}: UserLiquidityChartProps) {
  // Find the active bin (current price)
  const activeBin = useMemo(() => {
    return poolBins.find(b => b.binId === activeBinId);
  }, [poolBins, activeBinId]);

  // Filter bins within user's price range and calculate user's liquidity distribution
  const chartData = useMemo(() => {
    // Filter bins within the user's price range
    const binsInRange = poolBins.filter(
      (bin) => bin.price >= lowerPrice && bin.price <= upperPrice
    );

    if (binsInRange.length === 0 || !activeBin) return [];

    const currentPrice = activeBin.price;

    // Separate bins into left (< current) and right (>= current) of current price
    const binsLeft = binsInRange.filter(bin => bin.price < currentPrice);
    const binsRight = binsInRange.filter(bin => bin.price >= currentPrice);

    // Distribute base amount across left bins, quote amount across right bins
    const basePerBin = binsLeft.length > 0 ? userBaseAmount / binsLeft.length : 0;
    const quotePerBin = binsRight.length > 0 ? userQuoteAmount / binsRight.length : 0;

    return binsInRange.map((bin) => {
      const isLeft = bin.price < currentPrice;
      const isActive = bin.binId === activeBinId;

      // Left of current price: only base tokens
      // Right of current price: only quote tokens
      const baseAmount = isLeft ? basePerBin : 0;
      const quoteAmount = !isLeft ? quotePerBin : 0;

      // User's liquidity in this bin: price * base + quote
      const userLiquidity = bin.price * baseAmount + quoteAmount;

      return {
        binId: bin.binId,
        price: bin.price,
        liquidity: userLiquidity,
        baseAmount,
        quoteAmount,
        isActive,
        isLeft,
        // Use primary for base (left), accent for quote (right), but active bin shown via reference line
        fill: isLeft
          ? "hsl(var(--primary))"
          : "hsl(var(--accent))",
      };
    });
  }, [poolBins, activeBinId, lowerPrice, upperPrice, userBaseAmount, userQuoteAmount, activeBin]);

  const chartConfig = {
    liquidity: {
      label: "Your Liquidity",
      color: "hsl(var(--primary))",
    },
    base: {
      label: baseSymbol,
      color: "hsl(var(--primary))",
    },
    quote: {
      label: quoteSymbol,
      color: "hsl(var(--accent))",
    },
  } satisfies ChartConfig;

  if (chartData.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        No bins found in the selected price range
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="price"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{ value: 'Price', position: 'insideBottom', offset: -5 }}
          tickFormatter={(value: any) => value.toFixed(2)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{ value: 'Your Liquidity', angle: -90, position: 'insideLeft' }}
          tickFormatter={(value: any) => value.toFixed(2)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value: any, name: any, item: any) => {
                if (name === "liquidity") {
                  return (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Bin ID:</span>
                        <span className="font-mono">{item.payload.binId}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Price:</span>
                        <span className="font-mono">{item.payload.price.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Your Liquidity:</span>
                        <span className="font-mono">{Number(value).toFixed(4)}</span>
                      </div>
                      {item.payload.baseAmount > 0 && (
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{baseSymbol}:</span>
                          <span className="font-mono">{item.payload.baseAmount.toFixed(4)}</span>
                        </div>
                      )}
                      {item.payload.quoteAmount > 0 && (
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{quoteSymbol}:</span>
                          <span className="font-mono">{item.payload.quoteAmount.toFixed(4)}</span>
                        </div>
                      )}
                      {item.payload.isActive && (
                        <div className="text-muted-foreground font-medium mt-1">
                          ● Current Price
                        </div>
                      )}
                    </div>
                  );
                }
                return value;
              }}
            />
          }
        />
        <Bar dataKey="liquidity" radius={[4, 4, 0, 0]} />
        {activeBin && (
          <ReferenceLine
            x={activeBin.price}
            stroke="hsl(var(--foreground))"
            strokeDasharray="3 3"
            strokeWidth={2}
            label={{
              value: 'Current',
              position: 'top',
              fill: 'hsl(var(--foreground))',
              fontSize: 12,
            }}
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}
