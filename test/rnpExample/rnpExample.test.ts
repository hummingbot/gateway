import {
  useABC,
  useUnlistedDep,
  useDTwice,
  useProtoDep,
  useUnmappedMethodMocked,
  useB,
  useBUnloaded,
} from './rnpExample.api-test-cases';
import { RnpExampleTestHarness } from './rnpExample.test-harness';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;

  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
    await harness.initMockedTests();
  });

  afterEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('useB', async () => {
    // In a different order than recorder test to verify that the mock order is correct
    await useB.processPlayRequest(harness);
  });

  it('useABC', async () => {
    await useABC.processPlayRequest(harness);
  });

  it('useBUnloaded', async () => {
    await useBUnloaded.processPlayRequest(harness);
  });

  it('useDTwice', async () => {
    await useDTwice.processPlayRequest(harness);
  });

  it('useUnmappedMethodRecorder', async () => {
    // Used to force snapshot file to match exactly
    expect({
      unmapped: expect.any(String),
    }).toMatchSnapshot();
  });

  it('useUnmappedMethodMocked', async () => {
    await useUnmappedMethodMocked.processPlayRequest(harness);
  });

  it('useProtoDep', async () => {
    await useProtoDep.processPlayRequest(harness);
  });

  it('useUnlistedDep', async () => {
    await useUnlistedDep.processPlayRequest(harness);
  });
});
