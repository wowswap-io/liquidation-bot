import { ethers } from 'ethers'
import { Observable } from 'observable-fns'
import { DatastoreRepository } from '../db/repository'
import { addBreadcrumb, addException } from '../sentry'
import { defined } from '../utils'
import { AbstractMonitor } from './AbstractMonitor'
import { HeightMonitor } from './HeightMonitor'
import { Pair, Token } from './models'
import { TokenMonitor } from './TokenMonitor'

export class PairMonitor extends AbstractMonitor<Pair> {
  private repository!: DatastoreRepository<Pair>
  private unfoundPairs: Array<{
    lendable: Token
    tradable: Token
    proxy?: Token
    short: boolean
  }> = []
  private lendables: Token[] = []
  private tradables: Token[] = []
  private proxies: Token[] = []
  private shortables: Token[] = []
  private processing = false

  async run(): Promise<Observable<Pair>> {
    this.repository = this.context.db.getRepository(Pair)
    ;(await this.context.getChannel(TokenMonitor)).subscribe((token) => {
      if (token.lendable) this.onNewLendable(token)
      if (token.proxy) this.onNewProxy(token)
      if (token.tradable) this.onNewTradable(token, false)
      if (token.shortable) this.onNewTradable(token, true)
    })
    ;(await this.context.getChannel(HeightMonitor)).subscribe(
      this.update.bind(this),
    )

    return this.channel
  }

  async onNewTradable(tradable: Token, short: boolean) {
    const map = short ? this.shortables : this.tradables
    if (map.some((known) => known.address === tradable.address)) {
      return
    }
    map.push(tradable)
    this.lendables
      .filter((lendable) => tradable.address !== lendable.address)
      .forEach((lendable) => {
        this.proxies
          .filter(
            (proxy) =>
              proxy.address !== tradable.address &&
              proxy.address !== lendable.address,
          )
          .forEach((proxy) =>
            this.unfoundPairs.push({ lendable, proxy, tradable, short }),
          )
        this.unfoundPairs.push({ lendable, tradable, short })
      })

    this.update()
  }

  onNewLendable(lendable: Token): void {
    if (this.lendables.some((known) => known.address === lendable.address)) {
      return
    }
    this.lendables.push(lendable)

    this.tradables
      .filter((tradable) => tradable.address !== lendable.address)
      .forEach((tradable) => {
        this.proxies
          .filter(
            (proxy) =>
              proxy.address !== lendable.address &&
              proxy.address !== tradable.address,
          )
          .forEach((proxy) =>
            this.unfoundPairs.push({ lendable, proxy, tradable, short: false }),
          )
        this.unfoundPairs.push({ lendable, tradable, short: false })
      })

    this.shortables
      .filter((tradable) => tradable.address !== lendable.address)
      .forEach((tradable) => {
        this.proxies
          .filter(
            (proxy) =>
              proxy.address !== lendable.address &&
              proxy.address !== tradable.address,
          )
          .forEach((proxy) =>
            this.unfoundPairs.push({ lendable, proxy, tradable, short: true }),
          )
        this.unfoundPairs.push({ lendable, tradable, short: true })
      })

    this.update()
  }

  onNewProxy(proxy: Token): void {
    if (this.proxies.some((known) => known.address === proxy.address)) {
      return
    }
    this.proxies.push(proxy)

    this.tradables
      .filter((tradable) => tradable.address !== proxy.address)
      .forEach((tradable) => {
        this.lendables
          .filter(
            (lendable) =>
              tradable.address !== lendable.address &&
              proxy.address !== lendable.address,
          )
          .forEach((lendable) =>
            this.unfoundPairs.push({ lendable, proxy, tradable, short: false }),
          )
      })

    this.shortables
      .filter((tradable) => tradable.address !== proxy.address)
      .forEach((tradable) => {
        this.lendables
          .filter(
            (lendable) =>
              tradable.address !== lendable.address &&
              proxy.address !== lendable.address,
          )
          .forEach((lendable) =>
            this.unfoundPairs.push({ lendable, proxy, tradable, short: true }),
          )
      })

    this.update()
  }

  async update() {
    if (this.processing) {
      return
    }

    try {
      this.processing = true
      const unfoundPairs = this.unfoundPairs.splice(0, this.unfoundPairs.length)

      const possiblePairParams = await Promise.all(
        unfoundPairs.map(({ lendable, tradable, proxy, short }) => {
          const method = short
            ? proxy
              ? 'getRoutableShortingPair'
              : 'getShortingPair'
            : proxy
            ? 'getRoutablePair'
            : 'getPair'
          const inputs = [
            lendable.address,
            proxy?.address,
            tradable.address,
          ].filter(defined) as [string, string] | [string, string, string]
          const factory = this.context.ctx.pairs.usePairFactory()

          return this.context.ctx.core
            .useCall(factory, method, ...inputs)
            .then((address) => ({ lendable, tradable, proxy, short, address }))
        }),
      )

      this.unfoundPairs.push(
        ...possiblePairParams
          .map((params, index) => ({ params, index }))
          .filter(
            ({ params }) => params.address === ethers.constants.AddressZero,
          )
          .map(({ index }) => unfoundPairs[index]),
      )

      const pairs = await Promise.all(
        possiblePairParams
          .filter(({ address }) => address.toLowerCase() !== ethers.constants.AddressZero)
          .map(async ({ lendable, tradable, proxy, address, short}) => {
            let instance = await this.repository.get(address)

            const path = [lendable, tradable, proxy]
              .map((t) => t?.symbol)
              .filter(defined)
              .join('/')

            if (
              !instance ||
              proxy?.address !== instance.proxy ||
              short !== instance.short
            ) {
              addBreadcrumb(
                'pair',
                address,
                `Create new ${
                  short ? 'short' : 'long'
                } pair ${address} ${path}`,
              )

              instance = new Pair()
              instance.address = address
              instance.lendable = lendable.address
              instance.tradable = tradable.address
              instance.proxy = proxy?.address
              instance.short = short
              instance.updateAt = 0
              instance.totalSupply = '0'
              instance.queryBottom = 0
              instance.queryUpper = 0

              await this.repository.put(instance)
            }
            return instance
          },
        ),
      )

      pairs.forEach(this.channel.next.bind(this.channel))
    } catch (e) {
      addException('-', '-', e)
    }

    this.processing = false
  }
}
