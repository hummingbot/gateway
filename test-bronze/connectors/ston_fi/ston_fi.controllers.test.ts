// npx jest --testRegex="ston_fi.controllers.test.ts" --detectOpenHandles


import { price } from '../../../src/connectors/ston_fi/ston_fi.controllers';


describe('StonFi Controllers', () => {
  it('should get the price', async () => {
    const myPrice = await price();
    expect(myPrice).toBeDefined();
  });
});