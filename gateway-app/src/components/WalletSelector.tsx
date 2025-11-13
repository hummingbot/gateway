import { Select } from './ui/select';
import { shortenAddress } from '@/lib/utils/string';

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
  const hasWallets = allWallets.some((w) => w.walletAddresses.length > 0);

  const handleChange = (value: string) => {
    if (value === 'add-wallet') {
      onAddWallet();
    } else {
      // Format: "chain:address"
      const [chain, address] = value.split(':');
      onWalletChange(address, chain);
    }
  };

  const getCurrentValue = () => {
    if (!selectedWallet) return 'add-wallet';
    return `${selectedChain}:${selectedWallet}`;
  };

  const getChainIcon = (chain: string) => {
    // Using placeholder icons for now
    switch (chain) {
      case 'solana':
        return '◎'; // Solana placeholder
      case 'ethereum':
        return '⟠'; // Ethereum placeholder
      default:
        return '●';
    }
  };

  return (
    <Select
      value={getCurrentValue()}
      onChange={(e) => handleChange(e.target.value)}
      className="w-48"
    >
      {!hasWallets ? (
        <option value="add-wallet">+ Add Wallet</option>
      ) : (
        <>
          {allWallets.map((walletData) => (
            <optgroup key={walletData.chain} label={walletData.chain.toUpperCase()}>
              {walletData.walletAddresses.map((wallet) => (
                <option key={wallet} value={`${walletData.chain}:${wallet}`}>
                  {getChainIcon(walletData.chain)} {shortenAddress(wallet)}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="add-wallet">+ Add Wallet</option>
        </>
      )}
    </Select>
  );
}
