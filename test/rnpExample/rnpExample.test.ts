import { useABC, useDTwice, useUnmappedDep } from './rnpExample.api-test-cases';
import { RnpExampleTestHarness } from './rnpExample.test-harness';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;

  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
    await harness.init();
    await harness.setupMockedTests();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('useABC', async () => {
    await useABC.processPlayRequest(harness);
  });

  it('useDTwice', async () => {
    await useDTwice.processPlayRequest(harness);
  });

  it('useUnmappedDep', async () => {
    await useUnmappedDep.processPlayRequest(harness);
  });
});
