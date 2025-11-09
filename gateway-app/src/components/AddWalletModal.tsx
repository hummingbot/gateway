import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';

interface AddWalletModalProps {
  onClose: () => void;
  onAddWallet: (chain: string, privateKey: string) => Promise<void>;
  defaultChain?: string;
}

export function AddWalletModal({ onClose, onAddWallet, defaultChain = 'ethereum' }: AddWalletModalProps) {
  const [selectedChain, setSelectedChain] = useState(defaultChain);
  const [privateKey, setPrivateKey] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!privateKey.trim()) {
      alert('Please enter a private key');
      return;
    }

    try {
      setLoading(true);
      await onAddWallet(selectedChain, privateKey);
      onClose();
    } catch (err) {
      alert('Failed to add wallet: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Add Wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Chain</label>
            <Select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
            >
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Private Key</label>
            <Input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="Enter private key"
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmit} className="flex-1" disabled={loading}>
              {loading ? 'Adding...' : 'Add Wallet'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
