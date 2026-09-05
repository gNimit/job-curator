import * as cheerio from 'cheerio';
import { JobBoard, JobListing, ScrapeOptions } from '../types/job.js';
import { config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { PlaywrightPool } from './playwright-pool.js';

export abstract class BaseScraper {
  abstract readonly board: JobBoard;

  /**
   * High-performance fetcher with automatic fallback to headless Playwright.
   */
  protected async fetchHtml(
    url: string,
    options: {
      headers?: Record<string, string>;
      waitForSelector?: string;
      forcePlaywright?: boolean;
    } = {}
  ): Promise<string> {
    if (options.forcePlaywright) {
      return PlaywrightPool.fetchHtmlViaBrowser(url, options.waitForSelector);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.scraperTimeoutMs);

      const res = await fetch(url, {
        headers: {
          'User-Agent': config.scraperUserAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 200) {
        return await res.text();
      }

      // If status indicates bot-protection / SPA rendering (403, 429, 503), fall back to Playwright
      Logger.warn(
        `[${this.board}] Direct HTTP returned status ${res.status}. Falling back to headless Playwright...`
      );
      return PlaywrightPool.fetchHtmlViaBrowser(url, options.waitForSelector);
    } catch (err: any) {
      Logger.warn(
        `[${this.board}] Direct HTTP error (${err.message}). Falling back to headless Playwright...`
      );
      return PlaywrightPool.fetchHtmlViaBrowser(url, options.waitForSelector);
    }
  }

  protected loadCheerio(html: string): cheerio.CheerioAPI {
    return cheerio.load(html);
  }

  abstract scrape(options: ScrapeOptions): Promise<JobListing[]>;
}
