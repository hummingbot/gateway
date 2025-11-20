import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { formatTokenAmount } from '@/lib/utils/format';

interface TokenAmountInputProps {
  label: string;
  symbol: string;
  amount: string;
  balance?: string;
  onAmountChange: (amount: string) => void;
  onSymbolChange?: (symbol: string) => void;
  availableTokens?: { symbol: string; name?: string }[];
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
  disabled = false,
  placeholder = '0.0',
}: TokenAmountInputProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleMaxClick = () => {
    if (balance && balance !== '0') {
      onAmountChange(balance);
    }
  };

  const handleSelect = (value: string) => {
    if (onSymbolChange) {
      onSymbolChange(value);
    }
    setOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim() && onSymbolChange) {
      onSymbolChange(inputValue.trim());
      setOpen(false);
      setInputValue('');
    }
  };

  const hasBalance = balance !== undefined && balance !== '0';

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        {availableTokens && onSymbolChange ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                role="combobox"
                aria-expanded={open}
                className="h-7 px-2 text-sm font-semibold hover:bg-accent -ml-2"
              >
                <span className="truncate">{symbol || 'Select...'}</span>
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Symbol or address..."
                  className="h-9"
                  value={inputValue}
                  onValueChange={setInputValue}
                  onKeyDown={handleInputKeyDown}
                />
                <CommandList>
                  <CommandEmpty>
                    {inputValue ? (
                      <div className="py-2 px-2 text-sm">
                        Press Enter to use: <span className="font-mono">{inputValue}</span>
                      </div>
                    ) : (
                      'No token found.'
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {availableTokens
                      .filter((token) =>
                        !inputValue ||
                        token.symbol.toLowerCase().includes(inputValue.toLowerCase()) ||
                        (token.name && token.name.toLowerCase().includes(inputValue.toLowerCase())) ||
                        (token.symbol.toLowerCase() === inputValue.toLowerCase())
                      )
                      .map((token) => (
                        <CommandItem
                          key={token.symbol}
                          value={token.symbol}
                          onSelect={() => handleSelect(token.symbol)}
                        >
                          <div className="flex items-center flex-1">
                            <span className="font-medium">{token.symbol}</span>
                            {token.name && (
                              <span className="ml-2 text-xs text-muted-foreground truncate">
                                {token.name}
                              </span>
                            )}
                          </div>
                          <Check
                            className={cn(
                              'ml-2 h-4 w-4 shrink-0',
                              symbol === token.symbol ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-sm font-semibold">{symbol}</span>
        )}
        {balance !== undefined && (
          <div className="text-sm text-muted-foreground">
            Balance:{' '}
            <button
              onClick={handleMaxClick}
              disabled={!hasBalance || disabled}
              className={cn(
                "font-medium",
                hasBalance && !disabled ? "text-primary hover:underline cursor-pointer" : "cursor-default"
              )}
            >
              {formatTokenAmount(balance)}
            </button>
          </div>
        )}
      </div>
      <Input
        type="number"
        placeholder={placeholder}
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        disabled={disabled}
        className="h-11"
      />
    </div>
  );
}
