import { CuratedJob } from '../types/evaluation.js';

export class CsvExporter {
  private static escapeCell(value: any): string {
    if (value === null || value === undefined) {
      return '""';
    }
    const str = String(value);
    // RFC 4180: escape internal double quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  static toCsv(jobs: CuratedJob[]): string {
    const headers = [
      'Job Title',
      'Company',
      'Board Source',
      'Match Score (%)',
      'Recommendation',
      'Location',
      'Remote Status',
      'Salary',
      'Constraints Passed',
      'Matched Skills',
      'Strengths',
      'Application Pitch',
      'Job URL',
      'Scraped Date',
    ];

    const rows = jobs.map((job) => {
      const isPassed = job.evaluation?.constraints?.allPassed ? 'YES' : 'NO';
      const matchedSkills = (job.evaluation?.matchedSkills || []).join('; ');
      const strengths = (job.evaluation?.strengths || []).join('; ');
      const pitch = (job.evaluation?.tailoredApplicationPitch || []).join(' | ');

      return [
        this.escapeCell(job.title),
        this.escapeCell(job.company),
        this.escapeCell(job.board),
        this.escapeCell(job.evaluation?.matchScore ?? 0),
        this.escapeCell(job.evaluation?.recommendation ?? 'N/A'),
        this.escapeCell(job.location),
        this.escapeCell(job.isRemote ? 'Remote' : 'On-Site / Hybrid'),
        this.escapeCell(job.salary || 'Not Specified'),
        this.escapeCell(isPassed),
        this.escapeCell(matchedSkills),
        this.escapeCell(strengths),
        this.escapeCell(pitch),
        this.escapeCell(job.url),
        this.escapeCell(job.scrapedAt),
      ].join(',');
    });

    return [headers.map(this.escapeCell).join(','), ...rows].join('\n');
  }
}
