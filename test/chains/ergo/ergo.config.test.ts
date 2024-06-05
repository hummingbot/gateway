import { getErgoConfig } from "../../../src/chains/ergo/ergo.config";
import { ConfigManagerV2 } from "../../../src/services/config-manager-v2";
import { NetworkPrefix } from "ergo-lib-wasm-nodejs";

describe('getErgoConfig', () => {
    afterEach(() => {
        // Clear all mocks after each test
        jest.clearAllMocks()
    })

    it('Should return correct config for Mainnet', () => {
        jest.spyOn(ConfigManagerV2.getInstance(), "get").mockReturnValueOnce('algorand.networks.Mainnet.nodeURL');
        jest.spyOn(ConfigManagerV2.getInstance(), "get").mockReturnValueOnce(1000);
        jest.spyOn(ConfigManagerV2.getInstance(), "get").mockReturnValueOnce(2000);
        
        // Act
        const res = getErgoConfig('Mainnet');

        // Assert
        expect(res).toEqual({
            network: {
                name: 'Mainnet',
                nodeURL: 'algorand.networks.Mainnet.nodeURL'
                ,
                timeOut: 1000,
                networkPrefix: NetworkPrefix.Mainnet,
                minTxFee: 2000,
                maxLRUCacheInstances: 10,
                utxosLimit: 100
            }
        });
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledTimes(3);
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith('algorand.networks.Mainnet.nodeURL');
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith('ergo.networks.Mainnet.timeOut');
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith('algorand.networks.Mainnet.minTxFee');
    });

    it('Should return correct config for Testnet', () => {
        // Mocking the get method of ConfigManagerV2
        jest.spyOn(ConfigManagerV2.getInstance(), "get").mockReturnValueOnce('algorand.networks.Testnet.nodeURL');
        jest.spyOn(ConfigManagerV2.getInstance(), "get").mockReturnValueOnce(1000);
        jest.spyOn(ConfigManagerV2.getInstance(), "get").mockReturnValueOnce(2000);
        
        // Act
        const res = getErgoConfig('Testnet');

        // Assert
        expect(res).toEqual({
            network: {
                name: 'Testnet',
                nodeURL: 'algorand.networks.Testnet.nodeURL'
                ,
                timeOut: 1000,
                networkPrefix: NetworkPrefix.Testnet,
                minTxFee: 2000,
                maxLRUCacheInstances: 10,
                utxosLimit: 100
            }
        })
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledTimes(3);
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith('algorand.networks.Testnet.nodeURL');
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith('ergo.networks.Testnet.timeOut');
        expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith('algorand.networks.Testnet.minTxFee');
    });
});
