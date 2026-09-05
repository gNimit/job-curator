import { BaseScraper } from './base.js';
import { JobBoard, JobListing, ScrapeOptions } from '../types/job.js';
import { Logger } from '../utils/logger.js';

export class Web3CareerScraper extends BaseScraper {
  readonly board: JobBoard = 'web3.career';

  async scrape(options: ScrapeOptions): Promise<JobListing[]> {
    const limit = options.limit || 25;
    const keywords = (options.keywords && options.keywords.length > 0)
      ? options.keywords
      : ['developer', 'engineer', 'remote'];

    const jobs: JobListing[] = [];
    const seenUrls = new Set<string>();

    // Dynamic search per keyword
    for (const query of keywords.slice(0, 3)) {
      if (jobs.length >= limit) break;

      const searchUrl = `https://web3.career/?search=${encodeURIComponent(query)}`;
      try {
        const html = await this.fetchHtml(searchUrl, {
          forcePlaywright: options.usePlaywright,
          waitForSelector: 'tr.table_row, tr[data-jobid]',
        });

        const $ = this.loadCheerio(html);

        $('tr.table_row, tr[data-jobid]').each((_, el) => {
          if (jobs.length >= limit) return;

          const row = $(el);
          const onclick = row.attr('onclick') || '';
          const pathMatch = onclick.match(/'(\/[^']+)'/);
          const path = pathMatch ? pathMatch[1] : '';

          const title = row
            .find('h2, h3, a.text-dark, .job-title-mobile')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim();

          const company = row
            .find('h3, .company-name, td.cell-main h3')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim();

          if (!title || !path) return;

          const jobUrl = `https://web3.career${path}`;
          if (seenUrls.has(jobUrl)) return;
          seenUrls.add(jobUrl);

          const locationText = row
            .find('.job-location-mobile, td:nth-child(3)')
            .text()
            .replace(/\s+/g, ' ')
            .trim();

          const salaryText = row
            .find('.badge-salary, td:nth-child(4)')
            .text()
            .replace(/\s+/g, ' ')
            .trim();

          const isRemote =
            locationText.toLowerCase().includes('remote') ||
            title.toLowerCase().includes('remote') ||
            options.remoteOnly === true;

          const tags: string[] = [];
          row.find('.my-badge, td.cell-tags a, .tag').each((__, tagEl) => {
            const tagText = $(tagEl).text().trim();
            if (tagText && tagText.length < 30) tags.push(tagText);
          });

          const jobId = `web3-${row.attr('data-jobid') || Math.random().toString(36).slice(2, 8)}`;

          jobs.push({
            id: jobId,
            board: this.board,
            title,
            company: company || 'Web3 Company',
            location: locationText || (isRemote ? 'Remote' : 'Worldwide'),
            isRemote,
            salary: salaryText || undefined,
            url: jobUrl,
            tags,
            description: `${title} at ${company}. Location: ${locationText || 'Remote'}. Tags: ${tags.join(', ')}`,
            scrapedAt: new Date().toISOString(),
          });
        });
      } catch (err: any) {
        Logger.warn(`[web3.career] Failed search for "${query}": ${err.message}`);
      }
    }

    return jobs;
  }
}
