import { Request, Response } from 'express'
import { Metrics } from './metrics'
import { defined } from '@wowswap-io/evm-sdk'

let lastUpdated = Date.now()
const healthTimeout = (process.env.HEALTH_TIMEOUT ? parseInt(process.env.HEALTH_TIMEOUT, 10) : 120) * 1_000

export function healthEndpoint(req: Request, res: Response): void {
  // Fail if last updated earlier than healthTimeout seconds ago
  res.status(Date.now() - lastUpdated < healthTimeout ? 200 : 500).end()
}

export function healthUpdate(metrics?: Metrics): void {
  lastUpdated = Date.now()

  if (defined(metrics)) {
    metrics.update('last_updated_at', Number(lastUpdated))
  }
}
