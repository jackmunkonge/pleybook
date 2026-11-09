/** Token bucket: `capacity` burst, refilled continuously at `refillPerSec`. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private refillPerSec: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec);
    this.last = t;
  }

  /** Wait until a token is available, then take it. */
  async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await this.sleep(Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000));
    }
  }
}

const buckets = new Map<string, TokenBucket>();

/** One shared bucket per provider name (per process), sized below each free tier's RPM. */
export function limiterFor(name: string, rpm: number): TokenBucket {
  let b = buckets.get(name);
  if (!b) buckets.set(name, (b = new TokenBucket(1, rpm / 60)));
  return b;
}
