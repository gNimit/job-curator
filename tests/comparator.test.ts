import { describe, it, expect } from 'vitest';
import { AIProfileComparator } from '../src/ai/comparator.js';
import { CandidatePersona } from '../src/types/profile.js';
import { JobListing } from '../src/types/job.js';

describe('AIProfileComparator', () => {
  const profile1: CandidatePersona = {
    id: 'candidate-rust',
    fullName: 'Rust Specialist',
    headline: 'Principal Rust Systems Engineer',
    summary: 'Expert in low-level Rust and consensus networks',
    yearsOfExperience: 8,
    technicalSkills: ['Rust', 'Tokio', 'Distributed Systems'],
    softSkills: ['Leadership'],
    domains: ['Distributed Systems', 'Web3'],
    workHistory: [],
    education: [],
    hardConstraints: {
      targetRoles: ['Principal Rust Engineer', 'Systems Architect'],
      workArrangements: ['remote'],
      allowedLocations: ['Remote'],
      minSalaryUSD: null,
      visaRequired: false,
      excludedKeywords: ['intern'],
      requiredKeywords: ['Rust'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const profile2: CandidatePersona = {
    id: 'candidate-frontend',
    fullName: 'Frontend Specialist',
    headline: 'Senior React Developer',
    summary: 'Expert in React and UI/UX',
    yearsOfExperience: 5,
    technicalSkills: ['React', 'CSS', 'HTML', 'TypeScript'],
    softSkills: ['Design'],
    domains: ['Web Development'],
    workHistory: [],
    education: [],
    hardConstraints: {
      targetRoles: ['Frontend Developer', 'UI Engineer'],
      workArrangements: ['remote'],
      allowedLocations: ['Remote'],
      minSalaryUSD: null,
      visaRequired: false,
      excludedKeywords: ['intern'],
      requiredKeywords: ['React'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should rank Rust Specialist higher than Frontend Specialist for a Rust Systems role', async () => {
    const job: JobListing = {
      id: 'rust-job',
      board: 'web3.career',
      title: 'Principal Rust Systems Engineer',
      company: 'High-Throughput Labs',
      location: 'Remote',
      isRemote: true,
      url: 'https://example.com/rust',
      tags: ['Rust', 'Systems'],
      description: 'Design distributed engines in Rust.',
      scrapedAt: new Date().toISOString(),
    };

    const comparison = await AIProfileComparator.compareProfilesForJob(job, [profile1, profile2]);
    expect(comparison.rankings.length).toBe(2);
    expect(comparison.rankings[0].candidateName).toBe('Rust Specialist');
    expect(comparison.rankings[0].matchScore).toBeGreaterThan(comparison.rankings[1].matchScore);
    expect(comparison.evaluationRationale).toBeTruthy();
  });
});
