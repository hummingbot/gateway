import { APITestCase } from '#test/record-and-play/api-test-case';

import { RnpExampleTestHarness } from './rnpExample.test-harness';

class TestCase extends APITestCase<RnpExampleTestHarness> {}

/**
 * A standard test case that calls a method with multiple mocked dependencies.
 * Note that `dep1_C` is not listed in `requiredMocks`. Because it is marked
 * with `allowPassThrough` in the harness, it will call its real implementation
 * without throwing an error.
 */
export const useABC = new TestCase({
  method: 'GET',
  url: '/rnpExample/useABC',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_A: 'rnpExample-useABC_A',
    dep1_B: 'rnpExample-useABC_B',
  },
  propertyMatchers: {
    c: expect.any(String),
  },
});

/**
 * A simple test case that calls one mocked dependency.
 */
export const useB_superJsonMethod = new TestCase({
  method: 'GET',
  url: '/rnpExample/useSuperJsonMethod',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_B: 'rnpExample-useB_superJsonMethod',
  },
});

/**
 * A test case that calls the same dependency twice.
 * The `requiredMocks` array provides two different mock files, which will be
 * returned in order for the two sequential calls to `dep1.methodD()`.
 */
export const useDTwice = new TestCase({
  method: 'GET',
  url: '/rnpExample/useDTwice',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_D: ['rnpExample-useDTwice_1', 'rnpExample-useDTwice_2'],
  },
});

/**
 * A test case for a dependency defined on a class prototype.
 */
export const usePrototypeDep = new TestCase({
  method: 'GET',
  url: '/rnpExample/usePrototypeDep',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    localDep: 'rnpExample-usePrototypeDep',
  },
});

/**
 * A test case for an unloaded dependency.
 * This test calls a method that requires the 'dep1_A' mock, but does not load it
 * via `requiredMocks`. This is designed to fail, demonstrating the safety
 * feature that prevents calls to managed dependencies that haven't been loaded.
 */
export const useBUnloaded_Recorder = new TestCase({
  method: 'GET',
  url: '/rnpExample/useSuperJsonMethod',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: { b: expect.any(String) },
});

/**
 * A test case for an unloaded dependency.
 * This test calls a method that requires the 'dep1_A' mock, but does not load it
 * via `requiredMocks`. This is designed to fail, demonstrating the safety
 * feature that prevents calls to managed dependencies that haven't been loaded.
 */
export const useBUnloaded_Mocked = new TestCase({
  method: 'GET',
  url: '/rnpExample/useSuperJsonMethod',
  expectedStatus: 500,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
});

/**
 * A recorder-only test case for a method that calls an unmapped dependency.
 * This test is only used in the recorder to generate a snapshot.
 * It is not used in "Play" mode.
 */
export const useUnmappedMethod_Recorder = new TestCase({
  method: 'GET',
  url: '/rnpExample/useUnmappedMethod',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  propertyMatchers: { unmapped: expect.any(String) },
});

/**
 * A "Play" mode test case that calls a method with an unmapped dependency.
 * The `useUnmappedMethod` endpoint calls `dep1.methodUnmapped`. Because `dep1`
 * is a "managed" object in the harness, but `methodUnmapped` is not explicitly
 * mocked or set to `allowPassThrough`, this test is expected to fail.
 * This demonstrates the key safety feature of the RnP framework.
 */
export const useUnmappedMethod_Mocked = new TestCase({
  method: 'GET',
  url: '/rnpExample/useUnmappedMethod',
  expectedStatus: 424,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: {},
});

/**
 * A test case for a method that calls a truly "unmanaged" dependency.
 * The `useUnlistedDep` endpoint calls `dep2.methodZ`. Because `dep2` is not
 * mentioned anywhere in the harness's `dependencyContracts`, it is "unmanaged"
 * and will always call its real implementation in both Record and Play modes.
 */
export const useUnlistedDep = new TestCase({
  method: 'GET',
  url: '/rnpExample/useUnlistedDep',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: {
    z: expect.any(String),
  },
});
