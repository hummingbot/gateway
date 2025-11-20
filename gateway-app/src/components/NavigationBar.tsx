import { memo, useCallback } from 'react';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { WalletSelector } from './WalletSelector';
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
  onOpenWalletModal: () => void;
  onOpenNetworkModal: () => void;
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
  onOpenWalletModal,
  onOpenNetworkModal,
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

  const handleOpenWalletModal = useCallback(() => {
    onOpenWalletModal();
  }, [onOpenWalletModal]);

  const handleOpenNetworkModal = useCallback(() => {
    onOpenNetworkModal();
  }, [onOpenNetworkModal]);

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
          {/* Desktop: Full Wallet Selector */}
          <div className="hidden sm:block">
            <WalletSelector
              allWallets={allWallets}
              selectedWallet={selectedWallet || ''}
              selectedChain={selectedChain}
              onWalletChange={handleWalletChange}
              onAddWallet={handleAddWallet}
            />
          </div>

          {/* Mobile: Wallet Icon Button */}
          <Button
            onClick={handleOpenWalletModal}
            variant="ghost"
            size="icon"
            className="sm:hidden h-10 w-10"
            aria-label="Select wallet"
            title={selectedWallet || 'No wallet'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"></path>
              <path d="m21 2-9.6 9.6"></path>
              <circle cx="7.5" cy="15.5" r="5.5"></circle>
            </svg>
          </Button>

          {/* Mobile: Network Icon Button */}
          <Button
            onClick={handleOpenNetworkModal}
            variant="ghost"
            size="icon"
            className="sm:hidden h-10 w-10"
            aria-label="Select network"
            title={`${selectedChain}-${selectedNetwork}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 10a7.31 7.31 0 0 0 10 10Z"></path>
              <path d="m9 15 3-3"></path>
              <path d="M17 13a6 6 0 0 0-6-6"></path>
              <path d="M21 13A10 10 0 0 0 11 3"></path>
            </svg>
          </Button>

          {/* Desktop: Full Network Selector */}
          <div className="hidden sm:flex sm:items-center sm:gap-4">
            <Select value={selectedNetwork} onValueChange={handleNetworkChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {networks.length > 0 ? (
                  networks.map((network) => (
                    <SelectItem key={network} value={network}>
                      {selectedChain}-{network}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={selectedNetwork}>
                    {selectedChain}-{selectedNetwork}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <NetworkStatus chain={selectedChain} network={selectedNetwork} />
            <LogsSheet gatewayPath={gatewayPath} iconSize={16} />
          </div>

          {/* Mobile: Network Status (shown on mobile) */}
          <div className="sm:hidden flex items-center gap-1">
            <NetworkStatus chain={selectedChain} network={selectedNetwork} />
            <LogsSheet gatewayPath={gatewayPath} iconSize={16} />
          </div>
        </div>
      </div>
    </header>
  );
});
