import { APITestCase } from '#test/record-and-play/api-test-case';

import { RnpExampleTestHarness } from './rnpExample.test-harness';

class TestCase extends APITestCase<RnpExampleTestHarness> {}

export const useABC = new TestCase({
  method: 'GET',
  url: '/rnpExample/useABC',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_A: 'rnpExample-methodA',
    dep1_B: 'rnpExample-methodB',
  },
  propertyMatchers: {
    c: expect.any(String),
  },
});

export const useB = new TestCase({
  method: 'GET',
  url: '/rnpExample/useB',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_B: 'rnpExample-methodB-useB',
  },
});

export const useDTwice = new TestCase({
  method: 'GET',
  url: '/rnpExample/useDTwice',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep1_D: ['rnpExample-methodD1', 'rnpExample-methodD2'],
  },
});

export const useUnmappedMethodRecorder = new TestCase({
  method: 'GET',
  url: '/rnpExample/useUnmappedMethod',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  propertyMatchers: { unmapped: expect.any(String) },
});

export const useUnmappedMethodMocked = new TestCase({
  method: 'GET',
  url: '/rnpExample/useUnmappedMethod',
  expectedStatus: 424,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: {},
});

export const useUnmappedDep = new TestCase({
  method: 'GET',
  url: '/rnpExample/useUnmappedDep',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {},
  propertyMatchers: {
    z: expect.any(String),
  },
});

export const useProtoDep = new TestCase({
  method: 'GET',
  url: '/rnpExample/useProtoDep',
  expectedStatus: 200,
  query: { network: 'TEST' },
  payload: {},
  requiredMocks: {
    dep3_X: 'rnpExample-methodX',
  },
});
