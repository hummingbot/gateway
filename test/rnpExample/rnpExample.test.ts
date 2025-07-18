import {
  useABC,
  useUnlistedDep,
  useDTwice,
  usePrototypeDep,
  useUnmappedMethod_Mocked,
  useB_superJsonMethod,
  useABCUnloaded,
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

  it('useABC', async () => {
    await useABC.processPlayRequest(harness);
  });

  it('useB_superJsonMethod', async () => {
    await useB_superJsonMethod.processPlayRequest(harness);
  });

  it('useDTwice', async () => {
    await useDTwice.processPlayRequest(harness);
  });

  it('usePrototypeDep', async () => {
    await usePrototypeDep.processPlayRequest(harness);
  });

  it('useABCUnloaded', async () => {
    await useABCUnloaded.processPlayRequest(harness);
  });

  it('useUnmappedMethod_Recorder', async () => {
    // Used to force snapshot file to match exactly
    expect({
      unmapped: expect.any(String),
    }).toMatchSnapshot();
  });

  it('useUnmappedMethod_Mocked', async () => {
    await useUnmappedMethod_Mocked.processPlayRequest(harness);
  });

  it('useUnlistedDep', async () => {
    await useUnlistedDep.processPlayRequest(harness);
  });
});
