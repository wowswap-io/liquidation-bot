import { Counter, Gauge, collectDefaultMetrics, register } from 'prom-client'
import { Express, default as initExpress } from 'express'
import BigNumber from 'bignumber.js'
import cors from 'cors'
import { defined } from '@wowswap-io/evm-sdk'
import { healthEndpoint } from './health'

export class Metrics {
  private gauges: Map<string, Gauge<string>> = new Map()

  private counters: Map<string, Counter<string>> = new Map()

  private readonly prefix?: string

  private readonly defaultLabels: { [key: string]: string }

  constructor(options: { express: Express, prefix?: string, defaultLabels?: { [key: string]: string } }) {
    this.prefix = options.prefix
    this.defaultLabels = options.defaultLabels || {}

    if (typeof process.env.PROM_AUTH === 'undefined' || process.env.PROM_AUTH.trim().length === 0) {
      console.log('env.PROM_AUTH is blank, skipping prometheus initialization')
    }

    // These are the default buckets.
    collectDefaultMetrics({ gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5] })

    options.express.get('/metrics', async(req, res) => {
      if (req.header('Authorization') !== `Bearer ${process.env.PROM_AUTH}`) {
        this.increment('express_incorrect_auth')
        res.status(403).end('Unauthorized')
        return
      }

      try {
        res.set('Content-Type', register.contentType)
        res.end(await register.metrics())
      } catch (ex) {
        res.status(500).end(ex)
      }
    })
  }

  // Set one or multiple values of gauge
  update(name: string, values: { [key: string]: number } | number): void {
    const gauge = this.gauges.get(name) || new Gauge(this.createConf(name))
    this.gauges.set(name, gauge)

    if (typeof values === 'object') {
      Object.keys(values).forEach((key) => {
        gauge.set({ ...this.defaultLabels, type: key }, values[key])
      })
    } else {
      gauge.set(this.defaultLabels, values)
    }
  }

  // Set one or multiple values of gauge
  increment(name: string, values?: string[]): void {
    const counter = this.counters.get(name) || new Counter(this.createConf(name))
    this.counters.set(name, counter)

    if (typeof values === 'object') {
      values.forEach((key) => {
        counter.inc({ ...this.defaultLabels, type: key })
      })
    } else {
      counter.inc(this.defaultLabels)
    }
  }

  private createConf(name: string): { help: string, labelNames: string[], name: string } {
    return {
      help: '-',
      labelNames: ['type', ...Object.keys(this.defaultLabels)],
      name: [this.prefix, name].filter(defined).join('_')
    }
  }

  static format(thing: BigNumber, decimals: number | undefined = undefined): number {
    return parseFloat(thing.fromDecimals(decimals).toFixed(8))
  }
}

export function initMetrics(options: {
  express?: Express,
  prefix?: string,
  defaultLabels?: { [key: string]: string }
} = {}): Metrics {
  const server = options.express ? options.express : initExpress()

  // Define healthcheck and Start listen if server is ours
  if (!defined(options.express)) {
    server.use(initExpress.json())
    server.use(cors({ origin: '*' }))
    server.get('/', (req, res) => res.json({ result: 'Hello' }))
    server.get('/health', healthEndpoint)

    const port = process.env.PORT || 3000
    console.log(`Starting server on ${port}`)
    server.listen(port)
  }

  const updatedOptions = { ...options, express: server }
  return new Metrics(updatedOptions)
}
