import { RnpExampleTestHarness } from '#test/rnpExample/rnpExample.test-harness';
import { 
   useABC,
   useUnlistedDep,
   useDTwice,
   usePrototypeDep,
   useUnmappedMethod_Recorder,
   useB_superJsonMethod,
 } from '#test/rnpExample/rnpExample.api-test-cases';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;
  jest.setTimeout(1200000);
  
  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
    await harness.initRecorderTests();
  });

  afterEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('useABC', async () => {
    await useABC.processRecorderRequest(harness);
  });

  it('useB_superJsonMethod', async () => {
    await useB_superJsonMethod.processRecorderRequest(harness);
  });
 
  it('useDTwice', async () => {
    await useDTwice.processRecorderRequest(harness);
  });
 
  it('usePrototypeDep', async () => {
    await usePrototypeDep.processRecorderRequest(harness);
  });

  it('useABCUnloaded', async () => {
    // Create to force snapshot file to match exactly
    expect({
      error: 'InternalServerError',
      message:
        'Failed to useABC: Mocked dependency was called without a mock loaded: dep1_A. Either load a mock or allowPassThrough.',
      statusCode: 500,
    }).toMatchSnapshot({});
  });

  it('useUnmappedMethod_Recorder', async () => {
    await useUnmappedMethod_Recorder.processRecorderRequest(harness);
  });

  it('useUnmappedMethod_Mocked', async () => {
    // Create to force snapshot file to match exactly
    expect({
      error: 'FailedDependencyError',
      message:
        'Failed to useUnmappedMethod: Unmapped method was called: dep1_A.unmappedMethod. Method must be listed and either mocked or specify allowPassThrough.',
      statusCode: 424,
    }).toMatchSnapshot({});
  });

  it('useUnlistedDep', async () => {
    await useUnlistedDep.processRecorderRequest(harness);
  });
});