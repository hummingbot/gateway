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

interface AddWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddWallet: (chain: string, privateKey: string) => Promise<void>;
  defaultChain?: string;
}

export function AddWalletModal({ open, onOpenChange, onAddWallet, defaultChain = 'ethereum' }: AddWalletModalProps) {
  const [selectedChain, setSelectedChain] = useState(defaultChain);
  const [privateKey, setPrivateKey] = useState('');
  const [loading, setLoading] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  async function handleSubmit() {
    if (!privateKey.trim()) {
      await showErrorNotification('Please enter a private key');
      return;
    }

    try {
      setLoading(true);
      await onAddWallet(selectedChain, privateKey);
      onOpenChange(false);
      setPrivateKey('');
    } catch (err) {
      await showErrorNotification('Failed to add wallet: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  const AddWalletForm = ({ className }: { className?: string }) => (
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
        <Label htmlFor="privateKey">Private Key</Label>
        <Input
          id="privateKey"
          type="password"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          placeholder="Enter private key"
          disabled={loading}
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full"
      >
        {loading ? 'Adding...' : 'Add Wallet'}
      </Button>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Wallet</DialogTitle>
            <DialogDescription>
              Add a new wallet by entering your private key
            </DialogDescription>
          </DialogHeader>
          <AddWalletForm />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Add Wallet</DrawerTitle>
          <DrawerDescription>
            Add a new wallet by entering your private key
          </DrawerDescription>
        </DrawerHeader>
        <AddWalletForm className="px-4" />
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
