import { utils } from 'ethers';

/**
 * The shortest decimal digits that read back as the same number, in plain notation.
 *
 * String(n) gives the shortest round-trip digits, which is the value the caller typed,
 * but switches to exponent form below 1e-7 and from 1e21; those are expanded here.
 * toFixed is not used: it prints the binary expansion, so (0.1).toFixed(18) ends in ...006.
 */
function plainDecimal(amount: number): string {
  const text = String(amount);
  if (!/e/i.test(text)) {
    return text;
  }
  const [mantissa, exponentText] = text.split(/e/i);
  const exponent = Number(exponentText);
  const negative = mantissa.startsWith('-');
  const [integerPart, fractionPart = ''] = mantissa.replace('-', '').split('.');
  const digits = integerPart + fractionPart;
  const point = integerPart.length + exponent;
  let plain: string;
  if (point <= 0) {
    plain = '0.' + '0'.repeat(-point) + digits;
  } else if (point >= digits.length) {
    plain = digits + '0'.repeat(point - digits.length);
  } else {
    plain = digits.slice(0, point) + '.' + digits.slice(point);
  }
  return negative ? '-' + plain : plain;
}

/**
 * A human token amount as the integer string a chain expects, in the token's smallest unit.
 *
 * `Math.floor(amount * 10 ** decimals).toString()` breaks in two places. A JS number prints
 * in exponent form from 1e21, which is a thousand tokens with 18 decimals, and both
 * JSBI.BigInt and BigNumber.from refuse "1e+21". And the float multiplication has lost exact
 * digits long before that, from 2^53 raw units. Here the typed digits are kept as text,
 * cut to what the token can represent (a floor, as before), and parseUnits does exact
 * arithmetic on the string.
 */
export function toRawAmount(amount: number, decimals: number): string {
  const [integerPart, fractionPart = ''] = plainDecimal(amount).split('.');
  const fraction = fractionPart.slice(0, decimals);
  return utils.parseUnits(fraction ? `${integerPart}.${fraction}` : integerPart, decimals).toString();
}
