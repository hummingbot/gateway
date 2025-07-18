import {
  callABC,
  callB_superJsonMethod,
  callBUnloaded_Mocked,
  callBUnloaded_Recorder,
  callDTwice,
  callPrototypeDep,
  callUnlistedDep,
  callUnmappedMethod_Mocked,
  callUnmappedMethod_Recorder,
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

  it('callABC', callABC.createPlayTest(harness));

  it('callB_superJsonMethod', callB_superJsonMethod.createPlayTest(harness));

  it('callDTwice', callDTwice.createPlayTest(harness));

  it('callPrototypeDep', callPrototypeDep.createPlayTest(harness));

  it('callUnlistedDep', callUnlistedDep.createPlayTest(harness));

  it('callBUnloaded_Mocked', callBUnloaded_Mocked.createPlayTest(harness));

  it(
    'callUnmappedMethod_Mocked',
    callUnmappedMethod_Mocked.createPlayTest(harness),
  );

  it('callBUnloaded_Recorder', async () => {
    // Snapshots must match the recorded output and this call fails in "play" mode
    // so we force a predictable result by just using the recorder test's propertyMatchers.
    expect(callBUnloaded_Recorder.propertyMatchers).toMatchSnapshot();
  });

  it('callUnmappedMethod_Recorder', async () => {
    // Snapshots must match the recorded output and this call fails in "play" mode
    // so we force a predictable result by just using the recorder test's propertyMatchers.
    expect(callUnmappedMethod_Recorder.propertyMatchers).toMatchSnapshot();
  });
});
