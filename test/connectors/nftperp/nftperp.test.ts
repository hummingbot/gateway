import { NftPerp } from "../../../src/connectors/nftperp/nftperp";
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { unpatch } from '../../../test/services/patch';
import { Ethereum } from "../../../src/chains/ethereum/ethereum";
import { Amm, Side, TriggerType } from "@nftperp/sdk/types";
import { Wallet } from "ethers";

let arbitrum: Ethereum;
let nftperp: NftPerp;

beforeAll(async () => {
    arbitrum = Ethereum.getInstance("arbitrum");
    patchEVMNonceManager(arbitrum.nonceManager);
    await arbitrum.init();
    nftperp = NftPerp.getInstance("ethereum", "arbitrum");
    await nftperp.init();
});

afterEach(() => {
    unpatch();
})

afterAll(async () => {
    await arbitrum.close();
})

describe("verify NftPerp getSupportedAmms", () => {
    it("should return supported amms", () => {
        // const supportedAmms = ["bayc", "milady", "ppg", "cdb", "cap", "sproto", "sofa", "degods"];
        const amms = nftperp.getSupportedAmms();
        expect(amms).toContain("bayc");
        expect(amms).toContain("milady");
    })
});
describe("verify NftPerp getPosition", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.getPosition({} as any, Amm.BAYC);
        }).rejects.toThrow(Error);
    })
    it("should not throw if the wallet is configured", async () => {
        const mockTrader = Wallet.createRandom();
        const position = await nftperp.getPosition(mockTrader, Amm.BAYC);
        expect(position).toHaveProperty('amm');
        expect(position).toHaveProperty('trader');
        expect(position).toHaveProperty('size');
    })
});
describe("verify NftPerp getMarkPrice", () => {
    it("should return the mark price without an error", async () => {
        const markPrice = await nftperp.getMarkPrice(Amm.BAYC);
        console.log({ markPrice });
        expect(+markPrice).toBeGreaterThan(0);
    })
});
describe("verify NftPerp getIndexPrice", () => {
    it("should return the index price without an error", async () => {
        const indexPrice = await nftperp.getIndexPrice(Amm.BAYC);
        console.log({ indexPrice });
        expect(+indexPrice).toBeGreaterThan(0);
    })
});
describe("verify NftPerp getFundingRate", () => {
    it("should return the funding rate without an error", async () => {
        // funding rate can be positive/negative value
        expect(async () => {
            const fundingRate = await nftperp.getFundingRate(Amm.BAYC);
            console.log({ amm: Amm.BAYC, fundingRate });
        }).not.toThrow(Error);
    })
});
describe("verify NftPerp openMarketOrder", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.openMarketOrder({} as any, Amm.BAYC, Side.BUY, 1, 1, 0.1);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has insufficient balance", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an `insufficient balance` error
        await expect(async () => {
            await nftperp.openMarketOrder(mockTrader, Amm.BAYC, Side.BUY, 1, 1, 0.1);
        }).rejects.toThrow(/^insufficient balance/);
    })
});
describe("verify NftPerp openLimitOrder", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.openLimitOrder({} as any, Amm.BAYC, Side.BUY, 1, 1, 0.1);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has insufficient balance", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an execution` error
        await expect(async () => {
            await nftperp.openLimitOrder(mockTrader, Amm.BAYC, Side.BUY, 1, 1, 0.1);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp updateLimitOrder", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.updateLimitOrder({} as any, 1, Amm.BAYC, Side.BUY, 1, 1, 0.1);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has insufficient balance", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an execution error
        await expect(async () => {
            await nftperp.updateLimitOrder(mockTrader, 1, Amm.BAYC, Side.BUY, 1, 1, 0.1);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp deleteLimitOrder", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.deleteLimitOrder({} as any, 1);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has no limit order", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an execution error
        await expect(async () => {
            await nftperp.deleteLimitOrder(mockTrader, 1);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp openLimitOrderBatch", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.openLimitOrderBatch({} as any, [{ amm: Amm.BAYC, side: Side.BUY, price: 1, margin: 1, leverage: 0.1 }]);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has insufficient balance", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an `insufficient balance` error
        await expect(async () => {
            await nftperp.openLimitOrderBatch(mockTrader, [{ amm: Amm.BAYC, side: Side.BUY, price: 1, margin: 1, leverage: 0.1 }]);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp updateLimitOrderBatch", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.updateLimitOrderBatch({} as any, [1], [{ amm: Amm.BAYC, side: Side.BUY, price: 1, margin: 1, leverage: 0.1 }]);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has insufficient balance", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an `insufficient balance` error
        await expect(async () => {
            await nftperp.updateLimitOrderBatch(mockTrader, [1], [{ amm: Amm.BAYC, side: Side.BUY, price: 1, margin: 1, leverage: 0.1 }]);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp deleteLimitOrderBatch", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.deleteLimitOrderBatch({} as any, [1]);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has insufficient balance", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an `insufficient balance` error
        await expect(async () => {
            await nftperp.deleteLimitOrderBatch(mockTrader, [1]);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp openTriggerOrder", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.openTriggerOrder({} as any, Amm.BAYC, 1, 1, TriggerType.STOP_LOSS);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has insufficient balance", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an `insufficient balance` error
        await expect(async () => {
            await nftperp.openTriggerOrder(mockTrader, Amm.BAYC, 1, 1, TriggerType.STOP_LOSS);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp deleteTriggerOrder", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.deleteTriggerOrder({} as any, 1);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has no limit order", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw an execution error
        await expect(async () => {
            await nftperp.deleteTriggerOrder(mockTrader, 1);
        }).rejects.toThrow(Error);
    })
});
describe("verify NftPerp closePosition", () => {
    it("should throw if the wallet isn't configured", async () => {
        await expect(async () => {
            await nftperp.closePosition({} as any, Amm.BAYC);
        }).rejects.toThrow(new Error('sdk initialized as read-only, as private key is not provided'));
    })
    it("should throw if the trader has no position", async () => {
        const mockTrader = Wallet.createRandom();

        // should throw a `no position found` error
        await expect(async () => {
            await nftperp.closePosition(mockTrader, Amm.BAYC);
        }).rejects.toThrow(/^no position found/);
    })
});
