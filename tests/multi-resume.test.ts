import { describe, it, expect } from 'vitest';
import { PersonaBuilder } from '../src/resume/persona-builder.js';

describe('PersonaBuilder Multi-Resume Synthesis', () => {
  it('should synthesize multiple resume texts into a single coherent candidate profile', async () => {
    const resume1 = {
      filename: 'resume-backend.pdf',
      filePath: '/mock/resume-backend.pdf',
      rawText: `Alex Chen
Backend Engineer
San Francisco, CA
Experienced in Golang, PostgreSQL, Docker, Kafka, Microservices. Built payment routing engines.`,
      pageCount: 1,
    };

    const resume2 = {
      filename: 'resume-web3.pdf',
      filePath: '/mock/resume-web3.pdf',
      rawText: `Alex Chen
Web3 & Blockchain Engineer
Experienced in Solidity, Rust, Foundry, Smart Contracts, DeFi protocols, Ethereum.`,
      pageCount: 1,
    };

    const unified = await PersonaBuilder.buildFromMultipleResumes([resume1, resume2]);

    expect(unified.id).toBe('alex-chen');
    expect(unified.fullName).toContain('Alex');
    // Unified technical skills should contain skills from both resumes
    expect(unified.technicalSkills.some((s) => s.toLowerCase().includes('go'))).toBe(true);
    expect(unified.technicalSkills.some((s) => s.toLowerCase().includes('solidity') || s.toLowerCase().includes('rust'))).toBe(true);
    // Hard constraints should accommodate both domains
    expect(unified.hardConstraints.targetRoles.length).toBeGreaterThan(1);
  });
});
