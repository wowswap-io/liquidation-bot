import { Context } from '@wowswap-io/evm-sdk'
import { JsonRpcProvider, WebSocketProvider } from '@ethersproject/providers'
import YAML from 'yaml'
import { promises as fs } from 'fs'
import path from 'path'

function providerFor(config: { provider: { url: string } }): JsonRpcProvider | WebSocketProvider {
  const providerUrl = process.env.PROVIDER_URL || config.provider.url

  if (providerUrl.startsWith('ws')) {
    return new WebSocketProvider(providerUrl)
  }

  return new JsonRpcProvider(providerUrl)
}

export async function sdkInit(): Promise<Context> {
  const chainId = process.env.CHAIN_ID || '56'
  const configFile = path.resolve(__dirname, `../.deploy/${chainId}.yml`)
  await fs.stat(configFile)
  const config = YAML.parse(await fs.readFile(configFile, { encoding: 'utf8' }))

  const provider = providerFor(config)
  const ctx = new Context(provider, config)

  // Send updates until process is terminated
  setInterval(() => ctx.core.sender.update(), 100)

  const { xWOW, WOWLPAddress, usd, native } = config.contracts as Record<string, string>

  if (!usd) {
    throw new Error('Ensure usd configuration in config yaml')
  }
  if (!native) {
    throw new Error('Ensure native configuration in config yaml')
  }
  if (!xWOW) {
    throw new Error('Ensure xWOW configuration in config yaml')
  }
  if (!WOWLPAddress) {
    throw new Error('Ensure WOWLPAddress configuration in config yaml')
  }

  return ctx
}
