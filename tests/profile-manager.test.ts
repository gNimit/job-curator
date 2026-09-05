import { describe, it, expect } from 'vitest';
import { ProfileManager } from '../src/profile/manager.js';
import { CandidatePersona } from '../src/types/profile.js';
import { CuratedJob } from '../src/types/evaluation.js';

describe('ProfileManager', () => {
  const mockPersona: CandidatePersona = {
    id: 'test-candidate',
    fullName: 'Test Candidate',
    headline: 'Senior Test Engineer',
    summary: 'Expert in testing distributed systems',
    yearsOfExperience: 6,
    technicalSkills: ['TypeScript', 'Node.js', 'Rust'],
    softSkills: ['Mentoring', 'Leadership'],
    domains: ['Web3', 'Distributed Systems'],
    workHistory: [],
    education: [],
    hardConstraints: {
      targetRoles: ['Senior Test Engineer', 'Full Stack Engineer'],
      workArrangements: ['remote'],
      allowedLocations: ['Remote', 'Worldwide'],
      minSalaryUSD: 120000,
      visaRequired: false,
      excludedKeywords: ['intern', 'unpaid'],
      requiredKeywords: ['TypeScript'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should save and load candidate profile', async () => {
    const filePath = await ProfileManager.saveProfile(mockPersona);
    expect(filePath).toContain('test-candidate');

    const loaded = await ProfileManager.loadProfile('test-candidate');
    expect(loaded.id).toBe('test-candidate');
    expect(loaded.fullName).toBe('Test Candidate');
    expect(loaded.hardConstraints.minSalaryUSD).toBe(120000);
  });

  it('should list saved profiles including test profile', async () => {
    const profiles = await ProfileManager.listProfiles();
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.some((p) => p.id === 'test-candidate')).toBe(true);
  });

  it('should save and load curated jobs in both JSON and CSV format', async () => {
    const mockJobs: CuratedJob[] = [
      {
        id: 'job-1',
        board: 'web3.career',
        title: 'Senior TypeScript Engineer',
        company: 'Decentralized Tech',
        location: 'Remote',
        isRemote: true,
        salary: '$140k - $180k',
        url: 'https://example.com/job-1',
        tags: ['TypeScript', 'Node.js'],
        description: 'Building next-generation Web3 developer tooling',
        scrapedAt: new Date().toISOString(),
        evaluation: {
          jobId: 'job-1',
          profileId: 'test-candidate',
          matchScore: 92,
          recommendation: 'STRONG_MATCH',
          constraints: {
            locationCheck: { passed: true, reason: 'Remote match' },
            remoteCheck: { passed: true, reason: 'Remote match' },
            experienceCheck: { passed: true, reason: 'Seniority match' },
            roleCheck: { passed: true, reason: 'Role match' },
            salaryCheck: { passed: true, reason: 'Salary check passed' },
            allPassed: true,
          },
          matchedSkills: ['TypeScript', 'Node.js'],
          missingSkills: [],
          strengths: ['Direct TypeScript mastery'],
          growthOpportunities: [],
          redFlags: [],
          tailoredApplicationPitch: ['Strong match for developer tooling.'],
          evaluatedAt: new Date().toISOString(),
        },
      },
    ];

    const { jsonPath, csvPath } = await ProfileManager.saveCuratedJobs('test-candidate', mockJobs);
    expect(jsonPath).toContain('jobs.json');
    expect(csvPath).toContain('jobs.csv');

    const loadedJobs = await ProfileManager.loadCuratedJobs('test-candidate');
    expect(loadedJobs.length).toBe(1);
    expect(loadedJobs[0].title).toBe('Senior TypeScript Engineer');
    expect(loadedJobs[0].evaluation.matchScore).toBe(92);
  });
});
