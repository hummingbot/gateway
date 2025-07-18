import { BigNumber } from 'ethers';

export class Dependency1 {
  A_basicMethod = async () => `real methodA-${Math.random()}`;

  B_superJsonMethod = async () =>
    BigNumber.from(Math.floor(Math.random() * 1000000));

  C_passthroughMethod = async () => `real C_passthroughMethod-${Math.random()}`;

  D_usedTwiceInOneCallMethod = async () => `real methodD-${Math.random()}`;

  unmappedMethod = async () => `real unmappedMethod-${Math.random()}`;
}

export class UnlistedDependency {
  unlistedMethod = async () => `real methodZ-${Math.random()}`;
}

export class LocallyInitializedDependency {
  async prototypeMethod() {
    return `real methodX-${Math.random()}`;
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

  async useABC() {
    const a = await this.dep1.A_basicMethod();
    const b = await this.dep1.B_superJsonMethod();
    const c = await this.dep1.C_passthroughMethod();
    return { a, b: b.toString(), c };
  }

  async useSuperJsonMethod() {
    const b = await this.dep1.B_superJsonMethod();
    if (!BigNumber.isBigNumber(b)) {
      throw new Error('b is not a BigNumber');
    }
    return { b: b.toString() };
  }

  async useDTwice() {
    const d1 = await this.dep1.D_usedTwiceInOneCallMethod();
    const d2 = await this.dep1.D_usedTwiceInOneCallMethod();
    return { d1, d2 };
  }

  async useUnmappedMethod() {
    const unmapped = await this.dep1.unmappedMethod();
    return { unmapped };
  }

  async usePrototypeDep() {
    const localDep = new LocallyInitializedDependency();
    const x = await localDep.prototypeMethod();
    return { x };
  }

  async useUnlistedDep() {
    const z = await this.dep2.unlistedMethod();
    return { z };
  }
}
