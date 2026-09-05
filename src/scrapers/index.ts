import { CandidatePersona } from '../types/profile.js';
import { JobBoard, JobListing, ScrapeOptions } from '../types/job.js';
import { Web3CareerScraper } from './web3-career.js';
import { FoorillaScraper } from './foorilla.js';
import { CryptoJobsListScraper } from './cryptojobslist.js';
import { PlaywrightPool } from './playwright-pool.js';
import { Logger } from '../utils/logger.js';

import { ScraperFailureManager } from './failure-manager.js';

export interface DynamicScrapeConfig {
  boards?: JobBoard[];
  limitPerBoard?: number;
  usePlaywright?: boolean;
  ignoreDisabled?: boolean;
}

export class ScraperOrchestrator {
  /**
   * Dynamically build search keywords from candidate profile persona.
   */
  static deriveQueriesFromProfile(persona: CandidatePersona): {
    keywords: string[];
    roles: string[];
    remoteOnly: boolean;
  } {
    const roles = persona.hardConstraints.targetRoles || [];
    const topSkills = (persona.technicalSkills || []).slice(0, 5);

    // Extract core role terms (e.g. "Senior Rust Engineer" -> ["rust", "engineer"])
    const keywordSet = new Set<string>();
    for (const skill of topSkills) {
      keywordSet.add(skill.toLowerCase());
    }

    for (const role of roles) {
      const parts = role.toLowerCase().split(/\s+/);
      for (const p of parts) {
        if (p.length > 3 && !['senior', 'junior', 'staff', 'principal', 'lead'].includes(p)) {
          keywordSet.add(p);
        }
      }
    }

    const remoteOnly =
      persona.hardConstraints.workArrangements.length === 1 &&
      persona.hardConstraints.workArrangements[0] === 'remote';

    return {
      keywords: Array.from(keywordSet),
      roles,
      remoteOnly,
    };
  }

  /**
   * Execute dynamic scraping across all targeted boards with circuit breaker protection.
   */
  static async scrapeForProfile(
    persona: CandidatePersona,
    options: DynamicScrapeConfig = {}
  ): Promise<JobListing[]> {
    const { keywords, roles, remoteOnly } = this.deriveQueriesFromProfile(persona);

    const targetBoards = options.boards || [
      'web3.career',
      'foorilla.com',
      'cryptojobslist.com',
    ];

    const limit = options.limitPerBoard || 20;

    Logger.info(
      `Dynamic scraper initialized for candidate: ${persona.fullName} (${persona.headline})`
    );
    Logger.info(`Target roles: ${roles.join(', ')}`);
    Logger.info(`Derived dynamic keywords: ${keywords.slice(0, 6).join(', ')}`);

    const scrapers = [];
    if (targetBoards.includes('web3.career')) scrapers.push(new Web3CareerScraper());
    if (targetBoards.includes('foorilla.com')) scrapers.push(new FoorillaScraper());
    if (targetBoards.includes('cryptojobslist.com')) scrapers.push(new CryptoJobsListScraper());

    // Filter scrapers based on circuit breaker failure status
    const eligibleScrapers = scrapers.filter((scraper) => {
      if (options.ignoreDisabled) return true;

      const check = ScraperFailureManager.canScrape(scraper.board);
      if (!check.allowed) {
        if (check.status === 'TEMPORARILY_DISABLED') {
          Logger.warn(
            `[${scraper.board}] Circuit breaker ACTIVE: Temporarily disabled (retry in ~${check.retryAfterMinutes}m). Reason: ${check.reason}. Skipping.`
          );
        } else if (check.status === 'PERMANENTLY_DISABLED') {
          Logger.error(
            `[${scraper.board}] Circuit breaker ACTIVE: Permanently disabled. Reason: ${check.reason}. Skipping (use --reset-health to re-enable).`
          );
        }
        return false;
      }
      return true;
    });

    if (eligibleScrapers.length === 0) {
      Logger.warn('All target job boards are currently disabled by circuit breaker. Use --reset-health to clear failure states.');
      return [];
    }

    const scrapeOptions: ScrapeOptions = {
      keywords,
      roles,
      remoteOnly,
      limit,
      usePlaywright: options.usePlaywright,
    };

    const results = await Promise.allSettled(
      eligibleScrapers.map(async (scraper) => {
        try {
          Logger.info(`Scraping active listings from [${scraper.board}]...`);
          const jobs = await scraper.scrape(scrapeOptions);
          if (jobs.length > 0) {
            ScraperFailureManager.recordSuccess(scraper.board);
            Logger.success(`Retrieved ${jobs.length} jobs from [${scraper.board}]`);
          } else {
            Logger.warn(`[${scraper.board}] 0 listings returned for search criteria.`);
          }
          return jobs;
        } catch (err: any) {
          ScraperFailureManager.recordFailure(scraper.board, err);
          throw err;
        }
      })
    );

    const combined: JobListing[] = [];
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const scraper = eligibleScrapers[i];
      if (res.status === 'fulfilled') {
        combined.push(...res.value);
      } else {
        Logger.warn(`[${scraper.board}] Scraper error: ${res.reason?.message}`);
      }
    }

    // Cleanup browser if opened
    await PlaywrightPool.close();

    // Deduplicate by URL and normalized title+company
    const seen = new Set<string>();
    const deduplicated: JobListing[] = [];

    for (const job of combined) {
      const key = `${job.title.toLowerCase().replace(/[^a-z0-9]/g, '')}-${job.company.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      if (!seen.has(job.url) && !seen.has(key)) {
        seen.add(job.url);
        seen.add(key);
        deduplicated.push(job);
      }
    }

    Logger.success(
      `Scraping complete: ${deduplicated.length} unique active listings ready for evaluation.`
    );
    return deduplicated;
  }
}
