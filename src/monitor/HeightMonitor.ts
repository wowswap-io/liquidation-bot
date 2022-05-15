import { AbstractMonitor } from './AbstractMonitor'
import { Block } from '@ethersproject/abstract-provider'
import { Observable } from 'observable-fns'
import { infRetry } from '../utils'
import { addException } from '../sentry';

export class HeightMonitor extends AbstractMonitor<number> {
  public latest: number = 0

  private lastUpdatedAt: number = 0

  private onHeight(block: Block) {
    // Update current block(and update all other monitors) only if this.context.sleepTime ms passed from last update
    if (this.latest < block.number && (Number(new Date()) - this.lastUpdatedAt) > this.context.sleepTime) {
      this.context.metrics.update('current_block', block.number)

      this.channel.next(block.number)
      this.latest = block.number
      this.lastUpdatedAt = Number(new Date())
    }
  }

  private async updateBlock() {
    await infRetry(() =>
      this.context.ctx.provider.
      getBlock('latest').
      then(this.onHeight.bind(this)).
      catch((err) => addException('-', '-', err)))
  }

  async run(): Promise<Observable<number>> {
    await this.updateBlock()
    this.context.ctx.provider.on('block', this.updateBlock.bind(this))

    return this.channel
  }
}
