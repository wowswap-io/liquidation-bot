import { Wallet } from "ethers";
import express from "express";
import http from "http";
import { Observable } from "observable-fns";
import { DatastoreConnection } from "../db/connection";
import { connect } from "../db/datastore";
import { AbstractMonitor } from "./AbstractMonitor";
import { HeightMonitor } from "./HeightMonitor";
import { PairMonitor } from "./PairMonitor";
import { PositionMonitor } from "./PositionMonitor";
import { TokenMonitor } from "./TokenMonitor";
import { TotalValueMonitor } from "./ValueMonitor";
import { HealthMonitor } from "./HealthMonitor";
import { Context } from '@wowswap-io/evm-sdk';
import { initMetrics, Metrics } from '../utils/metrics';
import { sdkInit } from '../sdk';
import cors from 'cors';
import { healthEndpoint } from '../utils/health';
import cacheManager, { Cache } from 'cache-manager';


export type Ctor<T> = new (context: ExecutionContext) => T;

export type InitializeParams = Readonly<{
  startBlock: number;
  privateKey: string;
  sleepTime: number;
  transferEventsLimit: number;
  covalentApiKey: string;
  cacheTTL: number;
}>;

const monitors = [
  HeightMonitor,
  TokenMonitor,
  PairMonitor,
  PositionMonitor,
  TotalValueMonitor,
  HealthMonitor
] as const;

type InstanceType<T> = T extends Ctor<infer TInstance> ? TInstance : never;

type ChannelType<T> = T extends Ctor<AbstractMonitor<infer TChannel>>
  ? TChannel
  : never;

export class ExecutionContext implements InitializeParams {
  get startBlock() {
    return this.params.startBlock;
  }
  get privateKey(): string {
    return this.params.privateKey
  }
  get sleepTime(): number {
    return this.params.sleepTime
  }
  get transferEventsLimit(): number {
    return this.params.transferEventsLimit
  }
  get loopSleep(): number {
    return 250
  }
  get covalentApiKey(): string {
    return this.params.covalentApiKey
  }
  get cacheTTL(): number {
    return this.params.cacheTTL
  }

  monitors: {
    [key: number]: InstanceType<typeof monitors[typeof key]>;
  } = {};

  channels: {
    [key: number]: Promise<
      Observable<ChannelType<typeof monitors[typeof key]>>
    >;
  } = {};

  db!: DatastoreConnection;
  chainId!: number;

  ctx!: Context

  signer!: Wallet

  cache!: Cache

  metrics!: Metrics

  constructor(private params: InitializeParams) {}

  async run() {
    this.ctx = await sdkInit()
    this.chainId = await this.ctx.provider.getNetwork().then((network) => network.chainId)
    this.db = connect(`.snapshot/instance-${this.chainId}`)
    this.signer = new Wallet(this.privateKey, this.ctx.provider)
    this.cache = cacheManager.caching({ store: 'memory', ttl: this.cacheTTL })

    this.api();
    this.runMonitor(HeightMonitor);
    this.runMonitor(TokenMonitor);
    this.runMonitor(PairMonitor);
    this.runMonitor(PositionMonitor);
    this.runMonitor(TotalValueMonitor);
    this.runMonitor(HealthMonitor);
  }

  async api() {
    const app = express();
    const server = http.createServer(app);
    app.get("/", async (req, res, next) => {
      res.json({ result: "Hello" })
      next()
    });

    app.use(cors({ origin: '*' }))
    app.get('/health', healthEndpoint)

    this.metrics = initMetrics({ express: app, prefix: 'liquidation_bot', defaultLabels: { chainId: this.chainId.toString() } })

    server.listen(process.env.PORT, async () => {
      console.log("Server started");
    });
  }

  async runMonitor<T extends typeof monitors[number]>(ctor: T) {
    const index = monitors.findIndex((monitorCtor) => monitorCtor === ctor);
    if (index < 0) {
      throw new Error(`Monitor of ${ctor.name} not found`);
    }

    this.channels[index] = this.getMonitor(ctor).run() as Promise<
      Observable<ChannelType<T>>
    >;
  }

  getMonitor<T extends typeof monitors[number]>(ctor: T): InstanceType<T> {
    const index = monitors.findIndex((monitorCtor) => monitorCtor === ctor);

    if (index < 0) {
      throw new Error(`Monitor of ${ctor.name} not found`);
    }

    if (!this.monitors[index]) {
      this.monitors[index] = new ctor(this);
    }

    return this.monitors[index] as InstanceType<T>;
  }

  getChannel<T extends typeof monitors[number]>(
    ctor: T
  ): Promise<Observable<ChannelType<T>>> {
    const index = monitors.findIndex((monitorCtor) => monitorCtor === ctor);

    if (index < 0) {
      throw new Error(`Monitor of ${ctor.name} not found`);
    }

    const channel = this.channels[index];
    return channel as Promise<Observable<ChannelType<T>>>;
  }
}

export async function run(params: InitializeParams) {
  const context = new ExecutionContext(params);

  await context.run();
}
