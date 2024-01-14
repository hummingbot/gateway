import { NftPerp } from "../../../src/connectors/nftperp/nftperp";
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { unpatch } from '../../../test/services/patch';
import { Ethereum } from "../../../src/chains/ethereum/ethereum";

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
describe("verify NftPerp getPosition", () => { });
describe("verify NftPerp getMarkPrice", () => { });
describe("verify NftPerp getIndexPrice", () => { });
describe("verify NftPerp getFundingRate", () => { });
describe("verify NftPerp openMarketOrder", () => { });
describe("verify NftPerp openLimitOrder", () => { });
describe("verify NftPerp updateLimitOrder", () => { });
describe("verify NftPerp deleteLimitOrder", () => { });
describe("verify NftPerp openLimitOrderBatch", () => { });
describe("verify NftPerp updateLimitOrderBatch", () => { });
describe("verify NftPerp deleteLimitOrderBatch", () => { });
describe("verify NftPerp openTriggerOrder", () => { });
describe("verify NftPerp deleteTriggerOrder", () => { });
describe("verify NftPerp closePosition", () => { });
