import { describe, it, expect, beforeEach } from 'vitest';
import { ScraperFailureManager } from '../src/scrapers/failure-manager.js';

describe('ScraperFailureManager', () => {
  beforeEach(() => {
    ScraperFailureManager.reset();
  });

  it('should initialize all boards as HEALTHY', () => {
    const report = ScraperFailureManager.getHealthReport();
    expect(report['web3.career'].status).toBe('HEALTHY');
    expect(report['foorilla.com'].status).toBe('HEALTHY');
    expect(report['cryptojobslist.com'].status).toBe('HEALTHY');

    const canScrape = ScraperFailureManager.canScrape('web3.career');
    expect(canScrape.allowed).toBe(true);
  });

  it('should temporarily disable a board when rate limited repeatedly in a short window', () => {
    // 3 rate limits in a row
    ScraperFailureManager.recordFailure('web3.career', new Error('Too Many Requests'), 429);
    ScraperFailureManager.recordFailure('web3.career', new Error('Rate limit exceeded'), 429);
    const res = ScraperFailureManager.recordFailure('web3.career', new Error('429 Too Many Requests'), 429);

    expect(res.newStatus).toBe('TEMPORARILY_DISABLED');

    const check = ScraperFailureManager.canScrape('web3.career');
    expect(check.allowed).toBe(false);
    expect(check.status).toBe('TEMPORARILY_DISABLED');
    expect(check.retryAfterMinutes).toBeGreaterThan(0);
  });

  it('should permanently disable a board on fatal unrecoverable errors (410 Gone / 404)', () => {
    const res = ScraperFailureManager.recordFailure('foorilla.com', new Error('Endpoint Gone permanently'), 410);

    expect(res.newStatus).toBe('PERMANENTLY_DISABLED');

    const check = ScraperFailureManager.canScrape('foorilla.com');
    expect(check.allowed).toBe(false);
    expect(check.status).toBe('PERMANENTLY_DISABLED');
    expect(check.reason).toContain('Permanent failure');
  });

  it('should reset health status to HEALTHY when reset is called', () => {
    ScraperFailureManager.recordFailure('cryptojobslist.com', new Error('Permanent fail'), 410);
    expect(ScraperFailureManager.canScrape('cryptojobslist.com').allowed).toBe(false);

    ScraperFailureManager.reset('cryptojobslist.com');
    expect(ScraperFailureManager.canScrape('cryptojobslist.com').allowed).toBe(true);
    expect(ScraperFailureManager.getHealthReport()['cryptojobslist.com'].status).toBe('HEALTHY');
  });
});
