import BigNumber from "bignumber.js";
import { Expose, Transform } from "class-transformer";
import { DatastoreDocument, Index, Key } from "../db/document";
import { amount, bn, ray } from "../math";
import { defined } from '../utils';
import { DatastoreConnection } from '../db/connection';

function BigNumberTransform() {
  return Transform((params) => {
    if (typeof params.value === "string") {
      // to class case
      return bn(params.value);
    } else if (params.value instanceof BigNumber) {
      // to plain case
      return params.value.str();
    }
  });
}

export class Lazy<T> {
  private cachedValue?: T;
  loading: boolean;

  get value(): Promise<T> {
    return new Promise(async (resolve, reject) => {
      if (!this.cachedValue)
        try {
          this.cachedValue = await this.loadFn();
        } catch (e) {
          return reject(e);
        }

      if (this.cachedValue) resolve(this.cachedValue);
      else
        reject(
          new Error("Load function done with error but didnt return value")
        );
    });
  }

  constructor(private loadFn: (...args: any[]) => Promise<T>) {
    this.loading = false;
  }
}

const HexKey = (size: number) =>
  Key({
    size,
    transform: (hex: string) => {
      const buf = Buffer.alloc(size, 0);
      hex = hex.startsWith("0x") ? hex.substr(2) : hex;

      if (size < buf.length) {
        throw new Error("HexIndex is not long enough");
      }

      Buffer.from(hex, "hex").copy(buf, size - buf.length);

      return buf;
    },
  });

const AddressKey = () => HexKey(20);

const HexIndex = (size: number) =>
  Index({
    size,
    getter: (hex?: string) => {
      const buf = Buffer.alloc(size, 0);
      if (hex) {
        hex = hex.startsWith("0x") ? hex.substr(2) : hex;

        if (size < buf.length) {
          throw new Error("HexIndex is not long enough");
        }

        Buffer.from(hex, "hex").copy(buf, size - buf.length);
      }
      return buf;
    },
  });

const AddressIndex = () => HexIndex(20);

const BooleanIndex = () =>
  Index({
    size: 1,
    getter: (value: boolean) => {
      return Buffer.alloc(1, value ? 1 : 0);
    },
  });

const BigNumberIndex = (size: number = 32) =>
  Index({
    size,
    getter: (value: BigNumber) => {
      const result = Buffer.alloc(size, 0);
      const tmp = Buffer.from(value.toString(16), "hex");
      tmp.copy(result, size - tmp.length, 0);
      return result;
    },
  });

export class Token extends DatastoreDocument<Token> {
  @AddressKey()
  address!: string;
  @Index()
  name!: string;
  @Index()
  symbol!: string;
  @BooleanIndex()
  lendable!: boolean;
  @BooleanIndex()
  proxy!: boolean;
  @BooleanIndex()
  shortable!: boolean;
  @BooleanIndex()
  tradable!: boolean;
  decimals!: number;
}

export class Pair extends DatastoreDocument<Pair> {
  @AddressKey()
  address!: string;
  @AddressIndex()
  lendable!: string;
  @AddressIndex()
  tradable!: string;
  @AddressIndex()
  proxy?: string;
  @BooleanIndex()
  short!: boolean;

  totalSupply!: string;

  queryUpper!: number;
  queryBottom!: number;

  @Index()
  updateAt!: number;

  async getPath(db: DatastoreConnection): Promise<{ path: string, tradableToken: Token | undefined }> {
    const repo = db.getRepository(Token)
    const lendableToken = await repo.get(this.lendable)
    const tradableToken = await repo.get(this.tradable)
    /* eslint no-undefined: "off" */
    const proxyToken = this.proxy ? await repo.get(this.proxy) : undefined
    const path = [lendableToken, proxyToken, tradableToken].map((token) => token?.symbol).filter(defined).join('/')

    return { path, tradableToken }
  }
}

export class Transfer extends DatastoreDocument<Transfer> {
}

export class Position extends DatastoreDocument<Position> {
  @HexKey(42)
  get id() {
    return Position.toId(this.short, this.pair, this.trader);
  }

  @AddressIndex()
  lendable!: string;
  @AddressIndex()
  tradable!: string;
  @AddressIndex()
  proxy?: string;
  @AddressIndex()
  trader!: string;
  @AddressIndex()
  pair!: string;
  @Index()
  updateAt!: number;
  @Index()
  appearAt!: number;

  lastUpdatedAt?: number;

  @BigNumberTransform()
  expirationDate?: BigNumber;
  @BigNumberTransform()
  stopLossPercentage?: BigNumber;
  @BigNumberTransform()
  takeProfitPercentage?: BigNumber;
  @BigNumberTransform()
  terminationReward?: BigNumber;

  @BigNumberIndex()
  @BigNumberTransform()
  amount!: BigNumber;
  @BigNumberIndex()
  @BigNumberTransform()
  value!: BigNumber;
  @BigNumberIndex()
  @BigNumberTransform()
  selfValue!: BigNumber;
  @BigNumberIndex()
  @BigNumberTransform()
  principalDebt!: BigNumber;
  @BigNumberIndex()
  @BigNumberTransform()
  currentDebt!: BigNumber;
  @BigNumberIndex()
  @BigNumberTransform()
  rate!: BigNumber;
  @BigNumberIndex()
  @BigNumberTransform()
  currentCost!: BigNumber;
  @BigNumberIndex()
  @BigNumberTransform()
  liquidationCost!: BigNumber;
  @BooleanIndex()
  short!: boolean;

  @Expose()
  @BigNumberIndex()
  @BigNumberTransform()
  get health() {
    return ray(
      this.currentCost.gt(this.liquidationCost)
        ? this.currentCost.sub(this.liquidationCost).div(this.currentCost)
        : bn(0)
    );
  }

  static toId(short: boolean, pair: string, trader: string) {
    pair = pair.startsWith("0x") ? pair.substr(2) : pair;
    trader = trader.startsWith("0x") ? trader.substr(2) : trader;
    const prefix = short ? "10" : '00'
    return [prefix, pair, trader].join("");
  }

  async getPath(db: DatastoreConnection): Promise<{ path: string, tradableToken: Token | undefined }> {
    const repo = db.getRepository(Token)
    const lendableToken = await repo.get(this.lendable)
    const tradableToken = await repo.get(this.tradable)
    /* eslint no-undefined: "off" */
    const proxyToken = this.proxy ? await repo.get(this.proxy) : undefined
    const path = [lendableToken, proxyToken, tradableToken].map((token) => token?.symbol).filter(defined).join('/')

    return { path, tradableToken }
  }

  static profitPercent(pos: Position): BigNumber {
    let profitValue: BigNumber;

    if (pos.short) {
      const diff = pos.currentCost.gt(pos.currentDebt) ? pos.currentCost.sub(pos.currentDebt) : bn(0)
      const debt = pos.amount.wadMul(amount(1).sub(diff.wadDiv(pos.currentCost)))
      profitValue = pos.amount.sub(debt).sub(pos.selfValue)
    } else {
      profitValue = pos.currentCost.sub(pos.currentDebt).sub(pos.selfValue)
    }

    // StopLoss and TakeProfit have 2 decimals (100.00)
    return profitValue.mul(10000).div(pos.selfValue).add(10000)
  }

  static isTerminable(pos: Position): boolean {
    if (pos.selfValue.isZero()) {
      return false
    }

    const stopLoss = pos.stopLossPercentage || bn(0)
    const takeProfit = pos.takeProfitPercentage || bn(0)

    const profit = Position.profitPercent(pos)

    if (stopLoss.gt(0)) {
      return profit.lte(stopLoss)
    } else if (takeProfit.gt(0)) {
      return profit.gte(takeProfit)
    }

    return false
  }
}

export class State extends DatastoreDocument<State> {
  @Key()
  id!: string;
}
