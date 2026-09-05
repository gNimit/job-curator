import { BaseScraper } from './base.js';
import { JobBoard, JobListing, ScrapeOptions } from '../types/job.js';
import { Logger } from '../utils/logger.js';

export class FoorillaScraper extends BaseScraper {
  readonly board: JobBoard = 'foorilla.com';

  async scrape(options: ScrapeOptions): Promise<JobListing[]> {
    const limit = options.limit || 25;
    const jobs: JobListing[] = [];
    const seenUrls = new Set<string>();

    const targetUrls: string[] = ['https://foorilla.com/hiring/jobs/top/'];

    // Add search URLs for keywords if provided
    if (options.keywords && options.keywords.length > 0) {
      for (const kw of options.keywords.slice(0, 2)) {
        targetUrls.push(`https://foorilla.com/hiring/jobs/?q=${encodeURIComponent(kw)}`);
      }
    }

    for (const url of targetUrls) {
      if (jobs.length >= limit) break;

      try {
        const html = await this.fetchHtml(url, {
          headers: {
            'HX-Request': 'true',
          },
          forcePlaywright: options.usePlaywright,
          waitForSelector: 'li.list-group-item',
        });

        const $ = this.loadCheerio(html);

        $('li.list-group-item').each((_, el) => {
          if (jobs.length >= limit) return;

          const item = $(el);
          const link = item.find('a.stretched-link');
          const rawTitle = link.text().replace(/Featured|Feat\./g, '').trim();
          const href = link.attr('hx-get') || link.attr('href') || '';

          if (!rawTitle || !href) return;

          const jobUrl = href.startsWith('http') ? href : `https://foorilla.com${href}`;
          if (seenUrls.has(jobUrl)) return;
          seenUrls.add(jobUrl);

          const rawMeta = item.find('.text-body-secondary, small, span').text().trim();
          const isRemote =
            rawMeta.toLowerCase().includes('remote') ||
            rawTitle.toLowerCase().includes('remote') ||
            options.remoteOnly === true;

          // Look for salary indicators like USD 150k or $120k
          const salaryMatch = rawMeta.match(/(?:USD|\$)\s*\d+[\d,kK\s-]*/);
          const salary = salaryMatch ? salaryMatch[0].trim() : undefined;

          // Infer company
          const companyMatch = rawMeta.match(/at\s+([A-Za-z0-9\s._-]+)/i);
          const company = companyMatch ? companyMatch[1].trim() : 'Tech Company';

          const tags: string[] = [];
          if (isRemote) tags.push('Remote');
          if (rawTitle.toLowerCase().includes('lead')) tags.push('Lead');
          if (rawTitle.toLowerCase().includes('senior')) tags.push('Senior');
          if (rawTitle.toLowerCase().includes('ai')) tags.push('AI');
          if (rawTitle.toLowerCase().includes('engineer')) tags.push('Engineering');

          const slug = href.replace(/\/hiring\/jobs\//, '').replace(/\//g, '');
          const jobId = `foorilla-${slug || Math.random().toString(36).slice(2, 8)}`;

          jobs.push({
            id: jobId,
            board: this.board,
            title: rawTitle,
            company,
            location: isRemote ? 'Remote' : 'Worldwide',
            isRemote,
            salary,
            url: jobUrl,
            tags,
            description: `${rawTitle} at ${company}. Metadata: ${rawMeta.slice(0, 300)}`,
            scrapedAt: new Date().toISOString(),
          });
        });
      } catch (err: any) {
        Logger.warn(`[foorilla.com] Failed scraping ${url}: ${err.message}`);
      }
    }

    return jobs;
  }
}
