import { describe, it, expect } from 'vitest';
import path from 'path';
import { ResumeReader } from '../src/resume/reader.js';

describe('ResumeReader', () => {
  const resumesDir = path.resolve(process.cwd(), 'resumes');
  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures');

  it('should list resumes in the resumes or fixtures folder', () => {
    const resumesList = ResumeReader.listResumes(resumesDir);
    expect(Array.isArray(resumesList)).toBe(true);

    const fixturesList = ResumeReader.listResumes(fixturesDir);
    expect(fixturesList.length).toBeGreaterThan(0);
    expect(fixturesList.some((f) => f.endsWith('.pdf'))).toBe(true);
  });

  it('should parse PDF resume text and extract candidate content', async () => {
    const parsed = await ResumeReader.parseFile(path.join(fixturesDir, 'sample-resume.pdf'));
    expect(parsed.rawText.length).toBeGreaterThan(10);
    expect(parsed.rawText).toContain('Alex Chen');
    expect(parsed.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('should parse multiple resume files and combine their texts', async () => {
    const fixtureList = ResumeReader.listResumes(fixturesDir);
    if (fixtureList.length >= 2) {
      const parsedList = await ResumeReader.parseMultipleFiles(fixtureList.slice(0, 2));
      expect(parsedList.length).toBe(2);

      const combined = ResumeReader.combineResumeTexts(parsedList);
      expect(combined).toContain('=== RESUME SOURCE 1:');
      expect(combined).toContain('=== RESUME SOURCE 2:');
    }
  });

  it('should throw error for non-existent file', async () => {
    await expect(
      ResumeReader.parseFile('non-existent-resume.pdf')
    ).rejects.toThrow(/not found/i);
  });
});
