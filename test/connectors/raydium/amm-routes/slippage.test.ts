import { Percent } from '@raydium-io/raydium-sdk-v2';

describe('Raydium Slippage Calculation', () => {
  describe('Percent creation for slippage', () => {
    it('should correctly create Percent for 0% slippage', () => {
      const slippageValue = 0;
      const slippage = new Percent(Math.floor(slippageValue * 100), 10000);

      expect(slippage.numerator.toNumber()).toBe(0);
      expect(slippage.denominator.toNumber()).toBe(10000);
      expect(slippage.numerator.toNumber() / slippage.denominator.toNumber()).toBe(0);
    });

    it('should correctly create Percent for 1% slippage', () => {
      const slippageValue = 1;
      const slippage = new Percent(Math.floor(slippageValue * 100), 10000);

      expect(slippage.numerator.toNumber()).toBe(100);
      expect(slippage.denominator.toNumber()).toBe(10000);
      expect(slippage.numerator.toNumber() / slippage.denominator.toNumber()).toBe(0.01);
    });

    it('should correctly create Percent for 0.5% slippage', () => {
      const slippageValue = 0.5;
      const slippage = new Percent(Math.floor(slippageValue * 100), 10000);

      expect(slippage.numerator.toNumber()).toBe(50);
      expect(slippage.denominator.toNumber()).toBe(10000);
      expect(slippage.numerator.toNumber() / slippage.denominator.toNumber()).toBe(0.005);
    });

    it('should correctly create Percent for 10% slippage', () => {
      const slippageValue = 10;
      const slippage = new Percent(Math.floor(slippageValue * 100), 10000);

      expect(slippage.numerator.toNumber()).toBe(1000);
      expect(slippage.denominator.toNumber()).toBe(10000);
      expect(slippage.numerator.toNumber() / slippage.denominator.toNumber()).toBe(0.1);
    });

    it('should correctly create Percent for 50% slippage', () => {
      const slippageValue = 50;
      const slippage = new Percent(Math.floor(slippageValue * 100), 10000);

      expect(slippage.numerator.toNumber()).toBe(5000);
      expect(slippage.denominator.toNumber()).toBe(10000);
      expect(slippage.numerator.toNumber() / slippage.denominator.toNumber()).toBe(0.5);
    });
  });

  describe('Incorrect slippage calculation (old method)', () => {
    it('should show why the old calculation was wrong', () => {
      const slippageValue = 1; // 1%

      // Old incorrect method
      const oldSlippage = new Percent(Math.floor((slippageValue * 100) / 10000));

      // This would create Percent(0) because Math.floor(100/10000) = Math.floor(0.01) = 0
      expect(oldSlippage.numerator.toNumber()).toBe(0);
      expect(oldSlippage.denominator.toNumber()).toBe(1); // Default denominator when only numerator provided
      expect(oldSlippage.numerator.toNumber() / oldSlippage.denominator.toNumber()).toBe(0); // Wrong!
    });

    it('should show the old method fails for various percentages', () => {
      // All of these would incorrectly result in 0% slippage with the old method
      const testValues = [0.5, 1, 2, 5, 10];

      testValues.forEach((value) => {
        const oldSlippage = new Percent(Math.floor((value * 100) / 10000));

        if (value < 100) {
          // All values less than 100% would become 0
          expect(oldSlippage.numerator.toNumber()).toBe(0);
        }
      });
    });
  });

  describe('Slippage multiplier calculation', () => {
    it('should calculate correct slippage multiplier', () => {
      const testCases = [
        { slippagePct: 0, expectedMultiplier: 1.0 },
        { slippagePct: 1, expectedMultiplier: 0.99 },
        { slippagePct: 5, expectedMultiplier: 0.95 },
        { slippagePct: 10, expectedMultiplier: 0.9 },
        { slippagePct: 50, expectedMultiplier: 0.5 },
      ];

      testCases.forEach(({ slippagePct, expectedMultiplier }) => {
        const slippage = new Percent(Math.floor(slippagePct * 100), 10000);
        const slippageDecimal = slippage.numerator.toNumber() / slippage.denominator.toNumber();
        const slippageMultiplier = 1 - slippageDecimal;

        expect(slippageMultiplier).toBeCloseTo(expectedMultiplier, 5);
      });
    });
  });
});
