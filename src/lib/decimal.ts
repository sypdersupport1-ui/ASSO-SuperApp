/**
 * ASSO Shared Domain Engine — Exact Decimal & Financial Arithmetic
 * 
 * Invariant: Never use IEEE 754 binary floating-point Number arithmetic
 * for monetary calculations, tax rates, fee figures, or ledger balances.
 * 
 * All arithmetic is performed using exact arbitrary-precision base-10
 * integers via native JavaScript BigInt with deterministic half-up rounding.
 */

import { ValidationError } from "@/lib/api/errors";

export type DecimalLike = Decimal | string | number | bigint;

export class Decimal {
  public readonly unscaled: bigint;
  public readonly scale: number;

  constructor(unscaled: bigint, scale: number) {
    this.unscaled = unscaled;
    this.scale = Math.max(0, Math.floor(scale));
  }

  /**
   * Constructs an exact Decimal from a string, bigint, number, or Decimal.
   * Strings and integers are preferred to prevent IEEE 754 precision loss.
   */
  static from(value: DecimalLike): Decimal {
    if (value instanceof Decimal) {
      return value;
    }

    if (typeof value === "bigint") {
      return new Decimal(value, 0);
    }

    let s = String(value).trim();
    if (!s) {
      throw new ValidationError("Cannot construct Decimal from empty value.");
    }

    // Normalize leading dot e.g. ".5" -> "0.5", "-.5" -> "-0.5"
    s = s.replace(/^([+-])?\./, "$10.");

    // Handle scientific notation e.g. 1e-4, 2.5e+3
    if (/^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)$/i.test(s)) {
      const [coeff, expStr] = s.toLowerCase().split("e");
      const exp = parseInt(expStr, 10);
      const sign = coeff.startsWith("-") ? -1n : 1n;
      const absCoeff = coeff.replace(/^[+-]/, "");
      const [intP, fracP = ""] = absCoeff.split(".");
      const digits = intP + fracP;
      const initialScale = fracP.length;
      const netScale = initialScale - exp;
      if (netScale >= 0) {
        return new Decimal(sign * BigInt(digits), netScale);
      } else {
        const factor = 10n ** BigInt(-netScale);
        return new Decimal(sign * BigInt(digits) * factor, 0);
      }
    }

    const m = s.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
    if (!m) {
      throw new ValidationError(`Invalid decimal literal: '${s}'.`);
    }

    const sign = m[1] === "-" ? -1n : 1n;
    const intPart = m[2];
    const fracPart = m[3] || "";
    const scale = fracPart.length;
    const unscaled = sign * BigInt(intPart + fracPart);

    return new Decimal(unscaled, scale);
  }

  static zero(): Decimal {
    return new Decimal(0n, 0);
  }

  static one(): Decimal {
    return new Decimal(1n, 0);
  }

  /**
   * Exact addition: a + b
   */
  plus(other: DecimalLike): Decimal {
    const o = Decimal.from(other);
    const maxScale = Math.max(this.scale, o.scale);
    const factorThis = 10n ** BigInt(maxScale - this.scale);
    const factorOther = 10n ** BigInt(maxScale - o.scale);
    const u = this.unscaled * factorThis + o.unscaled * factorOther;
    return new Decimal(u, maxScale);
  }

  /**
   * Exact subtraction: a - b
   */
  minus(other: DecimalLike): Decimal {
    const o = Decimal.from(other);
    const maxScale = Math.max(this.scale, o.scale);
    const factorThis = 10n ** BigInt(maxScale - this.scale);
    const factorOther = 10n ** BigInt(maxScale - o.scale);
    const u = this.unscaled * factorThis - o.unscaled * factorOther;
    return new Decimal(u, maxScale);
  }

  /**
   * Exact multiplication: a * b
   * Scale of result is scale(a) + scale(b).
   */
  times(other: DecimalLike): Decimal {
    const o = Decimal.from(other);
    return new Decimal(this.unscaled * o.unscaled, this.scale + o.scale);
  }

  /**
   * Exact division with specified target scale and HALF_UP rounding.
   */
  dividedBy(
    other: DecimalLike,
    targetDecimals = 4,
    mode: "HALF_UP" = "HALF_UP"
  ): Decimal {
    const o = Decimal.from(other);
    if (o.unscaled === 0n) {
      throw new ValidationError("Division by zero in Decimal calculation.");
    }

    const D = BigInt(targetDecimals);
    const powerNum = D + BigInt(o.scale);
    const powerDen = BigInt(this.scale);

    let num = this.unscaled;
    let den = o.unscaled;

    if (powerNum >= powerDen) {
      num = num * (10n ** (powerNum - powerDen));
    } else {
      den = den * (10n ** (powerDen - powerNum));
    }

    let q = num / den;
    const r = num % den;
    const absR = r < 0n ? -r : r;
    const absDen = den < 0n ? -den : den;

    if (mode === "HALF_UP" && absR * 2n >= absDen) {
      const sameSign = (num >= 0n && den > 0n) || (num <= 0n && den < 0n);
      q += sameSign ? 1n : -1n;
    }

    return new Decimal(q, targetDecimals);
  }

  /**
   * Rounds the decimal to targetDecimals using standard HALF_UP rounding.
   */
  round(targetDecimals: number, mode: "HALF_UP" | "TRUNC" = "HALF_UP"): Decimal {
    if (this.scale <= targetDecimals) {
      const factor = 10n ** BigInt(targetDecimals - this.scale);
      return new Decimal(this.unscaled * factor, targetDecimals);
    }

    const diff = this.scale - targetDecimals;
    const divisor = 10n ** BigInt(diff);
    const half = divisor / 2n;

    let q = this.unscaled / divisor;
    const r = this.unscaled % divisor;
    const absR = r < 0n ? -r : r;

    if (mode === "HALF_UP" && absR >= half) {
      q += this.unscaled >= 0n ? 1n : -1n;
    }

    return new Decimal(q, targetDecimals);
  }

  abs(): Decimal {
    return this.unscaled < 0n
      ? new Decimal(-this.unscaled, this.scale)
      : this;
  }

  negate(): Decimal {
    return new Decimal(-this.unscaled, this.scale);
  }

  isZero(): boolean {
    return this.unscaled === 0n;
  }

  isNegative(): boolean {
    return this.unscaled < 0n;
  }

  isPositive(): boolean {
    return this.unscaled > 0n;
  }

  equals(other: DecimalLike): boolean {
    return this.minus(other).isZero();
  }

  greaterThan(other: DecimalLike): boolean {
    return this.minus(other).unscaled > 0n;
  }

  greaterThanOrEqualTo(other: DecimalLike): boolean {
    return this.minus(other).unscaled >= 0n;
  }

  lessThan(other: DecimalLike): boolean {
    return this.minus(other).unscaled < 0n;
  }

  lessThanOrEqualTo(other: DecimalLike): boolean {
    return this.minus(other).unscaled <= 0n;
  }

  /**
   * Formats the Decimal to a fixed string representation with exact decimal digits.
   */
  toFixed(decimals: number, mode: "HALF_UP" | "TRUNC" = "HALF_UP"): string {
    const rounded = this.round(decimals, mode);
    const sign = rounded.unscaled < 0n ? "-" : "";
    const absU = rounded.unscaled < 0n ? -rounded.unscaled : rounded.unscaled;
    const str = absU.toString().padStart(decimals + 1, "0");

    if (decimals === 0) {
      return sign + str;
    }

    const intPart = str.slice(0, -decimals);
    const fracPart = str.slice(-decimals);
    return `${sign}${intPart}.${fracPart}`;
  }

  toString(): string {
    return this.toFixed(this.scale);
  }

  /**
   * Non-authoritative conversion for UI/logging convenience only.
   * Do NOT use for authoritative calculations.
   */
  toNumber(): number {
    return Number(this.toString());
  }

  static sum(...values: DecimalLike[]): Decimal {
    let result = Decimal.zero();
    for (const v of values) {
      result = result.plus(v);
    }
    return result;
  }

  static min(...values: DecimalLike[]): Decimal {
    if (values.length === 0) throw new Error("min() requires at least one value.");
    let m = Decimal.from(values[0]);
    for (let i = 1; i < values.length; i++) {
      const v = Decimal.from(values[i]);
      if (v.lessThan(m)) m = v;
    }
    return m;
  }

  static max(...values: DecimalLike[]): Decimal {
    if (values.length === 0) throw new Error("max() requires at least one value.");
    let m = Decimal.from(values[0]);
    for (let i = 1; i < values.length; i++) {
      const v = Decimal.from(values[i]);
      if (v.greaterThan(m)) m = v;
    }
    return m;
  }
}

// ============================================================================
// Authoritative Order Financial Calculation Engine
// ============================================================================

export interface MonetaryLineItemInput {
  itemId?: string;
  itemName?: string;
  unitPrice: DecimalLike;
  quantity: number | bigint;
  fulfillmentStation?: string;
  specialNotes?: string | null;
}

export interface MonetaryCalculatedLineItem {
  itemId?: string;
  itemName?: string;
  unitPriceDb: string;
  unitPriceDto: string;
  quantity: number;
  subtotalDb: string;
  subtotalDto: string;
  subtotal: Decimal;
  fulfillmentStation?: string;
  specialNotes?: string | null;
}

export interface MonetaryOrderTotalsInput {
  items: MonetaryLineItemInput[];
  taxRate?: DecimalLike;
  platformFeeRate?: DecimalLike;
  platformFeeFixed?: DecimalLike;
  platformFeeType?: "PERCENTAGE" | "FIXED";
  discountAmount?: DecimalLike;
  /**
   * Monetary rounding scale: defaults to 2 decimal places (standard paisa/cents).
   */
  roundingScale?: number;
}

export interface MonetaryOrderTotalsResult {
  // Database format strings (scale 4)
  subtotalAmountDb: string;
  taxRateDb: string;
  taxAmountDb: string;
  platformFeeType: "PERCENTAGE" | "FIXED";
  platformFeeRateDb: string;
  platformFeeAmountDb: string;
  discountAmountDb: string;
  totalAmountDb: string;

  // DTO / Presentation strings (scale 2 for amounts, scale 4 for rates)
  subtotalAmountDto: string;
  taxRateDto: string;
  taxAmountDto: string;
  platformFeeRateDto: string;
  platformFeeAmountDto: string;
  discountAmountDto: string;
  totalAmountDto: string;

  // Exact Decimal objects for chaining
  subtotal: Decimal;
  taxRate: Decimal;
  taxAmount: Decimal;
  platformFeeRate: Decimal;
  platformFeeAmount: Decimal;
  discountAmount: Decimal;
  totalAmount: Decimal;

  // Calculated Line Item Breakdown
  lineItems: MonetaryCalculatedLineItem[];
}

/**
 * Computes exact monetary totals according to ASSO Financial Invariants:
 * 
 * 1. subtotal = SUM(unit_price * quantity)
 * 2. tax = ROUND_HALF_UP(subtotal * tax_rate, 2)
 * 3. platform_fee:
 *      if PERCENTAGE -> ROUND_HALF_UP(subtotal * fee_rate, 2)
 *      if FIXED      -> ROUND_HALF_UP(fixed_amount, 2)
 * 4. total = subtotal + tax + platform_fee - discount
 * 
 * Invariants Enforced:
 * - GST is NEVER compounded on platform fee.
 * - Platform fee is NEVER compounded on GST.
 * - Zero floating-point arithmetic.
 */
export function calculateExactOrderTotals(
  input: MonetaryOrderTotalsInput
): MonetaryOrderTotalsResult {
  const roundingScale = input.roundingScale ?? 2;

  // 1. Calculate Exact Subtotal & Line Items
  const lineItems: MonetaryCalculatedLineItem[] = [];
  let subtotal = Decimal.zero();

  for (const it of input.items) {
    const price = Decimal.from(it.unitPrice);
    if (price.isNegative()) {
      throw new ValidationError("Item unit price cannot be negative.");
    }
    const qty = BigInt(it.quantity);
    if (qty <= 0n) {
      throw new ValidationError("Item quantity must be greater than zero.");
    }
    const lineSubtotal = price.times(qty);
    subtotal = subtotal.plus(lineSubtotal);

    lineItems.push({
      itemId: it.itemId,
      itemName: it.itemName,
      unitPriceDb: price.toFixed(4),
      unitPriceDto: price.toFixed(2),
      quantity: Number(qty),
      subtotalDb: lineSubtotal.toFixed(4),
      subtotalDto: lineSubtotal.toFixed(2),
      subtotal: lineSubtotal,
      fulfillmentStation: it.fulfillmentStation,
      specialNotes: it.specialNotes,
    });
  }

  // 2. Exact GST / Tax Calculation
  const taxRateDec = input.taxRate
    ? Decimal.from(input.taxRate)
    : Decimal.zero();
  if (taxRateDec.isNegative()) {
    throw new ValidationError("Tax rate cannot be negative.");
  }
  const taxAmountDec = subtotal.times(taxRateDec).round(roundingScale, "HALF_UP");

  // 3. Exact Platform Fee Calculation
  const platformFeeType = input.platformFeeType ?? "PERCENTAGE";
  let platformFeeRateDec = Decimal.zero();
  let platformFeeAmountDec = Decimal.zero();

  if (platformFeeType === "PERCENTAGE") {
    platformFeeRateDec = input.platformFeeRate
      ? Decimal.from(input.platformFeeRate)
      : Decimal.zero();
    if (platformFeeRateDec.isNegative()) {
      throw new ValidationError("Platform fee rate cannot be negative.");
    }
    platformFeeAmountDec = subtotal
      .times(platformFeeRateDec)
      .round(roundingScale, "HALF_UP");
  } else {
    platformFeeRateDec = Decimal.zero();
    const fixedDec = input.platformFeeFixed
      ? Decimal.from(input.platformFeeFixed)
      : Decimal.zero();
    if (fixedDec.isNegative()) {
      throw new ValidationError("Platform fixed fee cannot be negative.");
    }
    platformFeeAmountDec = fixedDec.round(roundingScale, "HALF_UP");
  }

  // 4. Exact Discount Calculation
  const discountDec = input.discountAmount
    ? Decimal.from(input.discountAmount).round(roundingScale, "HALF_UP")
    : Decimal.zero();
  if (discountDec.isNegative()) {
    throw new ValidationError("Discount amount cannot be negative.");
  }

  // 5. Exact Order Total Calculation
  const totalAmountDec = subtotal
    .plus(taxAmountDec)
    .plus(platformFeeAmountDec)
    .minus(discountDec);

  return {
    subtotalAmountDb: subtotal.toFixed(4),
    taxRateDb: taxRateDec.toFixed(4),
    taxAmountDb: taxAmountDec.toFixed(4),
    platformFeeType,
    platformFeeRateDb: platformFeeRateDec.toFixed(4),
    platformFeeAmountDb: platformFeeAmountDec.toFixed(4),
    discountAmountDb: discountDec.toFixed(4),
    totalAmountDb: totalAmountDec.toFixed(4),

    subtotalAmountDto: subtotal.toFixed(2),
    taxRateDto: taxRateDec.toFixed(4),
    taxAmountDto: taxAmountDec.toFixed(2),
    platformFeeRateDto: platformFeeRateDec.toFixed(4),
    platformFeeAmountDto: platformFeeAmountDec.toFixed(2),
    discountAmountDto: discountDec.toFixed(2),
    totalAmountDto: totalAmountDec.toFixed(2),

    subtotal,
    taxRate: taxRateDec,
    taxAmount: taxAmountDec,
    platformFeeRate: platformFeeRateDec,
    platformFeeAmount: platformFeeAmountDec,
    discountAmount: discountDec,
    totalAmount: totalAmountDec,

    lineItems,
  };
}
