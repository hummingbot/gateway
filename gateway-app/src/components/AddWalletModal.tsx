import { useState } from 'react';
import { ResponsiveModal } from './ResponsiveModal';
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

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Add Wallet"
      description="Add a new wallet by entering your private key"
    >
      <div className="space-y-4">
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

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? 'Adding...' : 'Add Wallet'}
        </Button>
      </div>
    </ResponsiveModal>
  );
}
