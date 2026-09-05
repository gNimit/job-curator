import { Browser, chromium } from 'playwright';
import { Logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

export class PlaywrightPool {
  private static browser: Browser | null = null;
  private static isLaunching = false;

  static async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      if (this.isLaunching) {
        // Wait briefly if already launching
        await new Promise((resolve) => setTimeout(resolve, 500));
        return this.getBrowser();
      }
      this.isLaunching = true;
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
      } catch (err: any) {
        this.isLaunching = false;
        throw new Error(`Failed to launch headless Playwright browser: ${err.message}`);
      }
      this.isLaunching = false;
    }
    return this.browser;
  }

  static async fetchHtmlViaBrowser(url: string, waitForSelector?: string): Promise<string> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: config.scraperUserAgent,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.scraperTimeoutMs * 2,
      });

      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, { timeout: 5000 });
        } catch {
          // Continue if selector timeout occurs
        }
      }

      // Small delay for dynamic hydration
      await page.waitForTimeout(1000);
      const content = await page.content();
      return content;
    } finally {
      await page.close();
      await context.close();
    }
  }

  static async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
    }
  }
}
