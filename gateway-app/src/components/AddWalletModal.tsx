import { useState } from 'react';
import { CardContent, CardHeader, CardTitle } from './ui/card';
import { BaseModal } from './ui/BaseModal';
import { FormField } from './ui/FormField';
import { ActionButtons } from './ui/ActionButtons';
import { showErrorNotification } from '@/lib/notifications';

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
      await showErrorNotification('Please enter a private key');
      return;
    }

    try {
      setLoading(true);
      await onAddWallet(selectedChain, privateKey);
      onClose();
    } catch (err) {
      await showErrorNotification('Failed to add wallet: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <BaseModal onClose={onClose}>
      <CardHeader>
        <CardTitle>Add Wallet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          label="Chain"
          type="select"
          value={selectedChain}
          onChange={(val) => setSelectedChain(typeof val === 'string' ? val : val.target.value)}
          options={[
            { value: 'ethereum', label: 'Ethereum' },
            { value: 'solana', label: 'Solana' },
          ]}
        />

        <FormField
          label="Private Key"
          type="password"
          value={privateKey}
          onChange={(e) => {
            if (typeof e === 'string') {
              setPrivateKey(e);
            } else {
              setPrivateKey(e.target.value);
            }
          }}
          placeholder="Enter private key"
          disabled={loading}
        />

        <ActionButtons
          primary={{ label: 'Add Wallet', onClick: handleSubmit }}
          secondary={{ label: 'Cancel', onClick: onClose }}
          loading={loading}
          loadingLabel="Adding"
        />
      </CardContent>
    </BaseModal>
  );
}
