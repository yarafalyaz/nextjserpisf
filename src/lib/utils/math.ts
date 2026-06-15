
/**
 * Central mathematical utility for precise rounding and currency calculations.
 * Defaults to 0 decimal places (perfect for Indonesian Rupiah - IDR).
 */

export type SafeMathInput =
  | number
  | string
  | null
  | undefined
  | { toString(): string; toNumber?(): number };

/**
 * Helper to safely parse unknown SafeMathInput into a primitive number.
 */
function parseNumber(value: SafeMathInput): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object") {
    if ("toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
      return (value as { toNumber: () => number }).toNumber();
    }
    return Number(value.toString());
  }
  return Number(value);
}

/**
 * Rounds a number to a specific number of decimal places using exponential notation
 * to prevent standard JavaScript binary floating-point representation issues.
 *
 * @param value The number, string representation, or null/undefined/Decimal to round.
 * @param decimals Number of decimal places (default is 0 for IDR currency).
 */
export function safeRound(
  value: SafeMathInput,
  decimals: number = 0
): number {
  const num = parseNumber(value);
  if (isNaN(num) || !isFinite(num)) return 0;
  
  // Use exponential notation to avoid JS floating-point inaccuracies
  // e.g. safeRound(1.005, 2) -> 1.01
  const str = String(num);
  const eIndex = str.indexOf("e");
  
  if (eIndex === -1) {
    // Normal non-exponential numbers
    const shifted = Number(num + "e" + decimals);
    const rounded = Math.round(shifted);
    const roundedStr = String(rounded);
    
    // Math.round on very large shifts can push the intermediate value into 
    // exponential notation (e.g. 1e+21), so we must check roundedStr too.
    if (roundedStr.indexOf("e") === -1) {
      return Number(roundedStr + "e-" + decimals);
    }
    return rounded / Math.pow(10, decimals);
  }

  // Already in exponential form (e.g. 1e-7, 1e+21)
  const base = str.slice(0, eIndex);
  const exponent = parseInt(str.slice(eIndex + 1), 10);
  const newExponent = exponent + decimals;
  const shifted = Number(base + "e" + newExponent);
  const rounded = Math.round(shifted);
  
  const roundedStr = String(rounded);
  if (roundedStr.indexOf("e") === -1) {
    return Number(roundedStr + "e-" + decimals);
  }
  
  // The rounded value itself overflowed into exponential form
  const rEIndex = roundedStr.indexOf("e");
  const rBase = roundedStr.slice(0, rEIndex);
  const rExponent = parseInt(roundedStr.slice(rEIndex + 1), 10);
  return Number(rBase + "e" + (rExponent - decimals));
}

/**
 * Safely adds two numbers and rounds the result.
 */
export function safeAdd(
  a: SafeMathInput,
  b: SafeMathInput,
  decimals: number = 0
): number {
  const numA = parseNumber(a);
  const numB = parseNumber(b);
  return safeRound(numA + numB, decimals);
}

/**
 * Safely subtracts two numbers and rounds the result.
 */
export function safeSubtract(
  a: SafeMathInput,
  b: SafeMathInput,
  decimals: number = 0
): number {
  const numA = parseNumber(a);
  const numB = parseNumber(b);
  return safeRound(numA - numB, decimals);
}

/**
 * Safely multiplies two numbers and rounds the result.
 */
export function safeMultiply(
  a: SafeMathInput,
  b: SafeMathInput,
  decimals: number = 0
): number {
  const numA = parseNumber(a);
  const numB = parseNumber(b);
  return safeRound(numA * numB, decimals);
}

/**
 * Safely divides two numbers and rounds the result.
 */
export function safeDivide(
  numerator: SafeMathInput,
  denominator: SafeMathInput,
  decimals: number = 0
): number {
  const numA = parseNumber(numerator);
  const numB = parseNumber(denominator);
  if (numB === 0) return 0;
  return safeRound(numA / numB, decimals);
}

/**
 * Sums an array of values, rounding each value and the final sum.
 */
export function safeSum(
  numbers: SafeMathInput[],
  decimals: number = 0
): number {
  return numbers.reduce<number>((sum, num) => {
    return safeAdd(sum, safeRound(num, decimals), decimals);
  }, 0);
}

/**
 * Compares two amounts for equality within a given tolerance.
 * Useful for double-entry checks or balance matching.
 */
export function compareAmounts(
  a: SafeMathInput,
  b: SafeMathInput,
  tolerance: number = 0
): boolean {
  const diff = Math.abs(safeSubtract(a, b, 4));
  return diff <= tolerance;
}
