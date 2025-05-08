export class UniswapishPriceError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UniswapishPriceError';
    this.stack = (<any>new Error()).stack;
  }
}