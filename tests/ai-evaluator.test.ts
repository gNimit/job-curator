import { describe, it, expect } from 'vitest';
import { JobEvaluator } from '../src/ai/evaluator.js';
import { CandidatePersona } from '../src/types/profile.js';
import { JobListing } from '../src/types/job.js';

describe('JobEvaluator', () => {
  const candidate: CandidatePersona = {
    id: 'alex-chen',
    fullName: 'Alex Chen',
    headline: 'Senior Web3 & Full Stack Engineer',
    summary: 'Experienced engineer in Rust and Solidity',
    yearsOfExperience: 6,
    technicalSkills: ['Rust', 'Solidity', 'TypeScript', 'Node.js', 'React'],
    softSkills: ['Architecture'],
    domains: ['Web3', 'DeFi'],
    workHistory: [],
    education: [],
    hardConstraints: {
      targetRoles: ['Senior Rust Engineer', 'Smart Contract Developer'],
      workArrangements: ['remote'],
      allowedLocations: ['Remote', 'Worldwide'],
      minSalaryUSD: 100000,
      visaRequired: false,
      excludedKeywords: ['intern', 'unpaid', 'junior'],
      requiredKeywords: ['Rust'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should mark a matching remote engineering job as STRONG_MATCH with passed constraints', async () => {
    const job: JobListing = {
      id: 'job-pass',
      board: 'web3.career',
      title: 'Senior Rust Engineer',
      company: 'Solana Ecosystem Labs',
      location: 'Remote',
      isRemote: true,
      salary: '$150k - $200k',
      url: 'https://example.com/rust-job',
      tags: ['Rust', 'Blockchain'],
      description: 'Looking for a Senior Rust Engineer to build high-performance distributed nodes.',
      scrapedAt: new Date().toISOString(),
    };

    const evalResult = await JobEvaluator.evaluateJob(job, candidate);
    expect(evalResult.constraints.allPassed).toBe(true);
    expect(evalResult.constraints.remoteCheck.passed).toBe(true);
    expect(evalResult.constraints.roleCheck.passed).toBe(true);
    expect(evalResult.matchScore).toBeGreaterThanOrEqual(80);
    expect(evalResult.recommendation).toBe('STRONG_MATCH');
    expect(evalResult.tailoredApplicationPitch.length).toBeGreaterThan(0);
  });

  it('should reject a job containing dealbreaker keywords (intern/unpaid)', async () => {
    const job: JobListing = {
      id: 'job-dealbreaker',
      board: 'foorilla.com',
      title: 'Software Engineer Intern',
      company: 'Startup Co',
      location: 'Remote',
      isRemote: true,
      url: 'https://example.com/intern',
      tags: ['Rust'],
      description: 'Unpaid intern position for college students.',
      scrapedAt: new Date().toISOString(),
    };

    const evalResult = await JobEvaluator.evaluateJob(job, candidate);
    expect(evalResult.constraints.allPassed).toBe(false);
    expect(evalResult.recommendation).toBe('REJECT_CONSTRAINTS');
    expect(evalResult.matchScore).toBeLessThan(60);
  });

  it('should fail remoteCheck if job is onsite and candidate requires remote', async () => {
    const job: JobListing = {
      id: 'job-onsite',
      board: 'cryptojobslist.com',
      title: 'Senior Rust Engineer',
      company: 'Onsite Bank',
      location: 'Tokyo, Japan',
      isRemote: false,
      url: 'https://example.com/onsite',
      tags: ['Rust'],
      description: 'Strictly onsite in Tokyo office 5 days a week.',
      scrapedAt: new Date().toISOString(),
    };

    const evalResult = await JobEvaluator.evaluateJob(job, candidate);
    expect(evalResult.constraints.remoteCheck.passed).toBe(false);
    expect(evalResult.constraints.allPassed).toBe(false);
  });
});
