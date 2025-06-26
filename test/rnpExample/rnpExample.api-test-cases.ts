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
);

export const useUnmappedMethodMocked = new TestCase(
  'GET',
  '/rnpExample/useUnmappedMethod',
  424,
  { network: 'TEST' },
  {},
  {},
);

export const useDep2 = new TestCase(
  'GET',
  '/rnpExample/useDep2',
  200,
  { network: 'TEST' },
  {},
  {},
  {
    z: expect.any(String),
  },
);
