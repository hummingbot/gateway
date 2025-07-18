import {
  useABC,
  useB_superJsonMethod,
  useBUnloaded_Mocked,
  useBUnloaded_Recorder,
  useDTwice,
  usePrototypeDep,
  useUnlistedDep,
  useUnmappedMethod_Mocked,
  useUnmappedMethod_Recorder,
} from './rnpExample.api-test-cases';
import { RnpExampleTestHarness } from './rnpExample.test-harness';

describe('RnpExample', () => {
  let _harness: RnpExampleTestHarness;
  const harness = () => _harness;

  beforeAll(async () => {
    _harness = new RnpExampleTestHarness();
    await _harness.initMockedTests();
  });

  afterEach(async () => {
    await _harness.reset();
  });

  afterAll(async () => {
    await _harness.teardown();
  });

  it('useABC', useABC.createPlayTest(harness));

  it('useB_superJsonMethod', useB_superJsonMethod.createPlayTest(harness));

  it('useDTwice', useDTwice.createPlayTest(harness));

  it('usePrototypeDep', usePrototypeDep.createPlayTest(harness));

  it('useUnlistedDep', useUnlistedDep.createPlayTest(harness));

  it('useBUnloaded_Mocked', useBUnloaded_Mocked.createPlayTest(harness));

  it(
    'useUnmappedMethod_Mocked',
    useUnmappedMethod_Mocked.createPlayTest(harness),
  );

  it('useBUnloaded_Recorder', async () => {
    // Snapshots must match the recorded output and this call fails in "play" mode
    // so we force a predictable result by just using the recorder test's propertyMatchers.
    expect(useBUnloaded_Recorder.propertyMatchers).toMatchSnapshot();
  });

  it('useUnmappedMethod_Recorder', async () => {
    // Snapshots must match the recorded output and this call fails in "play" mode
    // so we force a predictable result by just using the recorder test's propertyMatchers.
    expect(useUnmappedMethod_Recorder.propertyMatchers).toMatchSnapshot();
  });
});
