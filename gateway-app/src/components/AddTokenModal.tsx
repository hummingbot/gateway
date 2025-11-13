import { useState } from 'react';
import { CardContent, CardHeader, CardTitle } from './ui/card';
import { BaseModal } from './ui/BaseModal';
import { FormField } from './ui/FormField';
import { ActionButtons } from './ui/ActionButtons';
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
    <BaseModal onClose={onClose}>
      <CardHeader>
        <CardTitle>Add Token</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          label="Chain"
          type="select"
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value)}
          options={[
            { value: 'ethereum', label: 'Ethereum' },
            { value: 'solana', label: 'Solana' },
          ]}
        />

        <FormField
          label="Network"
          type="select"
          value={selectedNetwork}
          onChange={(e) => setSelectedNetwork(e.target.value)}
          options={availableNetworks.map((network) => ({
            value: network,
            label: network,
          }))}
        />

        <FormField
          label="Token Address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter token address"
          disabled={loading}
        />

        <ActionButtons
          primary={{ label: 'Add Token', onClick: handleSubmit }}
          secondary={{ label: 'Cancel', onClick: onClose }}
          loading={loading}
          loadingLabel="Adding"
        />
      </CardContent>
    </BaseModal>
  );
}
