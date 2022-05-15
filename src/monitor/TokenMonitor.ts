import { Diff, diff, DiffArray, DiffNew } from 'deep-diff'
import { map, Observable } from 'observable-fns'
import { fewRetry } from '../utils'
import { AbstractMonitor } from './AbstractMonitor'
import { HeightMonitor } from './HeightMonitor'
import { Token } from './models'
import { addGenericException } from '../sentry';

export class TokenMonitor extends AbstractMonitor<Token> {
  public lendables: string[] = []
  public tradables: string[] = []
  public proxies: string[] = []
  public shortables: string[] = []

  async run(): Promise<Observable<Token>> {
    this.context.getChannel(HeightMonitor).then((channel) =>
      channel
        .pipe(map(() => this.context.ctx.reserves.useAllLendables()))
        .subscribe((values) => {
          const difference = diff(this.lendables, values)
          if (difference) {
            this.lendables = values
            fewRetry(() => this.parseDifference(difference as any))
          }
        }),
    )
    this.context.getChannel(HeightMonitor).then((channel) =>
      channel
        .pipe(map(() => this.context.ctx.pairs.useAllTradables()))
        .subscribe((values) => {
          const difference = diff(this.tradables, values)
          if (difference) {
            this.tradables = values
            fewRetry(() => this.parseDifference(difference as any))
          }
        }),
    )

    this.context.getChannel(HeightMonitor).then((channel) =>
      channel
        .pipe(map(() => this.context.ctx.pairs.useAllProxies()))
        .subscribe((values) => {
          const difference = diff(this.proxies, values)
          if (difference) {
            this.proxies = values
            fewRetry(() => this.parseDifference(difference as any))
          }
        }),
    )

    this.context.getChannel(HeightMonitor).then((channel) =>
      channel
        .pipe(map(() => this.context.ctx.pairs.useAllShotables()))
        .subscribe((values) => {
          const difference = diff(this.shortables, values)
          if (difference) {
            this.shortables = values
            fewRetry(() => this.parseDifference(difference as any))
          }
        }),
    )

    return this.channel
  }

  private parseDifference(difference: Diff<string[], string>[]) {
    const repository = this.context.db.getRepository(Token)

    const newTokens: string[] = difference
      .filter((dif): dif is DiffArray<string[], string> => dif.kind === 'A')
      .map((difs) => difs.item)
      .filter((dif): dif is DiffNew<string> => dif.kind === 'N')
      .map((dif) => dif.rhs)

    return Promise.all(
      newTokens.map(async (address) => {
        const lendable = this.lendables.includes(address)
        const proxy = this.proxies.includes(address)
        const tradable = this.tradables.includes(address)
        const shortable = this.shortables.includes(address)

        let instance = await repository.get(address)
        if (
          !instance ||
          instance.lendable !== lendable ||
          instance.tradable !== tradable ||
          instance.proxy !== proxy ||
          instance.shortable !== shortable
        ) {
          instance = new Token()
          instance.lendable = lendable
          instance.proxy = proxy
          instance.tradable = tradable
          instance.shortable = shortable
          instance.address = address

          const contract = await this.context.ctx.tokens.useDetails(address)
          instance.name = contract.name
          instance.symbol = contract.symbol
          instance.decimals = contract.decimals

          await this.context.db.getRepository(Token).put(instance)
        }

        this.channel.next(instance)
      }),
    ).catch(addGenericException)
  }
}
