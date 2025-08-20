import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';

import { logger } from './logger';

// Type augmentation to fix TypeScript issue
type TransportNodeHidType = TransportNodeHid & {
  device?: any;
  channel?: any;
  packetSize?: number;
  disconnected?: boolean;
};

export interface LedgerDevice {
  descriptor: string;
  productName: string;
  serialNumber?: string;
}

export class LedgerTransportManager {
  private static instance: LedgerTransportManager;
  private transport: TransportNodeHidType | null = null;
  private isLocked: boolean = false;

  private constructor() {}

  public static getInstance(): LedgerTransportManager {
    if (!LedgerTransportManager.instance) {
      LedgerTransportManager.instance = new LedgerTransportManager();
    }
    return LedgerTransportManager.instance;
  }

  /**
   * List all connected Ledger devices
   */
  public async listDevices(): Promise<LedgerDevice[]> {
    try {
      const devices = await TransportNodeHid.list();
      return devices.map((descriptor) => ({
        descriptor,
        productName: 'Ledger Device', // TransportNodeHid doesn't provide product names
        serialNumber: undefined,
      }));
    } catch (error) {
      logger.error(`Failed to list Ledger devices: ${error.message}`);
      throw new Error('Failed to list Ledger devices');
    }
  }

  /**
   * Create a transport connection to a Ledger device
   * @param descriptor Optional device descriptor, if not provided, connects to the first available device
   */
  public async createTransport(descriptor?: string): Promise<TransportNodeHidType> {
    if (this.isLocked) {
      throw new Error('Transport is locked. Another operation is in progress.');
    }

    try {
      this.isLocked = true;

      // Close existing transport if any
      if (this.transport) {
        await this.closeTransport();
      }

      // Create new transport
      if (descriptor) {
        this.transport = (await TransportNodeHid.open(descriptor)) as TransportNodeHidType;
      } else {
        this.transport = (await TransportNodeHid.create()) as TransportNodeHidType;
      }

      logger.info('Successfully connected to Ledger device');
      return this.transport;
    } catch (error) {
      this.isLocked = false;

      if (error.message?.includes('cannot open device')) {
        throw new Error('Cannot open Ledger device. Please make sure it is connected and unlocked.');
      } else if (error.message?.includes('No device found')) {
        throw new Error('No Ledger device found. Please connect your Ledger and try again.');
      }

      logger.error(`Failed to create Ledger transport: ${error.message}`);
      throw new Error(`Failed to connect to Ledger device: ${error.message}`);
    }
  }

  /**
   * Get the current transport instance
   */
  public getTransport(): TransportNodeHidType | null {
    return this.transport;
  }

  /**
   * Close the current transport connection
   */
  public async closeTransport(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
        logger.info('Ledger transport closed');
      } catch (error) {
        logger.error(`Error closing Ledger transport: ${error.message}`);
      } finally {
        this.transport = null;
        this.isLocked = false;
      }
    }
  }

  /**
   * Execute an operation with automatic transport management
   * @param operation The operation to execute with the transport
   * @param descriptor Optional device descriptor
   */
  public async withTransport<T>(
    operation: (transport: TransportNodeHidType) => Promise<T>,
    descriptor?: string,
  ): Promise<T> {
    let transport: TransportNodeHidType | null = null;

    try {
      transport = await this.createTransport(descriptor);
      const result = await operation(transport);
      return result;
    } finally {
      // Always close the transport after the operation
      await this.closeTransport();
    }
  }

  /**
   * Check if a Ledger device is connected
   */
  public async isDeviceConnected(): Promise<boolean> {
    try {
      const devices = await this.listDevices();
      return devices.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Release the lock (used for error recovery)
   */
  public releaseLock(): void {
    this.isLocked = false;
  }
}
