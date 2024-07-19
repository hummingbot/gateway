import { Ergo } from '../../../src/chains/ergo/ergo';
import { ErgoController } from '../../../src/chains/ergo/ergo.controller';

describe('ErgoController', () => {
  // const controller: ErgoController = new ErgoController();
  const ergo: Ergo = new Ergo('mainnet');
  describe('pool', () => {
    it('Should be defined', () => {
      expect(ErgoController.pool).toBeDefined();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('Should not call init from ergo if ergo is ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(true);
      ergo['_ready'] = false;
      jest.spyOn(ergo, 'getPool').mockReturnValue({ info: 'info' } as any);
      const result = await ErgoController.pool(ergo, {
        network: 'mainnet',
        poolId: 'poolId',
      });
      expect(ergo.getPool).toHaveBeenCalled();
      expect(result).toEqual('info');
    });

    it('Should call init from ergo if ergo is not ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(false);
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      jest.spyOn(ergo, 'getPool').mockReturnValue({ info: 'info' } as any);
      const result = await ErgoController.pool(ergo, {
        network: 'mainnet',
        poolId: 'poolId',
      });

      expect(ergo.getPool).toHaveBeenCalled();
      expect(ergo.init).toHaveBeenCalled();
      expect(result).toEqual('info');
    });
  });
});
