import { BaseScraper } from './base.js';
import { JobBoard, JobListing, ScrapeOptions } from '../types/job.js';
import { Logger } from '../utils/logger.js';

export class CryptoJobsListScraper extends BaseScraper {
  readonly board: JobBoard = 'cryptojobslist.com';

  async scrape(options: ScrapeOptions): Promise<JobListing[]> {
    const limit = options.limit || 20;
    const jobs: JobListing[] = [];
    const seenUrls = new Set<string>();

    try {
      // 1. Fetch live jobs sitemap
      const sitemapUrl = 'https://cryptojobslist.com/sitemap-jobs.xml';
      const sitemapXml = await this.fetchHtml(sitemapUrl, {
        forcePlaywright: options.usePlaywright,
      });

      // Extract all URLs from sitemap
      const urlMatches = sitemapXml.match(/<loc>(https:\/\/cryptojobslist\.com\/jobs\/[^<]+)<\/loc>/g) || [];
      const allUrls = urlMatches.map((m) =>
        m.replace('<loc>', '').replace('</loc>', '').trim()
      );

      // Filter URLs matching candidate keywords/roles
      const searchTerms = [
        ...(options.keywords || []),
        ...(options.roles || []),
        'remote',
        'engineer',
        'developer',
        'crypto',
        'blockchain',
      ]
        .map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
        .filter((t) => t.length > 2);

      const matchedUrls = allUrls.filter((url) => {
        const lower = url.toLowerCase();
        return searchTerms.some((term) => lower.includes(term));
      });

      const targetUrls = matchedUrls.length > 0 ? matchedUrls.slice(0, limit) : allUrls.slice(0, limit);

      // 2. Fetch individual job details
      for (const jobUrl of targetUrls) {
        if (jobs.length >= limit) break;
        if (seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);

        try {
          const html = await this.fetchHtml(jobUrl, {
            forcePlaywright: options.usePlaywright,
          });

          // Attempt Schema.org JSON-LD extraction
          let title = '';
          let company = '';
          let description = '';
          let location = 'Remote';
          let isRemote = true;
          let salary: string | undefined = undefined;
          const tags: string[] = ['Crypto', 'Web3'];

          const jsonLdMatch = html.match(
            /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
          );

          if (jsonLdMatch) {
            try {
              const parsedJson = JSON.parse(jsonLdMatch[1]);
              const jobPosting = parsedJson['@graph']
                ? parsedJson['@graph'].find((x: any) => x['@type'] === 'JobPosting')
                : parsedJson['@type'] === 'JobPosting'
                ? parsedJson
                : null;

              if (jobPosting) {
                title = jobPosting.title || '';
                company = jobPosting.hiringOrganization?.name || '';
                description = (jobPosting.description || '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (jobPosting.jobLocation?.address?.addressLocality) {
                  location = jobPosting.jobLocation.address.addressLocality;
                }
                if (jobPosting.baseSalary?.value) {
                  salary = `${jobPosting.baseSalary.currency || '$'}${jobPosting.baseSalary.value.minValue || ''} - ${jobPosting.baseSalary.value.maxValue || ''}`;
                }
              }
            } catch {
              // fallback to DOM parsing
            }
          }

          // Fallback DOM extraction
          const $ = this.loadCheerio(html);
          if (!title) {
            title = $('h1').first().text().trim();
          }
          if (!company) {
            const rawComp = $('h2, .company-name, a[href*="/companies/"]').first().text().trim();
            company = rawComp.replace(/^at\s+/i, '').trim() || 'Crypto Company';
          }
          if (!description) {
            description = $('article, .job-description, main').text().replace(/\s+/g, ' ').trim().slice(0, 1500);
          }

          const pageText = $('body').text();
          isRemote =
            pageText.toLowerCase().includes('remote') ||
            title.toLowerCase().includes('remote') ||
            options.remoteOnly === true;

          if (title) {
            const slug = jobUrl.split('/jobs/')[1] || Math.random().toString(36).slice(2, 8);
            jobs.push({
              id: `crypto-${slug}`,
              board: this.board,
              title,
              company,
              location: isRemote ? 'Remote' : location,
              isRemote,
              salary,
              url: jobUrl,
              tags,
              description: description || `${title} at ${company}`,
              scrapedAt: new Date().toISOString(),
            });
          }
        } catch (err: any) {
          Logger.warn(`[cryptojobslist.com] Failed scraping ${jobUrl}: ${err.message}`);
        }
      }
    } catch (err: any) {
      Logger.warn(`[cryptojobslist.com] Error loading sitemap: ${err.message}`);
    }

    return jobs;
  }
}
