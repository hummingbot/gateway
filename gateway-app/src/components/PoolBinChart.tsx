import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { BinLiquidity } from '@/lib/gateway-types';

interface PoolBinChartProps {
  bins: BinLiquidity[];
  activeBinId: number;
  lowerPrice?: number;
  upperPrice?: number;
}

export function PoolBinChart({ bins, activeBinId, lowerPrice, upperPrice }: PoolBinChartProps) {
  // Prepare chart data
  const chartData = useMemo(() => {
    return bins.map((bin) => {
      const totalLiquidity = bin.baseTokenAmount + bin.quoteTokenAmount;
      const isActive = bin.binId === activeBinId;
      const isInRange = lowerPrice !== undefined && upperPrice !== undefined
        ? bin.price >= lowerPrice && bin.price <= upperPrice
        : false;

      return {
        binId: bin.binId,
        price: bin.price,
        liquidity: totalLiquidity,
        baseAmount: bin.baseTokenAmount,
        quoteAmount: bin.quoteTokenAmount,
        isActive,
        isInRange,
        fill: isActive
          ? "hsl(var(--chart-2))" // Active bin - green
          : isInRange
          ? "hsl(var(--chart-3))" // In user's position range - blue
          : "hsl(var(--chart-1))", // Normal bin - default
      };
    });
  }, [bins, activeBinId, lowerPrice, upperPrice]);

  const chartConfig = {
    liquidity: {
      label: "Liquidity",
      color: "hsl(var(--chart-1))",
    },
    active: {
      label: "Active Bin",
      color: "hsl(var(--chart-2))",
    },
    range: {
      label: "Your Range",
      color: "hsl(var(--chart-3))",
    },
  } satisfies ChartConfig;

  // Find active bin for reference line
  const activeBin = bins.find(b => b.binId === activeBinId);

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="binId"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{ value: 'Bin ID', position: 'insideBottom', offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{ value: 'Liquidity', angle: -90, position: 'insideLeft' }}
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
                        <span className="text-muted-foreground">Total Liquidity:</span>
                        <span className="font-mono">{Number(value).toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Base:</span>
                        <span className="font-mono">{item.payload.baseAmount.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Quote:</span>
                        <span className="font-mono">{item.payload.quoteAmount.toFixed(4)}</span>
                      </div>
                      {item.payload.isActive && (
                        <div className="text-green-600 dark:text-green-400 font-medium mt-1">
                          ● Active Bin
                        </div>
                      )}
                      {item.payload.isInRange && !item.payload.isActive && (
                        <div className="text-blue-600 dark:text-blue-400 font-medium mt-1">
                          ● In Your Range
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
            x={activeBin.binId}
            stroke="hsl(var(--chart-2))"
            strokeDasharray="3 3"
            strokeWidth={2}
            label={{
              value: 'Active',
              position: 'top',
              fill: 'hsl(var(--chart-2))',
              fontSize: 12,
            }}
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}
