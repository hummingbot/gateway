import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { showSuccessNotification } from '@/lib/notifications';

interface Position {
  address: string;
  liquidity: number;
  baseToken: string;
  quoteToken: string;
  baseAmount: number;
  quoteAmount: number;
  minPrice?: number;
  maxPrice?: number;
  currentPrice?: number;
  fees?: {
    base: number;
    quote: number;
  };
}

export function LiquidityView() {
  const { selectedNetwork, selectedWallet, gatewayAvailable } = useApp();
  const [connector, setConnector] = useState('raydium');
  const [poolAddress, setPoolAddress] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add liquidity state
  const [baseAmount, setBaseAmount] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [lowerPrice, setLowerPrice] = useState('');
  const [upperPrice, setUpperPrice] = useState('');

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'open' | 'collect' | 'close' | null;
    position?: Position;
  }>({ type: null });

  async function loadPositions() {
    if (!selectedWallet) return;

    try {
      setLoading(true);
      setError(null);
      setPositions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPositions();
  }, [selectedWallet, connector]);

  function handleOpenPosition() {
    if (!poolAddress || !baseAmount || !quoteAmount) return;
    setConfirmDialog({ type: 'open' });
  }

  async function confirmOpenPosition() {
    try {
      setLoading(true);
      setError(null);
      setConfirmDialog({ type: null });

      await gatewayAPI.clmm.openPosition({
        network: selectedNetwork,
        walletAddress: selectedWallet,
        poolAddress,
        lowerPrice: parseFloat(lowerPrice),
        upperPrice: parseFloat(upperPrice),
        baseTokenAmount: parseFloat(baseAmount),
        quoteTokenAmount: parseFloat(quoteAmount),
      });

      await showSuccessNotification('Position opened successfully!');
      loadPositions();
      setBaseAmount('');
      setQuoteAmount('');
      setLowerPrice('');
      setUpperPrice('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open position');
    } finally {
      setLoading(false);
    }
  }

  function handleCollectFees(position: Position) {
    setConfirmDialog({ type: 'collect', position });
  }

  async function confirmCollectFees() {
    if (!confirmDialog.position) return;

    try {
      setLoading(true);
      setError(null);
      setConfirmDialog({ type: null });

      await gatewayAPI.clmm.collectFees(connector, {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        positionAddress: confirmDialog.position.address,
      });

      await showSuccessNotification('Fees collected successfully!');
      loadPositions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to collect fees');
    } finally {
      setLoading(false);
    }
  }

  function handleClosePosition(position: Position) {
    setConfirmDialog({ type: 'close', position });
  }

  async function confirmClosePosition() {
    if (!confirmDialog.position) return;

    try {
      setLoading(true);
      setError(null);
      setConfirmDialog({ type: null });

      await gatewayAPI.clmm.closePosition(connector, {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        positionAddress: confirmDialog.position.address,
      });

      await showSuccessNotification('Position closed successfully!');
      loadPositions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close position');
    } finally {
      setLoading(false);
    }
  }

  // Check Gateway availability first
  if (gatewayAvailable === null) {
    return <LoadingState message="Checking Gateway connection..." />;
  }

  if (gatewayAvailable === false) {
    return (
      <EmptyState
        title="Gateway API Unavailable"
        message="Please make sure the Gateway server is running at localhost:15888"
        icon="⚠️"
      />
    );
  }

  if (!selectedWallet) {
    return (
      <EmptyState
        title="No Wallet Selected"
        message="Please select a wallet to manage liquidity positions."
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Connector Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Liquidity Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Connector</label>
              <Select
                value={connector}
                onValueChange={setConnector}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raydium">Raydium CLMM</SelectItem>
                  <SelectItem value="meteora">Meteora DLMM</SelectItem>
                  <SelectItem value="pancakeswap-sol">PancakeSwap CLMM</SelectItem>
                  <SelectItem value="uniswap">Uniswap V3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* My Positions */}
      <Card>
        <CardHeader>
          <CardTitle>My Positions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {positions.length === 0 ? (
            <p className="text-muted-foreground">
              No liquidity positions found. Open a new position below.
            </p>
          ) : (
            positions.map((position, i) => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex justify-between">
                    <div>
                      <h4 className="font-semibold">
                        {position.baseToken} / {position.quoteToken}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Liquidity: ${position.liquidity.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Tokens</p>
                      <p>{position.baseAmount} {position.baseToken}</p>
                      <p>{position.quoteAmount} {position.quoteToken}</p>
                    </div>
                    {position.fees && (
                      <div>
                        <p className="text-muted-foreground">Uncollected Fees</p>
                        <p>{position.fees.base} {position.baseToken}</p>
                        <p>{position.fees.quote} {position.quoteToken}</p>
                      </div>
                    )}
                  </div>

                  {position.minPrice && position.maxPrice && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">Price Range</p>
                      <p>
                        Min: {position.minPrice} • Max: {position.maxPrice}
                        {position.currentPrice && ` • Current: ${position.currentPrice}`}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {position.fees && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCollectFees(position)}
                        disabled={loading}
                      >
                        Collect Fees
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleClosePosition(position)}
                      disabled={loading}
                    >
                      Close Position
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Open New Position */}
      <Card>
        <CardHeader>
          <CardTitle>Open New Position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Pool Address</label>
            <Input
              value={poolAddress}
              onChange={(e) => setPoolAddress(e.target.value)}
              placeholder="Enter pool address"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Lower Price</label>
              <Input
                type="number"
                value={lowerPrice}
                onChange={(e) => setLowerPrice(e.target.value)}
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Upper Price</label>
              <Input
                type="number"
                value={upperPrice}
                onChange={(e) => setUpperPrice(e.target.value)}
                placeholder="0.0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Base Token Amount</label>
              <Input
                type="number"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Quote Token Amount</label>
              <Input
                type="number"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
                placeholder="0.0"
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleOpenPosition}
            disabled={loading || !poolAddress || !baseAmount || !quoteAmount}
            className="w-full"
          >
            {loading ? 'Opening Position...' : 'Open Position'}
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <AlertDialog
        open={confirmDialog.type === 'open'}
        onOpenChange={(open) => !open && setConfirmDialog({ type: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Open Position</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to open a new liquidity position with {baseAmount} base tokens and {quoteAmount} quote tokens?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOpenPosition} disabled={loading}>
              {loading ? 'Opening...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDialog.type === 'collect'}
        onOpenChange={(open) => !open && setConfirmDialog({ type: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Collect Fees</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.position && (
                <>
                  Are you sure you want to collect fees from your {confirmDialog.position.baseToken}/{confirmDialog.position.quoteToken} position?
                  {confirmDialog.position.fees && (
                    <div className="mt-2 text-sm">
                      <strong>Uncollected Fees:</strong>
                      <br />
                      {confirmDialog.position.fees.base} {confirmDialog.position.baseToken}
                      <br />
                      {confirmDialog.position.fees.quote} {confirmDialog.position.quoteToken}
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCollectFees} disabled={loading}>
              {loading ? 'Collecting...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDialog.type === 'close'}
        onOpenChange={(open) => !open && setConfirmDialog({ type: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Close Position</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.position && (
                <>
                  Are you sure you want to close your {confirmDialog.position.baseToken}/{confirmDialog.position.quoteToken} position?
                  <div className="mt-2 text-sm">
                    <strong>Position Value:</strong> ${confirmDialog.position.liquidity.toFixed(2)}
                  </div>
                  <div className="mt-2 text-sm text-destructive">
                    <strong>Warning:</strong> This action cannot be undone. All liquidity will be withdrawn.
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClosePosition} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {loading ? 'Closing...' : 'Confirm Close'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
