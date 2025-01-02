import { SolanaController } from '../solana/solana.controller';
import { createJupiterApiClient } from "@jup-ag/api";
import { Wallet } from "@coral-xyz/anchor";

export class JupiterController extends SolanaController {
  protected jupiterQuoteApi: ReturnType<typeof createJupiterApiClient>;
  private static jupiterLogged: boolean = false;
  protected wallet: Wallet;

  constructor() {
    super();
    this.wallet = new Wallet(this.keypair);
  }

  protected async loadJupiter(): Promise<void> {
    try {
      if (!this.jupiterQuoteApi) {
        this.jupiterQuoteApi = createJupiterApiClient();
        
        // Log only once
        if (!JupiterController.jupiterLogged) {
          console.log("Jupiter connector initialized");
          JupiterController.jupiterLogged = true;
        }
      }
    } catch (error) {
      console.error("Failed to initialize Jupiter:", error);
      throw error;
    }
  }
}