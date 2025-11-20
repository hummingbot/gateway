import { memo, useCallback } from 'react';
import { Button } from './ui/button';
import { WalletIcon, NetworkIcon } from 'lucide-react';
import { WalletSelector } from './WalletSelector';
import { NetworkSelector } from './NetworkSelector';
import { NetworkStatus } from './NetworkStatus';
import { LogsSheet } from './LogsSheet';

interface NavigationBarProps {
  darkMode: boolean;
  allWallets: Array<{ chain: string; walletAddresses: string[] }>;
  selectedWallet: string | null;
  selectedChain: string;
  networks: string[];
  selectedNetwork: string;
  onWalletChange: (wallet: string, chain: string) => void | Promise<void>;
  onAddWallet: () => void;
  onNetworkChange: (network: string) => void;
  gatewayPath: string;
}

export const NavigationBar = memo(function NavigationBar({
  darkMode,
  allWallets,
  selectedWallet,
  selectedChain,
  networks,
  selectedNetwork,
  onWalletChange,
  onAddWallet,
  onNetworkChange,
  gatewayPath,
}: NavigationBarProps) {
  const handleAddWallet = useCallback(() => {
    onAddWallet();
  }, [onAddWallet]);

  const handleWalletChange = useCallback(
    (wallet: string, chain: string) => {
      onWalletChange(wallet, chain);
    },
    [onWalletChange]
  );

  const handleNetworkChange = useCallback(
    (network: string) => {
      onNetworkChange(network);
    },
    [onNetworkChange]
  );

  return (
    <header className="border-b px-4 md:px-6 py-3 md:py-4">
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <img
            src={darkMode ? '/logo-bw-dark-trans.png' : '/logo-bw-light-trans.png'}
            alt="Hummingbot"
            className="h-8 w-auto"
          />
          <h1 className="text-xl md:text-2xl font-bold">Gateway</h1>
        </div>

        <div className="flex gap-2 md:gap-4 items-center">
          {/* Wallet Selector - works on both mobile and desktop */}
          <WalletSelector
            allWallets={allWallets}
            selectedWallet={selectedWallet || ''}
            selectedChain={selectedChain}
            onWalletChange={handleWalletChange}
            onAddWallet={handleAddWallet}
          />

          {/* Network Selector - works on both mobile and desktop */}
          <NetworkSelector
            selectedChain={selectedChain}
            selectedNetwork={selectedNetwork}
            networks={networks}
            onNetworkChange={handleNetworkChange}
          />

          {/* Network Status and Logs */}
          <div className="flex items-center gap-1 sm:gap-4">
            <NetworkStatus chain={selectedChain} network={selectedNetwork} />
            <LogsSheet gatewayPath={gatewayPath} iconSize={16} />
          </div>
        </div>
      </div>
    </header>
  );
});
