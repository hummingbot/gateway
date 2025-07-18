import { APITestCase } from '#test/record-and-play/api-test-case';

import { RnpExampleTestHarness } from './rnpExample.test-harness';

class TestCase extends APITestCase<RnpExampleTestHarness> {}

/**
 * A standard test case that calls a method with multiple mocked dependencies.
 * Note that `dep1_C` is not listed in `requiredMocks`. Because it is marked
 * with `allowPassThrough` in the harness, it will call its real implementation
 * without throwing an error.
 */
export const callABC = new TestCase({
  method: 'GET',
  url: '/rnpExample/callABC',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_A: 'rnpExample-callABC_A',
    dep1_B: 'rnpExample-callABC_B',
  },
  propertyMatchers: {
    c: expect.any(String),
  },
});

/**
 * A simple test case that calls one mocked dependency.
 */
export const callB_superJsonMethod = new TestCase({
  method: 'GET',
  url: '/rnpExample/callSuperJsonMethod',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_B: 'rnpExample-callB_superJsonMethod',
  },
});

/**
 * A test case that calls the same dependency twice.
 * The `requiredMocks` array provides two different mock files, which will be
 * returned in order for the two sequential calls to `dep1.D_usedTwiceInOneCallMethod()`.
 */
export const callDTwice = new TestCase({
  method: 'GET',
  url: '/rnpExample/callDTwice',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_D: ['rnpExample-callDTwice_1', 'rnpExample-callDTwice_2'],
  },
});

/**
 * A test case for a dependency defined on a class prototype.
 */
export const callPrototypeDep = new TestCase({
  method: 'GET',
  url: '/rnpExample/callPrototypeDep',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    localDep: 'rnpExample-callPrototypeDep',
  },
});

/**
 * A test case for a method that calls a truly "unmanaged" dependency.
 * The `callUnlistedDep` endpoint calls `dep2.unlistedMethod`. Because `dep2` is not
 * mentioned anywhere in the harness's `dependencyContracts`, it is "unmanaged"
 * and will always call its real implementation in both Record and Play modes.
 */
export const callUnlistedDep = new TestCase({
  method: 'GET',
  url: '/rnpExample/callUnlistedDep',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: {
    z: expect.any(String),
  },
});

/**
 * A recorder-only test case for an unloaded dependency.
 * This exists to demonstrate that the recorder and "Play" mode test output
 * varies in this scenario as the mock test will fail but recorder test will pass.
 */
export const callBUnloaded_Recorder = new TestCase({
  method: 'GET',
  url: '/rnpExample/callSuperJsonMethod',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: { b: expect.any(String) },
});

/**
 * A failure test case for a mock/"Play" mode test with an unloaded dependency.
 * This test calls a method that requires the 'dep1_A' mock, but does not load it
 * via `requiredMocks`. This is designed to fail, demonstrating the safety
 * feature that prevents calls to managed dependencies that haven't been loaded.
 */
export const callBUnloaded_Mocked = new TestCase({
  method: 'GET',
  url: '/rnpExample/callSuperJsonMethod',
  expectedStatus: 500,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
});

/**
 * A recorder-only test case for a method that calls an unmapped method on a managed dependency.
 * This exists to demonstrate that the recorder and "Play" mode test output
 * varies in this scenario as the mock test will fail but recorder test will pass.
 */
export const callUnmappedMethod_Recorder = new TestCase({
  method: 'GET',
  url: '/rnpExample/callUnmappedMethod',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  propertyMatchers: { unmapped: expect.any(String) },
});

/**
 * A failure test case for a "Play" mode test case that calls a method with an unmapped dependency.
 * The `callUnmappedMethod` endpoint calls `dep1.unmappedMethod`.
 * But because `dep1` * is a "managed" object in the harness and `unmappedMethod`
 * is not explicitly mocked or set to `allowPassThrough`, this test gets a error return object.
 * This demonstrates the key safety feature of the RnP framework
 * that prevents calls to unmapped methods. .
 */
export const callUnmappedMethod_Mocked = new TestCase({
  method: 'GET',
  url: '/rnpExample/callUnmappedMethod',
  expectedStatus: 424,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: {},
});
