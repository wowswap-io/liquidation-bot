import { Observable, Subject } from "observable-fns";
import { ExecutionContext } from ".";
import { addException } from '../sentry';
import { sleep } from '@wowswap-io/evm-sdk';

export abstract class AbstractMonitor<T> {
  constructor(protected context: ExecutionContext) {}
  protected channel: Subject<T> = new Subject<T>();
  abstract run(): Promise<Observable<T>>;

  protected lastHeight: number = 0;

  async launchLoop(fn: (height: number) => Promise<void>): Promise<void> {
    /* eslint no-constant-condition: "off" */
    while (true) {
      const height = this.lastHeight

      if (height) {
        await fn(height).
        then(() => {
          this.context.metrics.increment('runs', ['success'])
        }).
        catch((err) => {
          addException('-', '-', err)
          this.context.metrics.increment('runs', ['error'])
        })
      }

      while (this.lastHeight <= height) {
        await sleep(500)
      }
    }
  }
}
