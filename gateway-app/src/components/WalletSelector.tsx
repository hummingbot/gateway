import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './ui/drawer';
import { Button } from './ui/button';
import { shortenAddress } from '@/lib/utils/string';
import { Check, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SolanaIcon } from './icons/SolanaIcon';
import { EthereumIcon } from './icons/EthereumIcon';

interface WalletData {
  chain: string;
  walletAddresses: string[];
}

interface WalletSelectorProps {
  allWallets: WalletData[];
  selectedWallet: string;
  selectedChain: string;
  onWalletChange: (wallet: string, chain: string) => void;
  onAddWallet: () => void;
}

export function WalletSelector({
  allWallets,
  selectedWallet,
  selectedChain,
  onWalletChange,
  onAddWallet,
}: WalletSelectorProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const hasWallets = allWallets.some((w) => w.walletAddresses.length > 0);

  const handleSelect = (wallet: string, chain: string) => {
    onWalletChange(wallet, chain);
    setOpen(false);
  };

  const handleAddWallet = () => {
    onAddWallet();
    setOpen(false);
  };

  const getChainIcon = (chain: string) => {
    switch (chain) {
      case 'solana':
        return <SolanaIcon className="inline-block w-5 h-5" />;
      case 'ethereum':
        return <EthereumIcon className="inline-block w-5 h-5" />;
      default:
        return <span className="inline-block w-5 h-5 text-center">●</span>;
    }
  };

  const getDisplayValue = () => {
    if (!selectedWallet) return 'Select wallet';
    return (
      <span className="flex items-center gap-2">
        {getChainIcon(selectedChain)}
        <span>{shortenAddress(selectedWallet)}</span>
      </span>
    );
  };

  const WalletList = ({ className }: { className?: string }) => (
    <div className={cn("space-y-4", className)}>
      {!hasWallets ? (
        <Button
          onClick={handleAddWallet}
          variant="outline"
          className="w-full justify-start"
        >
          + Add Wallet
        </Button>
      ) : (
        <>
          {allWallets.map((walletData) => (
            <div key={walletData.chain} className="space-y-1">
              <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                {walletData.chain.toUpperCase()}
              </div>
              {walletData.walletAddresses.map((wallet) => {
                const isSelected = selectedWallet === wallet && selectedChain === walletData.chain;
                return (
                  <Button
                    key={wallet}
                    onClick={() => handleSelect(wallet, walletData.chain)}
                    variant={isSelected ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    <span className="flex items-center gap-2 flex-1">
                      {getChainIcon(walletData.chain)}
                      <span>{shortenAddress(wallet)}</span>
                    </span>
                    {isSelected && <Check className="h-4 w-4" />}
                  </Button>
                );
              })}
            </div>
          ))}
          <div className="pt-2 border-t">
            <Button
              onClick={handleAddWallet}
              variant="outline"
              className="w-full justify-start"
            >
              + Add Wallet
            </Button>
          </div>
        </>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-48">
            {getDisplayValue()}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Wallet</DialogTitle>
            <DialogDescription>Choose a wallet or add a new one</DialogDescription>
          </DialogHeader>
          <WalletList className="max-h-[60vh] overflow-y-auto px-1" />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          title={selectedWallet ? shortenAddress(selectedWallet) : 'Select wallet'}
        >
          {selectedChain === 'solana' ? (
            <SolanaIcon className="h-6 w-6" />
          ) : selectedChain === 'ethereum' ? (
            <EthereumIcon className="h-6 w-6" />
          ) : (
            <Wallet className="h-6 w-6" />
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Select Wallet</DrawerTitle>
          <DrawerDescription>Choose a wallet or add a new one</DrawerDescription>
        </DrawerHeader>
        <WalletList className="px-4 pb-4 max-h-[60vh] overflow-y-auto" />
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
