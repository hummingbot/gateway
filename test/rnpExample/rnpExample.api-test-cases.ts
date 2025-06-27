import { APITestCase } from '#test/record-and-play/api-test-case';

import { RnpExampleTestHarness } from './rnpExample.test-harness';

class TestCase extends APITestCase<RnpExampleTestHarness> {}

export const useABC = new TestCase(
  'GET',
  '/rnpExample/useABC',
  200,
  { network: 'TEST' },
  {},
  {
    dep1_A: 'rnpExample-methodA',
    dep1_B: 'rnpExample-methodB',
  },
  {
    c: expect.any(String),
  },
);

export const useDTwice = new TestCase(
  'GET',
  '/rnpExample/useDTwice',
  200,
  { network: 'TEST' },
  {},
  {
    dep1_D: ['rnpExample-methodD1', 'rnpExample-methodD2'],
  },
);

export const useUnmappedMethodRecorder = new TestCase(
  'GET',
  '/rnpExample/useUnmappedMethod',
  200,
  { network: 'TEST' },
  {},
  {},
  { unmapped: expect.any(String) },
);

export const useUnmappedMethodMocked = new TestCase(
  'GET',
  '/rnpExample/useUnmappedMethod',
  424,
  { network: 'TEST' },
  {},
  {},
);

export const useUnmappedDep = new TestCase(
  'GET',
  '/rnpExample/useUnmappedDep',
  200,
  { network: 'TEST' },
  {},
  {},
  {
    z: expect.any(String),
  },
);

export const useProtoDep = new TestCase(
  'GET',
  '/rnpExample/useProtoDep',
  200,
  { network: 'TEST' },
  {},
  {
    dep3_X: 'rnpExample-methodX',
  },
);
