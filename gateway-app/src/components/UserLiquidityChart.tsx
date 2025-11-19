import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
  lowerPrice: number;
  upperPrice: number;
  userBaseAmount: number;
  userQuoteAmount: number;
  baseSymbol: string;
  quoteSymbol: string;
}

export function UserLiquidityChart({
  poolBins,
  lowerPrice,
  upperPrice,
  userBaseAmount,
  userQuoteAmount,
  baseSymbol,
  quoteSymbol,
}: UserLiquidityChartProps) {
  // Filter bins within user's price range and calculate user's liquidity distribution
  const chartData = useMemo(() => {
    // Filter bins within the user's price range
    const binsInRange = poolBins.filter(
      (bin) => bin.price >= lowerPrice && bin.price <= upperPrice
    );

    if (binsInRange.length === 0) return [];

    // Calculate total liquidity the user will provide across all bins
    // This is a simplified distribution - in reality, CLMM protocols have specific
    // formulas for distributing liquidity across bins based on current price
    const binsCount = binsInRange.length;
    const basePerBin = userBaseAmount / binsCount;
    const quotePerBin = userQuoteAmount / binsCount;

    return binsInRange.map((bin) => {
      // User's liquidity in this bin: price * base + quote
      const userLiquidity = bin.price * basePerBin + quotePerBin;

      return {
        binId: bin.binId,
        price: bin.price,
        liquidity: userLiquidity,
        baseAmount: basePerBin,
        quoteAmount: quotePerBin,
        fill: "hsl(var(--primary))", // User's liquidity color
      };
    });
  }, [poolBins, lowerPrice, upperPrice, userBaseAmount, userQuoteAmount]);

  const chartConfig = {
    liquidity: {
      label: "Your Liquidity",
      color: "hsl(var(--primary))",
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
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{baseSymbol}:</span>
                        <span className="font-mono">{item.payload.baseAmount.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{quoteSymbol}:</span>
                        <span className="font-mono">{item.payload.quoteAmount.toFixed(4)}</span>
                      </div>
                    </div>
                  );
                }
                return value;
              }}
            />
          }
        />
        <Bar dataKey="liquidity" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
