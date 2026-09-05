import fs from 'fs';
import path from 'path';
import { JobBoard } from '../types/job.js';
import { config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

export type HealthStatus = 'HEALTHY' | 'TEMPORARILY_DISABLED' | 'PERMANENTLY_DISABLED';

export interface BoardFailure {
  timestamp: number;
  errorType: 'RATE_LIMIT' | 'TIMEOUT' | 'NETWORK' | 'BOT_BLOCKED' | 'NOT_FOUND' | 'FATAL';
  message: string;
  statusCode?: number;
}

export interface BoardHealth {
  board: JobBoard;
  status: HealthStatus;
  consecutiveFailures: number;
  totalFailures: number;
  lastFailureTime?: number;
  disabledUntil?: number; // timestamp when temporary cooldown expires
  disableReason?: string;
  failures: BoardFailure[];
}

export class ScraperFailureManager {
  private static healthFile = path.join(config.profilesDir, '.scraper-health.json');
  private static healthMap: Map<JobBoard, BoardHealth> = new Map();
  private static readonly WINDOW_MS = 5 * 60 * 1000; // 5 minutes sliding window
  private static readonly TEMP_DISABLE_DURATION_MS = 10 * 60 * 1000; // 10 minutes cooldown
  private static readonly TEMP_FAILURE_THRESHOLD = 3; // 3 failures in window -> temporary disable
  private static readonly PERM_FAILURE_THRESHOLD = 6; // 6 failures or fatal error -> permanent disable

  static {
    this.loadState();
  }

  private static getInitialHealth(board: JobBoard): BoardHealth {
    return {
      board,
      status: 'HEALTHY',
      consecutiveFailures: 0,
      totalFailures: 0,
      failures: [],
    };
  }

  private static loadState(): void {
    try {
      if (fs.existsSync(this.healthFile)) {
        const raw = fs.readFileSync(this.healthFile, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const [board, health] of Object.entries(parsed)) {
          this.healthMap.set(board as JobBoard, health as BoardHealth);
        }
      }
    } catch {
      // ignore state loading errors
    }
  }

  private static saveState(): void {
    try {
      const dir = path.dirname(this.healthFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj: Record<string, BoardHealth> = {};
      this.healthMap.forEach((v, k) => {
        obj[k] = v;
      });
      fs.writeFileSync(this.healthFile, JSON.stringify(obj, null, 2), 'utf-8');
    } catch {
      // ignore state saving errors
    }
  }

  /**
   * Check if a board is eligible to be scraped.
   */
  static canScrape(board: JobBoard): {
    allowed: boolean;
    status: HealthStatus;
    reason?: string;
    retryAfterMinutes?: number;
  } {
    const health = this.healthMap.get(board) || this.getInitialHealth(board);
    const now = Date.now();

    // Check if temporary disable has expired
    if (health.status === 'TEMPORARILY_DISABLED') {
      if (health.disabledUntil && now >= health.disabledUntil) {
        health.status = 'HEALTHY';
        health.disabledUntil = undefined;
        health.disableReason = undefined;
        health.consecutiveFailures = 0;
        this.healthMap.set(board, health);
        this.saveState();
        Logger.info(`[${board}] Cooldown period expired. Circuit breaker reset to HEALTHY.`);
        return { allowed: true, status: 'HEALTHY' };
      }

      const remainingMs = (health.disabledUntil || now) - now;
      const retryAfterMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
      return {
        allowed: false,
        status: 'TEMPORARILY_DISABLED',
        reason: health.disableReason || 'Rate limit or temporary error cooldown',
        retryAfterMinutes,
      };
    }

    if (health.status === 'PERMANENTLY_DISABLED') {
      return {
        allowed: false,
        status: 'PERMANENTLY_DISABLED',
        reason: health.disableReason || 'Persistent unrecoverable errors',
      };
    }

    return { allowed: true, status: 'HEALTHY' };
  }

  /**
   * Record a successful scrape to reset failure counters.
   */
  static recordSuccess(board: JobBoard): void {
    const health = this.healthMap.get(board) || this.getInitialHealth(board);
    health.consecutiveFailures = 0;
    health.status = 'HEALTHY';
    health.disabledUntil = undefined;
    health.disableReason = undefined;
    this.healthMap.set(board, health);
    this.saveState();
  }

  /**
   * Record a failure and evaluate whether to temporarily or permanently disable the source.
   */
  static recordFailure(
    board: JobBoard,
    error: any,
    statusCode?: number
  ): {
    newStatus: HealthStatus;
    actionTaken: string;
  } {
    const health = this.healthMap.get(board) || this.getInitialHealth(board);
    const now = Date.now();
    const errMsg = String(error?.message || error || 'Unknown error');

    // Categorize error
    let errorType: BoardFailure['errorType'] = 'NETWORK';
    let isPermanentFatal = false;

    if (statusCode === 429 || errMsg.toLowerCase().includes('rate limit')) {
      errorType = 'RATE_LIMIT';
    } else if (statusCode === 403 || errMsg.toLowerCase().includes('cloudflare') || errMsg.toLowerCase().includes('bot')) {
      errorType = 'BOT_BLOCKED';
    } else if (statusCode === 404 || statusCode === 410) {
      errorType = 'NOT_FOUND';
      isPermanentFatal = true;
    } else if (errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('abort')) {
      errorType = 'TIMEOUT';
    } else if (errMsg.toLowerCase().includes('enotfound') || errMsg.toLowerCase().includes('dns')) {
      errorType = 'FATAL';
      isPermanentFatal = true;
    }

    const failure: BoardFailure = {
      timestamp: now,
      errorType,
      message: errMsg,
      statusCode,
    };

    // Filter failures within sliding window
    health.failures = health.failures
      .filter((f) => now - f.timestamp <= this.WINDOW_MS)
      .concat(failure);

    health.consecutiveFailures += 1;
    health.totalFailures += 1;
    health.lastFailureTime = now;

    let actionTaken = 'Failure logged';

    // 1. Check for immediate permanent failure
    if (isPermanentFatal || health.consecutiveFailures >= this.PERM_FAILURE_THRESHOLD) {
      health.status = 'PERMANENTLY_DISABLED';
      health.disableReason = `Permanent failure: ${errorType} (${errMsg.slice(0, 100)})`;
      actionTaken = `Source permanently disabled: ${health.disableReason}`;
      Logger.error(`[${board}] ${actionTaken}`);
    }
    // 2. Check for temporary failure threshold in window
    else if (health.failures.length >= this.TEMP_FAILURE_THRESHOLD) {
      health.status = 'TEMPORARILY_DISABLED';
      health.disabledUntil = now + this.TEMP_DISABLE_DURATION_MS;
      health.disableReason = `High failure rate: ${health.failures.length} errors in 5m (${errorType})`;
      actionTaken = `Source temporarily disabled for 10m (until ${new Date(health.disabledUntil).toLocaleTimeString()}): ${health.disableReason}`;
      Logger.warn(`[${board}] ${actionTaken}`);
    }

    this.healthMap.set(board, health);
    this.saveState();

    return {
      newStatus: health.status,
      actionTaken,
    };
  }

  /**
   * Reset health status for a specific board or all boards.
   */
  static reset(board?: JobBoard): void {
    if (board) {
      this.healthMap.set(board, this.getInitialHealth(board));
    } else {
      this.healthMap.clear();
    }
    this.saveState();
    Logger.success(board ? `Circuit breaker for [${board}] reset to HEALTHY.` : 'All scraper circuit breakers reset to HEALTHY.');
  }

  /**
   * Get current health status report for all boards.
   */
  static getHealthReport(): Record<JobBoard, BoardHealth> {
    const defaultBoards: JobBoard[] = ['web3.career', 'foorilla.com', 'cryptojobslist.com'];
    const report: any = {};
    for (const b of defaultBoards) {
      report[b] = this.healthMap.get(b) || this.getInitialHealth(b);
    }
    return report;
  }
}
