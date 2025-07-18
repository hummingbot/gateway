import { BigNumber } from 'ethers';

const randomInt = () => Math.floor(Math.random() * 100);

export class Dependency1 {
  A_basicMethod = async () => `real A_basicMethod-${randomInt()}`;

  B_superJsonMethod = async () => BigNumber.from(randomInt());

  C_passthroughMethod = async () => `real C_passthroughMethod-${randomInt()}`;

  D_usedTwiceInOneCallMethod = async () => `real D_usedTwiceInOneCallMethod-${randomInt()}`;

  unmappedMethod = async () => `real unmappedMethod-${randomInt()}`;
}

export class UnlistedDependency {
  unlistedMethod = async () => `real unlistedMethod-${randomInt()}`;
}

export class LocallyInitializedDependency {
  // Note the lambda function syntax will NOT work for prototype mocking as JS replicates the method for each instance
  // If you need to mock a lambda function you can't define then create a mock instance
  async prototypeMethod() {
    return `real prototypeMethod-${randomInt()}`;
  }
}

export class RnpExample {
  private static _instances: { [name: string]: RnpExample };
  public dep1: Dependency1;
  public dep2: UnlistedDependency;

  constructor() {
    this.dep1 = new Dependency1();
    this.dep2 = new UnlistedDependency();
  }

  public static async getInstance(network: string): Promise<RnpExample> {
    if (RnpExample._instances === undefined) {
      RnpExample._instances = {};
    }
    if (!(network in RnpExample._instances)) {
      const instance = new RnpExample();
      RnpExample._instances[network] = instance;
    }
    return RnpExample._instances[network];
  }

  async callABC() {
    const a = await this.dep1.A_basicMethod();
    const b = await this.dep1.B_superJsonMethod();
    const c = await this.dep1.C_passthroughMethod();
    return { a, b: b.toString(), c };
  }

  async callSuperJsonMethod() {
    const b = await this.dep1.B_superJsonMethod();
    if (!BigNumber.isBigNumber(b)) {
      throw new Error('b is not a BigNumber');
    }
    return { b: b.toString() };
  }

  async callDTwice() {
    const d1 = await this.dep1.D_usedTwiceInOneCallMethod();
    const d2 = await this.dep1.D_usedTwiceInOneCallMethod();
    return { d1, d2 };
  }

  async callUnmappedMethod() {
    const unmapped = await this.dep1.unmappedMethod();
    return { unmapped };
  }

  async callPrototypeDep() {
    const localDep = new LocallyInitializedDependency();
    const x = await localDep.prototypeMethod();
    return { x };
  }

  async callUnlistedDep() {
    const z = await this.dep2.unlistedMethod();
    return { z };
  }
}
