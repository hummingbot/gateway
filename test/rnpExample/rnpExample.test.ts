import {
  useABC,
  useUnlistedDep,
  useDTwice,
  usePrototypeDep,
  useUnmappedMethod_Mocked,
  useB_superJsonMethod,
  useBUnloaded_Recorder,
  useBUnloaded_Mocked,
  useUnmappedMethod_Recorder,
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

  it('useBUnloaded_Recorder', async () => {
    // Snapshots must match the recorded output and this call fails in "play" mode
    // so we force a predictable result by just using the recorder test's propertyMatchers.
    expect(useBUnloaded_Recorder.propertyMatchers).toMatchSnapshot();
  });

  it('useBUnloaded_Mocked', async () => {
    await useBUnloaded_Mocked.processPlayRequest(harness);
  });

  it('useUnmappedMethod_Recorder', async () => {
    // Snapshots must match the recorded output and this call fails in "play" mode
    // so we force a predictable result by just using the recorder test's propertyMatchers.
    expect(useUnmappedMethod_Recorder.propertyMatchers).toMatchSnapshot();
  });

  it('useUnmappedMethod_Mocked', async () => {
    await useUnmappedMethod_Mocked.processPlayRequest(harness);
  });

  it('useUnlistedDep', async () => {
    await useUnlistedDep.processPlayRequest(harness);
  });
});
