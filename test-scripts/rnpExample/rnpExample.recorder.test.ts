import {
  callABC,
  callB_superJsonMethod,
  callBUnloaded_Recorder,
  callDTwice,
  callPrototypeDep,
  callUnlistedDep,
  callUnmappedMethod_Recorder,
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

  it('callABC', callABC.createRecordTest(harness));
  
  it('callB_superJsonMethod', callB_superJsonMethod.createRecordTest(harness));
  
  it('callDTwice', callDTwice.createRecordTest(harness));
  
  it('callPrototypeDep', callPrototypeDep.createRecordTest(harness));
  
  it('callUnlistedDep', callUnlistedDep.createRecordTest(harness));
  
  it('callBUnloaded_Recorder', callBUnloaded_Recorder.createRecordTest(harness));
  
  it('callUnmappedMethod_Recorder', callUnmappedMethod_Recorder.createRecordTest(harness));

  it('callBUnloaded_Mocked', async () => {
    // Create expected snapshot for running test in "Play" mode
    expect({
      error: 'InternalServerError',
      message:
        'Failed to callSuperJsonMethod: Mocked dependency was called without a mock loaded: dep1_B. Either load a mock or allowPassThrough.',
      statusCode: 500,
    }).toMatchSnapshot({});
  });

  it('callUnmappedMethod_Mocked', async () => {
    // Create expected snapshot for running test in "Play" mode
    expect({
      error: 'FailedDependencyError',
      message:
        'Failed to callUnmappedMethod: Unmapped method was called: dep1_A.unmappedMethod. Method must be listed and either mocked or specify allowPassThrough.',
      statusCode: 424,
    }).toMatchSnapshot({});
  });
});