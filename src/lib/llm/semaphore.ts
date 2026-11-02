/** Minimal async semaphore: at most `limit` tasks run at once, the rest wait in FIFO order. */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
