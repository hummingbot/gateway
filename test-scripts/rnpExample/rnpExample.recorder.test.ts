import { RnpExampleTestHarness } from '#test/rnpExample/rnpExample.test-harness';
import { useABC, useDep2, useDTwice, useUnmappedMethodMocked, useUnmappedMethodRecorder } from '#test/rnpExample/rnpExample.api-test-cases';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;
  jest.setTimeout(1200000);
  
  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
    await harness.setupRecorder();
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
  
  it('useDTwice', async () => {
    await useDTwice.processRecorderRequest(harness);
  });
 
  it('useUnmappedMethodRecorder', async () => {
    await useUnmappedMethodRecorder.processRecorderRequest(harness);
  });

  it('useDep2', async () => {
    await useDep2.processRecorderRequest(harness);
  });
}); 