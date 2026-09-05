import { Logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

export interface PoolStats {
  queued: number;
  active: number;
  totalCompleted: number;
  rateLimitHits: number;
  isPaused: boolean;
}

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  retries: number;
  priority: number;
  label?: string;
}

export class AIConnectionPool {
  private static instance: AIConnectionPool | null = null;

  private queue: QueuedTask<any>[] = [];
  private activeCount: number = 0;
  private maxConcurrency: number;
  private minIntervalMs: number;
  private maxRetries: number;
  private lastDispatchTime: number = 0;
  private isPaused: boolean = false;

  private stats: PoolStats = {
    queued: 0,
    active: 0,
    totalCompleted: 0,
    rateLimitHits: 0,
    isPaused: false,
  };

  constructor(options?: {
    maxConcurrency?: number;
    minIntervalMs?: number;
    maxRetries?: number;
  }) {
    this.maxConcurrency = options?.maxConcurrency ?? config.geminiMaxConcurrency ?? 2;
    this.minIntervalMs = options?.minIntervalMs ?? config.geminiRequestIntervalMs ?? 1200;
    this.maxRetries = options?.maxRetries ?? config.geminiMaxRetries ?? 3;
  }

  static getInstance(): AIConnectionPool {
    if (!this.instance) {
      this.instance = new AIConnectionPool();
    }
    return this.instance;
  }

  /**
   * Execute an async AI task through the rate-limited connection pool.
   */
  async execute<T>(fn: () => Promise<T>, priority: number = 0, label?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        retries: 0,
        priority,
        label,
      };

      if (priority > 0) {
        const insertIdx = this.queue.findIndex((t) => t.priority < priority);
        if (insertIdx === -1) {
          this.queue.push(task);
        } else {
          this.queue.splice(insertIdx, 0, task);
        }
      } else {
        this.queue.push(task);
      }

      this.stats.queued = this.queue.length;
      this.dispatch();
    });
  }

  private async dispatch(): Promise<void> {
    if (this.isPaused || this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    this.stats.active = this.activeCount;
    this.stats.queued = this.queue.length;

    const now = Date.now();
    const elapsed = now - this.lastDispatchTime;
    if (elapsed < this.minIntervalMs) {
      const waitMs = this.minIntervalMs - elapsed;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.lastDispatchTime = Date.now();

    (async () => {
      try {
        const result = await task.fn();
        this.stats.totalCompleted++;
        task.resolve(result);
      } catch (err: any) {
        if (this.isRateLimitError(err)) {
          this.stats.rateLimitHits++;

          if (this.isDailyQuotaExhausted(err)) {
            Logger.warn(
              `⚠ [AIConnectionPool] Daily free-tier quota limit reached for Gemini model. Bypassing wait to immediately use structured heuristic fallback.`
            );
            task.reject(err);
            return;
          }

          const delayMs = this.extractRetryDelayMs(err) || this.computeExponentialBackoff(task.retries);

          if (task.retries < this.maxRetries) {
            task.retries++;
            Logger.warn(
              `⏳ [AIConnectionPool] Rate limit (429) encountered${task.label ? ` for "${task.label}"` : ''}. Pausing connection pool for ${Math.ceil(delayMs / 1000)}s before retry (Attempt ${task.retries}/${this.maxRetries})...`
            );

            await this.pause(delayMs);

            this.queue.unshift(task);
            this.stats.queued = this.queue.length;
          } else {
            Logger.error(
              `❌ [AIConnectionPool] Max retries (${this.maxRetries}) exceeded on rate limit${task.label ? ` for "${task.label}"` : ''}.`
            );
            task.reject(err);
          }
        } else {
          task.reject(err);
        }
      } finally {
        this.activeCount--;
        this.stats.active = this.activeCount;
        this.stats.queued = this.queue.length;
        this.dispatch();
      }
    })();

    if (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      this.dispatch();
    }
  }

  private async pause(durationMs: number): Promise<void> {
    if (this.isPaused) {
      return;
    }

    this.isPaused = true;
    this.stats.isPaused = true;

    await new Promise((resolve) => setTimeout(resolve, durationMs));

    this.isPaused = false;
    this.stats.isPaused = false;
    Logger.info(`▶ [AIConnectionPool] Resuming pool operations.`);
  }

  private isDailyQuotaExhausted(err: any): boolean {
    const msg = (err?.message || '').toLowerCase();
    return (
      msg.includes('perday') ||
      msg.includes('per day') ||
      msg.includes('generaterequestsperday') ||
      msg.includes('generatecontentinputtokenspermodelperday')
    );
  }

  private isRateLimitError(err: any): boolean {
    const msg = (err?.message || '').toLowerCase();
    const status = err?.status || err?.code || '';
    return (
      status === 429 ||
      status === 'RESOURCE_EXHAUSTED' ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('quota exceeded') ||
      msg.includes('rate-limit') ||
      msg.includes('rate limit')
    );
  }

  private extractRetryDelayMs(err: any): number | null {
    const msg = err?.message || '';
    const secMatch =
      msg.match(/retry(?:Delay|"retryDelay")[:\s]*"?(\d+(?:\.\d+)?)\s*s/i) ||
      msg.match(/retry in (\d+(?:\.\d+)?)s/i);

    if (secMatch) {
      const sec = parseFloat(secMatch[1]);
      if (!isNaN(sec) && sec > 0) {
        return Math.ceil(sec * 1000) + 1000;
      }
    }
    return null;
  }

  private computeExponentialBackoff(attempt: number): number {
    const base = 2500;
    const jitter = Math.floor(Math.random() * 1000);
    return Math.pow(2, attempt) * base + jitter;
  }

  getStats(): PoolStats {
    return { ...this.stats };
  }

  reset(): void {
    this.queue = [];
    this.activeCount = 0;
    this.isPaused = false;
    this.stats = {
      queued: 0,
      active: 0,
      totalCompleted: 0,
      rateLimitHits: 0,
      isPaused: false,
    };
  }
}
