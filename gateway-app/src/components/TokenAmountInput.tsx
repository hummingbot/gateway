import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { formatTokenAmount } from '@/lib/utils/format';

interface TokenAmountInputProps {
  label: string;
  symbol: string;
  amount: string;
  balance?: string;
  onAmountChange: (amount: string) => void;
  onSymbolChange?: (symbol: string) => void;
  availableTokens?: { symbol: string; name?: string }[];
  showMaxButton?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function TokenAmountInput({
  label,
  symbol,
  amount,
  balance,
  onAmountChange,
  onSymbolChange,
  availableTokens,
  showMaxButton = true,
  disabled = false,
  placeholder = '0.0',
}: TokenAmountInputProps) {
  const handleMaxClick = () => {
    if (balance && balance !== '0') {
      onAmountChange(balance);
    }
  };

  const hasBalance = balance !== undefined && balance !== '0';

  return (
    <Card>
      <CardContent className="p-3 md:pt-6">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs md:text-sm font-medium">{label}</label>
            {balance !== undefined && (
              <div className="text-xs md:text-sm text-muted-foreground">
                Balance: {formatTokenAmount(balance)}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {availableTokens && onSymbolChange ? (
              <Select value={symbol} onValueChange={onSymbolChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTokens.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      {token.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-32 flex items-center px-3 py-2 border border-input bg-background rounded-md">
                <span className="font-medium">{symbol}</span>
              </div>
            )}
            <div className="flex-1 flex gap-2">
              <Input
                type="number"
                placeholder={placeholder}
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                disabled={disabled}
                className="flex-1"
              />
              {showMaxButton && (
                <Button
                  onClick={handleMaxClick}
                  variant="outline"
                  size="sm"
                  disabled={!hasBalance || disabled}
                >
                  Max
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
