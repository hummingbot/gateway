import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { showErrorNotification } from '@/lib/notifications';

interface AddTokenModalProps {
  onClose: () => void;
  onAddToken: (chain: string, network: string, address: string) => Promise<void>;
  defaultChain?: string;
  defaultNetwork?: string;
  availableNetworks: string[];
}

export function AddTokenModal({
  onClose,
  onAddToken,
  defaultChain = 'ethereum',
  defaultNetwork = 'mainnet',
  availableNetworks
}: AddTokenModalProps) {
  const [selectedChain, setSelectedChain] = useState(defaultChain);
  const [selectedNetwork, setSelectedNetwork] = useState(defaultNetwork);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!address.trim()) {
      await showErrorNotification('Please enter a token address');
      return;
    }

    try {
      setLoading(true);
      await onAddToken(selectedChain, selectedNetwork, address);
      onClose();
    } catch (err) {
      await showErrorNotification('Failed to add token: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Add Token</CardTitle>
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
            <label className="text-sm font-medium">Network</label>
            <Select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
            >
              {availableNetworks.map((network) => (
                <option key={network} value={network}>
                  {network}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Token Address</label>
            <Input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter token address"
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmit} className="flex-1" disabled={loading}>
              {loading ? 'Adding...' : 'Add Token'}
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
