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

export const useUnmappedDep = new TestCase(
  'GET',
  '/rnpExample/useUnmappedDep',
  200,
  { network: 'TEST' },
  {},
  {},
);
