import { utils } from 'ethers';
import { InjectiveCLOB } from '../../../src/connectors/injective/injective';

// const margin = calculateMargin('1.234', '567.89', 4, 100);
describe('calculateMargin', () => {
  it('100x leverage, 4 decimals', () => {
    const result = utils.formatUnits(
      InjectiveCLOB.calculateMargin('1.234', '567.89', 4, 100),
      4
    );
    expect(result).toEqual('7.0077');
  });

  it('100x leverage, 18 decimals', () => {
    const result = utils.formatUnits(
      InjectiveCLOB.calculateMargin('1.234', '567.89', 18, 100),
      18
    );
    expect(result).toEqual('7.0077626');
  });

  // EUR/USD 1 = 1.06
  it('20x leverage, 2 decimals', () => {
    const result = utils.formatUnits(
      InjectiveCLOB.calculateMargin('1.06', '500', 4, 20),
      4
    );
    expect(result).toEqual('26.5');
  });
});
