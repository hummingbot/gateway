import {
  useABC,
  useUnmappedDep,
  useDTwice,
  useProtoDep,
  useUnmappedMethodMocked,
} from './rnpExample.api-test-cases';
import { RnpExampleTestHarness } from './rnpExample.test-harness';

describe('RnpExample', () => {
  let harness: RnpExampleTestHarness;

  beforeAll(async () => {
    harness = new RnpExampleTestHarness();
    await harness.setupMockedTests();
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

  it('useDTwice', async () => {
    await useDTwice.processPlayRequest(harness);
  });

  it('useUnmappedMethodRecorder', async () => {
    // Used to force snapshot file to match exactly
    expect({
      unmapped: expect.any(String),
    }).toMatchSnapshot();
  });

  it('useUnmappedMethodMocked', async () => {
    await useUnmappedMethodMocked.processPlayRequest(harness);
  });

  it('useProtoDep', async () => {
    await useProtoDep.processPlayRequest(harness);
  });

  it('useUnmappedDep', async () => {
    await useUnmappedDep.processPlayRequest(harness);
  });
});
