import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { showErrorNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

interface AddTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToken: (chain: string, network: string, address: string) => Promise<void>;
  defaultChain?: string;
  defaultNetwork?: string;
  availableNetworks: string[];
}

export function AddTokenModal({
  open,
  onOpenChange,
  onAddToken,
  defaultChain = 'ethereum',
  defaultNetwork = 'mainnet',
  availableNetworks
}: AddTokenModalProps) {
  const [selectedChain, setSelectedChain] = useState(defaultChain);
  const [selectedNetwork, setSelectedNetwork] = useState(defaultNetwork);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  async function handleSubmit() {
    if (!address.trim()) {
      await showErrorNotification('Please enter a token address');
      return;
    }

    try {
      setLoading(true);
      await onAddToken(selectedChain, selectedNetwork, address);
      onOpenChange(false);
      setAddress('');
    } catch (err) {
      await showErrorNotification('Failed to add token: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  const AddTokenForm = ({ className }: { className?: string }) => (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="chain">Chain</Label>
        <Select value={selectedChain} onValueChange={setSelectedChain}>
          <SelectTrigger id="chain">
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ethereum">Ethereum</SelectItem>
            <SelectItem value="solana">Solana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="network">Network</Label>
        <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
          <SelectTrigger id="network">
            <SelectValue placeholder="Select network" />
          </SelectTrigger>
          <SelectContent>
            {availableNetworks.map((network) => (
              <SelectItem key={network} value={network}>
                {network}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tokenAddress">Token Address</Label>
        <Input
          id="tokenAddress"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter token address"
          disabled={loading}
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full"
      >
        {loading ? 'Adding...' : 'Add Token'}
      </Button>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Token</DialogTitle>
            <DialogDescription>
              Add a new token by entering its contract address
            </DialogDescription>
          </DialogHeader>
          <AddTokenForm />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Add Token</DrawerTitle>
          <DrawerDescription>
            Add a new token by entering its contract address
          </DrawerDescription>
        </DrawerHeader>
        <AddTokenForm className="px-4" />
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
