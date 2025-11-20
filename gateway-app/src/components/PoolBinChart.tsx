import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { BinLiquidity } from '@/lib/gateway-types';

interface PoolBinChartProps {
  bins: BinLiquidity[];
  activeBinId: number;
  lowerPrice?: number;
  upperPrice?: number;
}

export function PoolBinChart({ bins, activeBinId, lowerPrice, upperPrice }: PoolBinChartProps) {
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = no zoom, higher = zoomed in

  // Prepare chart data with zoom
  const chartData = useMemo(() => {
    // Find the active bin to determine current price
    const activeBin = bins.find(b => b.binId === activeBinId);
    const currentPrice = activeBin?.price;

    const allBins = bins.map((bin) => {
      const totalLiquidity = bin.price * bin.baseTokenAmount + bin.quoteTokenAmount;
      const isActive = bin.binId === activeBinId;
      const isInRange = lowerPrice !== undefined && upperPrice !== undefined
        ? bin.price >= lowerPrice && bin.price <= upperPrice
        : false;
      const isBelow = currentPrice !== undefined && bin.price < currentPrice;

      return {
        binId: bin.binId,
        price: bin.price,
        liquidity: totalLiquidity,
        baseAmount: bin.baseTokenAmount,
        quoteAmount: bin.quoteTokenAmount,
        isActive,
        isInRange,
        isBelow,
        fill: isActive
          ? "hsl(var(--accent))" // Active bin - accent color
          : isInRange && isBelow
          ? "hsl(var(--accent))" // In user's range below current price - accent color (cyan)
          : isInRange
          ? "hsl(var(--primary))" // In user's range above current price - primary color (purple)
          : "hsl(var(--muted-foreground))", // Normal bin - muted
      };
    });

    // Apply zoom by filtering bins around active bin
    if (zoomLevel > 1) {
      const activeBinIndex = allBins.findIndex(b => b.binId === activeBinId);
      if (activeBinIndex !== -1) {
        const binsToShow = Math.floor(allBins.length / zoomLevel);
        const halfRange = Math.floor(binsToShow / 2);
        const start = Math.max(0, activeBinIndex - halfRange);
        const end = Math.min(allBins.length, start + binsToShow);
        return allBins.slice(start, end);
      }
    }

    return allBins;
  }, [bins, activeBinId, lowerPrice, upperPrice, zoomLevel]);

  const chartConfig = {
    liquidity: {
      label: "Liquidity",
      color: "hsl(var(--muted-foreground))",
    },
    active: {
      label: "Active Bin",
      color: "hsl(var(--accent))",
    },
    range: {
      label: "Your Range",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  // Find active bin for reference line
  const activeBin = bins.find(b => b.binId === activeBinId);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.5, 10)); // Max 10x zoom
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.5, 1)); // Min 1x (no zoom)
  };

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleZoomIn}
          disabled={zoomLevel >= 10}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleZoomOut}
          disabled={zoomLevel <= 1}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
      <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 10 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="price"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{ value: 'Price', position: 'insideBottom', offset: -10 }}
          tickFormatter={(value: any) => value.toFixed(2)}
        />
        <YAxis
          hide
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
            x={activeBin.price}
            stroke="hsl(var(--foreground))"
            strokeDasharray="3 3"
            strokeWidth={2}
            label={{
              value: activeBin.price.toFixed(2),
              position: 'top',
              fill: 'hsl(var(--foreground))',
              fontSize: 12,
            }}
          />
        )}
      </BarChart>
    </ChartContainer>
    </div>
  );
}
