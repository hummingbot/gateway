import { RnpExampleTestHarness } from '#test/rnpExample/rnpExample.test-harness';
import { useABC, useUnmappedDep } from '#test/rnpExample/rnpExample.api-test-cases';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;
  jest.setTimeout(1200000);
  
  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
    await harness.setupRecorder();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('useABC', async () => {
    await useABC.processRecorderRequest(harness);
  });
  
  // it('useDTwice', async () => {
  //   await useDTwice.processRecorderRequest(harness);
  // });
 
  it('useUnmappedDep', async () => {
    await useUnmappedDep.processRecorderRequest(harness);
  });
}); 