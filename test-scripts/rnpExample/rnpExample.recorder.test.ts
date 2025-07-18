import {
  useABC,
  useB_superJsonMethod,
  useBUnloaded_Recorder,
  useDTwice,
  usePrototypeDep,
  useUnlistedDep,
  useUnmappedMethod_Recorder,
} from '#test/rnpExample/rnpExample.api-test-cases';
import { RnpExampleTestHarness } from '#test/rnpExample/rnpExample.test-harness';

describe('RnpExample', () => {
  let _harness: RnpExampleTestHarness;
  const harness = () => _harness;
  jest.setTimeout(10000);

  beforeAll(async () => {
    _harness = new RnpExampleTestHarness();
    await _harness.initRecorderTests();
  });

  afterEach(async () => {
    await _harness.reset();
  });

  afterAll(async () => {
    await _harness.teardown();
  });

  it('useABC', useABC.createRecordTest(harness));
  
  it('useB_superJsonMethod', useB_superJsonMethod.createRecordTest(harness));
  
  it('useDTwice', useDTwice.createRecordTest(harness));
  
  it('usePrototypeDep', usePrototypeDep.createRecordTest(harness));
  
  it('useUnlistedDep', useUnlistedDep.createRecordTest(harness));
  
  it('useBUnloaded_Recorder', useBUnloaded_Recorder.createRecordTest(harness));
  
  it('useUnmappedMethod_Recorder', useUnmappedMethod_Recorder.createRecordTest(harness));

  it('useBUnloaded_Mocked', async () => {
    // Create expected snapshot for running test in "Play" mode
    expect({
      error: 'InternalServerError',
      message:
        'Failed to useSuperJsonMethod: Mocked dependency was called without a mock loaded: dep1_B. Either load a mock or allowPassThrough.',
      statusCode: 500,
    }).toMatchSnapshot({});
  });

  it('useUnmappedMethod_Mocked', async () => {
    // Create expected snapshot for running test in "Play" mode
    expect({
      error: 'FailedDependencyError',
      message:
        'Failed to useUnmappedMethod: Unmapped method was called: dep1_A.unmappedMethod. Method must be listed and either mocked or specify allowPassThrough.',
      statusCode: 424,
    }).toMatchSnapshot({});
  });
});