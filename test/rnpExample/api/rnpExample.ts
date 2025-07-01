import { BigNumber } from 'ethers';

export class Dep1 {
  methodA = async () => 'real methodA-' + Math.random();

  methodB = async () => BigNumber.from(Math.floor(Math.random() * 1000000));

  methodC = async () => 'real methodC-' + Math.random();

  methodD = async () => 'real methodD-' + Math.random();

  methodUnmapped = async () => 'real methodUnmapped-' + Math.random();
}

export class Dep2 {
  methodZ = async () => 'real methodZ-' + Math.random();
}

export class DepProto {
  async methodX() {
    return 'real methodX-' + Math.random();
  }
}

export class RnpExample {
  private static _instances: { [name: string]: RnpExample };
  public dep1: Dep1;
  public dep2: Dep2;

  constructor() {
    this.dep1 = new Dep1();
    this.dep2 = new Dep2();
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
    const a = await this.dep1.methodA();
    const b = await this.dep1.methodB();
    const c = await this.dep1.methodC();
    return { a, b: b.toString(), c };
  }

  async useB() {
    const b = await this.dep1.methodB();
    if (!BigNumber.isBigNumber(b)) {
      throw new Error('b is not a BigNumber');
    }
    return { b: b.toString() };
  }

  async useDTwice() {
    const d1 = await this.dep1.methodD();
    const d2 = await this.dep1.methodD();
    return { d1, d2 };
  }

  async useUnmappedMethod() {
    const unmapped = await this.dep1.methodUnmapped();
    return { unmapped };
  }

  async useProtoDep() {
    const dep3 = new DepProto();
    const x = await dep3.methodX();
    return { x };
  }

  async useUnlistedDep() {
    const z = await this.dep2.methodZ();
    return { z };
  }
}
