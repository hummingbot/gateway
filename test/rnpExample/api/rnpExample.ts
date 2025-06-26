export class Dep1 {
  methodA = () => 'real methodA-' + Math.random();

  methodB = () => 'real methodB-' + Math.random();

  methodC = () => 'real methodC-' + Math.random();

  methodD = () => 'real methodD-' + Math.random();
}

export class Dep2 {
  methodZ = () => 'real methodZ-' + Math.random();
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
    const a = this.dep1.methodA();
    const b = this.dep1.methodB();
    const c = this.dep1.methodC();
    return { a, b, c };
  }

  async useDTwice() {
    const d1 = this.dep1.methodD();
    const d2 = this.dep1.methodD();
    return { d1, d2 };
  }

  async useUnmappedDep() {
    const z = this.dep2.methodZ();
    return { z };
  }
}
