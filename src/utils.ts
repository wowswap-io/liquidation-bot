import { getAddress } from '@ethersproject/address'

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const mapAll = <TIn, TOut>(func: (el: TIn) => TOut) => (
  collection: TIn[],
) => collection.map(func)

export const byteToAddress = (bytes: string) =>
  getAddress('0x' + bytes.slice(26))

export const defined = <T>(something: T | undefined): something is T =>
  typeof something !== 'undefined'

export const flatten = <TElement>(collection: Array<Array<TElement>>) =>
  collection.reduce((accumulator, value) => accumulator.concat(value), [])

export const logError = (msg: string) => <TError>(e: TError) => {
  console.error(msg, '\n', e)
  throw e
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitRandom(min: number, max: number): Promise<void> {
  return wait(min + Math.round(Math.random() * Math.max(0, max - min)))
}

/**
 * This error is thrown if the function is cancelled before completing
 */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
  }
}

/**
 * Throw this error if the function should retry
 */
export class RetryableError extends Error {}

/**
 * Retries the function that returns the promise until the promise successfully resolves up to n retries
 * @param fn function to retry
 * @param n how many times to retry
 * @param minWait min wait between retries in ms
 * @param maxWait max wait between retries in ms
 */
export function retry<T>(
  fn: () => Promise<T>,
  { n, minWait, maxWait }: { n: number; minWait: number; maxWait: number },
): { promise: Promise<T>; cancel: () => void } {
  let completed = false
  let rejectCancelled: (error: Error) => void
  const promise = new Promise<T>(async (resolve, reject) => {
    rejectCancelled = reject
    while (true) {
      let result: T
      try {
        result = await fn()
        if (!completed) {
          resolve(result)
          completed = true
        }
        break
      } catch (error) {
        if (completed) {
          break
        }
        if (n <= 0) {
          reject(error)
          completed = true
          break
        }
        n--
      }
      await waitRandom(minWait, maxWait)
    }
  })
  return {
    promise,
    cancel: () => {
      if (completed) return
      completed = true
      rejectCancelled(new CancelledError())
    },
  }
}

export function isMineRoutine(id: number, instances: number, taskId: number) {
  return taskId % instances === id
}

export function infRetry<T>(fn: () => Promise<T>): Promise<T> {
  return retry(fn, { n: Infinity, minWait: 250, maxWait: 250 }).promise
}

export function fewRetry<T>(fn: () => Promise<T>): Promise<T> {
  return retry(fn, { n: 3, minWait: 250, maxWait: 250 }).promise
}

export function withTimeout<T>(
  timeoutMs: number,
  promise: () => Promise<T>,
  onTimeout: () => void = () => null,
) {
  let timeoutHandle: NodeJS.Timeout
  const timeoutPromise = new Promise((resolve, _reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout()
      resolve(null)
    }, timeoutMs)
  })

  return Promise.race([
    promise()
      .then((result) => ({ error: false, result }))
      .catch((e) => ({ error: e, result: undefined })),
    timeoutPromise.then(() => ({
      error: new Error('timeouted'),
      result: undefined,
    })),
  ]).then(({ error, result }) => {
    clearTimeout(timeoutHandle)
    if (error) {
      throw error
    }
    if (!result) {
      throw new Error('no result')
    }

    return result
  })
}
