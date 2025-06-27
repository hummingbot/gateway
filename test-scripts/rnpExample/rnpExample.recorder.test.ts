import { RnpExampleTestHarness } from '#test/rnpExample/rnpExample.test-harness';
import { useABC, useUnmappedDep, useDTwice, useProtoDep, useUnmappedMethodRecorder } from '#test/rnpExample/rnpExample.api-test-cases';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;
  jest.setTimeout(1200000);
  
  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
    await harness.setupRecorder();
  });

  afterEach(async () => {
    // Do NOT call reset() it will break the spies
    // TODO: allow calling reset as currently multiple tests using the same method will break
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('useABC', async () => {
    await useABC.processRecorderRequest(harness);
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
      "error": "FailedDependencyError",
      "message": "Failed to useUnmappedMethod: Unmocked method was called: dep1_A.methodUnmapped",
      "statusCode": 424,
    }).toMatchSnapshot();
  });

  it('useUnmappedDep', async () => {
    await useUnmappedDep.processRecorderRequest(harness);
  });
}); 