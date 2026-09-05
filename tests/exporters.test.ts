import { describe, it, expect } from 'vitest';
import { CsvExporter } from '../src/exporters/csv.js';
import { JsonExporter } from '../src/exporters/json.js';
import { CuratedJob } from '../src/types/evaluation.js';

describe('Exporters', () => {
  const sampleJob: CuratedJob = {
    id: 'job-exp-1',
    board: 'web3.career',
    title: 'Senior "Full-Stack" Engineer, Core Team',
    company: 'NextGen, Inc.',
    location: 'Remote',
    isRemote: true,
    salary: '$160,000',
    url: 'https://example.com/job-exp',
    tags: ['TypeScript', 'Node.js'],
    description: 'Core platform development',
    scrapedAt: '2026-09-05T12:00:00Z',
    evaluation: {
      jobId: 'job-exp-1',
      profileId: 'test-profile',
      matchScore: 95,
      recommendation: 'STRONG_MATCH',
      constraints: {
        locationCheck: { passed: true, reason: 'Remote' },
        remoteCheck: { passed: true, reason: 'Remote' },
        experienceCheck: { passed: true, reason: '5+ years' },
        roleCheck: { passed: true, reason: 'Role match' },
        salaryCheck: { passed: true, reason: 'Good salary' },
        allPassed: true,
      },
      matchedSkills: ['TypeScript', 'Node.js'],
      missingSkills: [],
      strengths: ['Direct experience'],
      growthOpportunities: [],
      redFlags: [],
      tailoredApplicationPitch: ['Proven track record delivering next-gen apps.'],
      evaluatedAt: '2026-09-05T12:05:00Z',
    },
  };

  it('should export valid CSV with RFC 4180 escaped quotes and commas', () => {
    const csv = CsvExporter.toCsv([sampleJob]);
    expect(csv).toContain('"Job Title","Company","Board Source"');
    // Quotes inside title should be escaped as ""
    expect(csv).toContain('""Full-Stack""');
    // Commas should be safely encased in double quotes
    expect(csv).toContain('"NextGen, Inc."');
    expect(csv).toContain('"$160,000"');
    expect(csv).toContain('"STRONG_MATCH"');
  });

  it('should export valid parseable JSON', () => {
    const jsonStr = JsonExporter.toJson([sampleJob]);
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].title).toBe('Senior "Full-Stack" Engineer, Core Team');
    expect(parsed[0].evaluation.matchScore).toBe(95);
  });
});
