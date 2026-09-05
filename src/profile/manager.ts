import fs from 'fs';
import path from 'path';
import { CandidatePersona, CandidatePersonaSchema } from '../types/profile.js';
import { CuratedJob } from '../types/evaluation.js';
import { config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { CsvExporter } from '../exporters/csv.js';

export class ProfileManager {
  private static getBaseDir(): string {
    const dir = config.profilesDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static getProfileDir(profileId: string): string {
    const dir = path.join(this.getBaseDir(), profileId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static async saveProfile(persona: CandidatePersona): Promise<string> {
    const profileDir = this.getProfileDir(persona.id);
    const profilePath = path.join(profileDir, 'profile.json');

    // Update timestamp
    persona.updatedAt = new Date().toISOString();

    // Validate with zod
    const validated = CandidatePersonaSchema.parse(persona);

    fs.writeFileSync(profilePath, JSON.stringify(validated, null, 2), 'utf-8');
    return profilePath;
  }

  static async loadProfile(profileId: string): Promise<CandidatePersona> {
    const profileDir = path.join(this.getBaseDir(), profileId);
    const profilePath = path.join(profileDir, 'profile.json');

    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile "${profileId}" not found at: ${profilePath}`);
    }

    const raw = fs.readFileSync(profilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return CandidatePersonaSchema.parse(parsed);
  }

  static async listProfiles(): Promise<CandidatePersona[]> {
    const baseDir = this.getBaseDir();
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const profiles: CandidatePersona[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pPath = path.join(baseDir, entry.name, 'profile.json');
        if (fs.existsSync(pPath)) {
          try {
            const raw = fs.readFileSync(pPath, 'utf-8');
            profiles.push(CandidatePersonaSchema.parse(JSON.parse(raw)));
          } catch (err: any) {
            Logger.warn(`Skipping invalid profile in ${entry.name}: ${err.message}`);
          }
        }
      }
    }

    return profiles;
  }

  static async saveCuratedJobs(
    profileId: string,
    curatedJobs: CuratedJob[]
  ): Promise<{ jsonPath: string; csvPath: string }> {
    const profileDir = this.getProfileDir(profileId);
    const jsonPath = path.join(profileDir, 'jobs.json');
    const csvPath = path.join(profileDir, 'jobs.csv');

    // Write formatted JSON
    fs.writeFileSync(jsonPath, JSON.stringify(curatedJobs, null, 2), 'utf-8');

    // Write RFC 4180 compliant CSV
    const csvContent = CsvExporter.toCsv(curatedJobs);
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    return { jsonPath, csvPath };
  }

  static async loadCuratedJobs(profileId: string): Promise<CuratedJob[]> {
    const profileDir = path.join(this.getBaseDir(), profileId);
    const jsonPath = path.join(profileDir, 'jobs.json');

    if (!fs.existsSync(jsonPath)) {
      return [];
    }

    const raw = fs.readFileSync(jsonPath, 'utf-8');
    try {
      return JSON.parse(raw) as CuratedJob[];
    } catch {
      return [];
    }
  }
}
