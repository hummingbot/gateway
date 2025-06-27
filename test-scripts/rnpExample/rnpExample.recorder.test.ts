import { RnpExampleTestHarness } from '#test/rnpExample/rnpExample.test-harness';
import { 
   useABC,
   useUnlistedDep,
   useDTwice,
   useProtoDep,
   useUnmappedMethodRecorder,
   useB,
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

  it('useB', async () => {
    await useB.processRecorderRequest(harness);
  });
 
  it('useDTwice', async () => {
    await useDTwice.processRecorderRequest(harness);
  });
 
  it('useProtoDep', async () => {
    await useProtoDep.processRecorderRequest(harness);
  });

  it('useUnmappedMethodRecorder', async () => {
    await useUnmappedMethodRecorder.processRecorderRequest(harness);
  });

  it('useUnmappedMethodMocked', async () => {
    // Create to force snapshot file to match exactly
    expect({
      error: 'FailedDependencyError',
      message:
        'Failed to useUnmappedMethod: Unmapped method was called: dep1_A.methodUnmapped. Method must be listed and either mocked or specify allowPassThrough.',
      statusCode: 424,
    }).toMatchSnapshot({});
  });

  it('useBUnloaded', async () => {
    // Create to force snapshot file to match exactly
    expect({
      error: 'InternalServerError',
      message:
        'Failed to useB: Mocked dependency was called without a mock loaded: dep1_B. Either load a mock or allowPassThrough.',
      statusCode: 500,
    }).toMatchSnapshot({});
  });

  it('useUnlistedDep', async () => {
    await useUnlistedDep.processRecorderRequest(harness);
  });
});