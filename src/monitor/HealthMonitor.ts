import { Observable } from 'observable-fns'
import { DatastoreRepository } from '../db/repository'
import { defined, sleep } from '../utils'
import { AbstractMonitor } from './AbstractMonitor'
import { Pair, Position, Token } from './models'
import { amount, bn } from '../math'
import { HeightMonitor } from './HeightMonitor'
import { addBreadcrumb } from '../sentry';
import { Metrics } from '../utils/metrics';

export class HealthMonitor extends AbstractMonitor<boolean> {
  private positions!: DatastoreRepository<Position>
  private pairs!: DatastoreRepository<Pair>
  private tokens!: DatastoreRepository<Token>

  async run(): Promise<Observable<boolean>> {
    this.positions = this.context.db.getRepository(Position)
    this.pairs = this.context.db.getRepository(Pair)
    this.tokens = this.context.db.getRepository(Token)
    ;(await this.context.getChannel(HeightMonitor)).subscribe((height) => {
      this.lastHeight = height
    })

    this.checkPairs()
    this.checkPositions()
    return this.channel
  }

  private async checkPairs() {
    const height = this.lastHeight
    await sleep(this.context.loopSleep)

    let pairs = await this.pairs.all()
    let positions = await this.positions.all()
    const pairsWithTokens = await Promise.all(
      pairs.map(async (pair) => ({
        ...pair,
        lendable: await this.tokens.get(pair.lendable),
        tradable: await this.tokens.get(pair.tradable),
        proxy: pair.proxy ? await this.tokens.get(pair.proxy) : undefined,
      })),
    )

    const pairsWithPaths = await Promise.all(
      pairsWithTokens.map((pair) => ({
        ...pair,
        path: [pair.lendable?.symbol, pair.proxy?.symbol, pair.tradable?.symbol]
          .filter(defined)
          .join('/'),
      })),
    )

    // let pairsWithTotals = await Promise.all(
    //   pairsWithPaths.map(async (pair) => ({
    //     ...pair,
    //     total: await this.context.ctx.core.useCall(
    //       this.context.ctx.core.useContract(protocol.Pair__factory, pair.address),
    //       'totalSupply'
    //     ).then(toBN),
    //   })),
    // )

    let pairsWithPositions = await Promise.all(
      pairsWithPaths.map(async (pair) => ({
        ...pair,
        positions: positions.filter((p) => p.pair === pair.address),
      })),
    )

    const pairWithPositionsTotal = await Promise.all(
      pairsWithPositions.map(async (pair) => ({
        ...pair,
        positionTotal: pair.positions.reduce(
          (total, position) => total.add(position.amount),
          bn(0),
        ),
      })),
    )

    pairWithPositionsTotal
      .sort((p1, p2) => p1.totalSupply === p2.totalSupply
        ? p1.path.localeCompare(p2.path)
        : bn(p1.totalSupply).comparedTo(bn(p2.totalSupply)))
      .forEach((pair) => {
        addBreadcrumb(
          'pair',
          pair.address,
          `${pair.short ? 'SHORT' : 'LONG '} ${pair.path} totalSupply: ${bn(pair.totalSupply).human(
            pair.lendable?.decimals,
          )} totalPositions: ${pair.positionTotal.human(
            pair.lendable?.decimals,
          )} queryBottom: ${pair.queryBottom}`,
        )

        this.context.metrics.update('pair_total_supply', { [pair.path]: Metrics.format(bn(pair.totalSupply)) })
        this.context.metrics.update('pair_positions_count', {
          [pair.path]: positions.filter((p) => p.pair === pair.address).length
        })
      })

    //
    // Pair.QueryBottom
    //

    const notSyncedPairs = pairWithPositionsTotal.map(({ queryBottom, totalSupply, positionTotal  }) => {
      if (bn(totalSupply).eq(positionTotal)) {
        return 0
      } else {
        return queryBottom - this.context.startBlock
      }
    }).filter((n) => n > 0)
    const queryBottom = Math.min(...notSyncedPairs)

    this.context.metrics.update('pairs_not_synced_count', notSyncedPairs.length)

    if (notSyncedPairs.length === 0) {
      this.context.metrics.update('pairs_query_bottom', 0)
    } else {
      console.log(`HealthMonitor: lowest queryBottom: ${queryBottom}`)
      this.context.metrics.update('pairs_query_bottom', queryBottom)
    }

    while (height === this.lastHeight) {
      await sleep(this.context.loopSleep)
    }

    await this.checkPairs()
  }

  private async checkPositions() {
    const height = this.lastHeight
    await sleep(this.context.loopSleep)

    let positions = await this.positions.all()
    positions = positions.filter((p) => p.amount.gt(amount(0)))

    positions.forEach((pos) => {
      this.context.metrics.update('pos_health', { [[pos.pair, pos.trader].join('_').toLowerCase()]: pos.health.eq(0) ? -1 : Metrics.format(pos.health) / 10_000_000 })
      this.context.metrics.update('positions_profit_percent', { [[pos.pair, pos.trader].join('_').toLowerCase()]: Metrics.format(Position.profitPercent(pos), 2) })
    })

    let expired_positions = positions.filter(
      (p) => p.lastUpdatedAt! < Date.now() - 600_000,
    ) // Positions updated earlier than 10 minutes ago
    let not_updated_positions = positions.filter(
      (p) => p.lastUpdatedAt === undefined,
    ) // Positions that were never updated

    this.context.metrics.update('positions_health', {
      expired: expired_positions.length, not_updated: not_updated_positions.length })

    let formatted = await Promise.all(
      expired_positions
        .concat(not_updated_positions)
        .map((p) => this.formatPosition(p)),
    )
    formatted.forEach((pos) => console.log(`HealthMonitor: ${pos}`))

    while (height === this.lastHeight) {
      await sleep(this.context.loopSleep)
    }

    await this.checkPositions()
  }

  private async formatPosition(position: Position) {
    const { path } = await position.getPath(this.context.db)

    return `${
      position.lastUpdatedAt === undefined ? 'never updated' : 'expired'
    } position ${path} ${position.trader}`
  }
}
