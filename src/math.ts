import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { BigNumber as EtherBN } from 'ethers';

export type BN = BigNumber;

export const PERCENTAGE_FACTOR = '100';
export const ONE_HUNDRED_PERCENTAGE_FACTOR = '10000';
export const HALF_PERCENTAGE = '5000';
export const WAD = Math.pow(10, 18).toString();
export const HALF_WAD = new BigNumber(WAD).multipliedBy(0.5).toString();
export const RAY = new BigNumber(10).exponentiatedBy(27).toFixed();
export const HALF_RAY = new BigNumber(RAY).multipliedBy(0.5).toFixed();
export const WAD_RAY_RATIO = Math.pow(10, 9).toString();
export const oneEther = new BigNumber(Math.pow(10, 18));
export const oneRay = new BigNumber(Math.pow(10, 27));
export const MAX_UINT_AMOUNT =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
export const ONE_YEAR = '31536000';
export const ONE_HOUR = '3600';

export const bn = (n: BigNumber.Value) => new BigNumber(n);
export const ray = (n: BigNumber.Value) => bn(RAY).multipliedBy(n);
export const percent = (n: BigNumber.Value) =>
  bn(PERCENTAGE_FACTOR).multipliedBy(n);
export const wad = (n: BigNumber.Value) => bn(WAD).multipliedBy(n);
export const amount = (n: BigNumber.Value, decimals = 18) =>
  bn(10).pow(decimals).multipliedBy(n);
export const toBN = (value: BigNumberish) => bn(EtherBN.from(value).toString());

export const binomCompound = (
  rate: BigNumber,
  periods: BigNumber.Value,
  binoms: number = 5
) => {
  let exp = bn(periods);
  if (exp.eq(0)) return ray(0);

  rate = ray(rate);
  let el = rate.mul(exp);
  let result = ray(1).add(el);

  for (let i = 1; i < binoms; i++) {
    if (exp.lte(i)) break;

    el = el
      .mul(exp.sub(i))
      .rayMul(rate)
      .div(i + 1);

    result = result.add(el);
  }

  return result.fromDecimals(27);
};

declare module 'bignumber.js' {
  interface BigNumber {
    str: () => string;
    fromDecimals: (decimals?: number) => BigNumber;
    toDecimals: (decimals?: number) => BigNumber;
    human: (decimals?: number, digits?: number, divider?: string) => string;
    ray: () => BigNumber;
    wad: () => BigNumber;
    halfRay: () => BigNumber;
    halfWad: () => BigNumber;
    halfPercentage: () => BigNumber;
    wadMul: (a: BigNumber) => BigNumber;
    wadDiv: (a: BigNumber) => BigNumber;
    rayMul: (a: BigNumber) => BigNumber;
    rayDiv: (a: BigNumber) => BigNumber;
    percentMul: (a: BigNumber) => BigNumber;
    percentDiv: (a: BigNumber) => BigNumber;
    rayToWad: () => BigNumber;
    wadToRay: () => BigNumber;

    sub: (n: BigNumber.Value) => BigNumber;
    add: (n: BigNumber.Value) => BigNumber;
    mul: (n: BigNumber.Value) => BigNumber;
  }
}

BigNumber.prototype.add = function (n: BigNumber.Value): BigNumber {
  return this.plus(n);
};
BigNumber.prototype.sub = function (n: BigNumber.Value): BigNumber {
  return this.minus(n);
};
BigNumber.prototype.mul = function (n: BigNumber.Value): BigNumber {
  return this.multipliedBy(n);
};

BigNumber.prototype.str = function (): string {
  return this.decimalPlaces(0, BigNumber.ROUND_DOWN).toFixed();
};

BigNumber.prototype.fromDecimals = function (decimals: number = 18): BigNumber {
  return this.decimalPlaces(decimals, BigNumber.ROUND_DOWN).div(
    new BigNumber(10).pow(decimals)
  );
};

BigNumber.prototype.toDecimals = function (decimals: number = 18): BigNumber {
  return this.mul(new BigNumber(10).pow(decimals)).decimalPlaces(
    0,
    BigNumber.ROUND_DOWN
  );
};

BigNumber.prototype.human = function (
  decimals: number = 18,
  digits: number = 4,
  divider: string = ' '
): string {
  function bytesToSize(n: number) {
    if (n == 0) return '0';
    const i = Math.floor(Math.log(n) / Math.log(1000));
    return (
      (n / Math.pow(1024, i))
        .toFixed(digits)
        .replace(/(\d)(?=(\d{3})+\.)/g, `$1${divider}`) +
      ' ' +
      (i > 0 ? Array(i).fill('k').join('') : '')
    );
  }

  return bytesToSize(this.fromDecimals(decimals).toNumber());
};

BigNumber.prototype.ray = (): BigNumber => {
  return new BigNumber(RAY).decimalPlaces(0);
};
BigNumber.prototype.wad = (): BigNumber => {
  return new BigNumber(WAD).decimalPlaces(0);
};

BigNumber.prototype.halfRay = (): BigNumber => {
  return new BigNumber(HALF_RAY).decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.halfWad = (): BigNumber => {
  return new BigNumber(HALF_WAD).decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.wadMul = function (b: BigNumber): BigNumber {
  return this.halfWad()
    .plus(this.multipliedBy(b))
    .div(WAD)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.wadDiv = function (a: BigNumber): BigNumber {
  const halfA = a.div(2).decimalPlaces(0, BigNumber.ROUND_DOWN);

  return halfA
    .plus(this.multipliedBy(WAD))
    .div(a)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.rayMul = function (a: BigNumber): BigNumber {
  return this.halfRay()
    .plus(this.multipliedBy(a))
    .div(RAY)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.rayDiv = function (a: BigNumber): BigNumber {
  const halfA = a.div(2).decimalPlaces(0, BigNumber.ROUND_DOWN);

  return halfA
    .plus(this.multipliedBy(RAY))
    .decimalPlaces(0, BigNumber.ROUND_DOWN)
    .div(a)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.rayToWad = function (): BigNumber {
  const halfRatio = new BigNumber(WAD_RAY_RATIO).div(2);

  return halfRatio
    .plus(this)
    .div(WAD_RAY_RATIO)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.wadToRay = function (): BigNumber {
  return this.multipliedBy(WAD_RAY_RATIO).decimalPlaces(
    0,
    BigNumber.ROUND_DOWN
  );
};

BigNumber.prototype.halfPercentage = (): BigNumber => {
  return new BigNumber(HALF_PERCENTAGE).decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.percentMul = function (b: BigNumber): BigNumber {
  return this.multipliedBy(b)
    .plus(HALF_PERCENTAGE)
    .div(ONE_HUNDRED_PERCENTAGE_FACTOR)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);
};

BigNumber.prototype.percentDiv = function (a: BigNumber): BigNumber {
  const halfA = a.div(2).decimalPlaces(0, BigNumber.ROUND_DOWN);

  return halfA
    .plus(this.multipliedBy(ONE_HUNDRED_PERCENTAGE_FACTOR))
    .div(a)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);
};
