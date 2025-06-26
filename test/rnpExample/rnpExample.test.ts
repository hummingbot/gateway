import {
  useABC,
  useDep2,
  useDTwice,
  useUnmappedMethodMocked,
} from './rnpExample.api-test-cases';
import { RnpExampleTestHarness } from './rnpExample.test-harness';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;

  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
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

  it('useUnmappedMethodMocked', async () => {
    await useUnmappedMethodMocked.processPlayRequest(harness);
  });

  it('useDep2', async () => {
    await useDep2.processPlayRequest(harness);
  });
});
