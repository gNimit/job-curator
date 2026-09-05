import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import open from 'open';
import { ProfileManager } from '../profile/manager.js';
import { ScraperOrchestrator } from '../scrapers/index.js';
import { JobEvaluator } from '../ai/evaluator.js';
import { AIProfileComparator } from '../ai/comparator.js';
import { CuratedJob } from '../types/evaluation.js';
import { Logger } from '../utils/logger.js';
import { CsvExporter } from '../exporters/csv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  app.use(express.json());

  // Determine public directory location (in dev /src/server/public, or in dist /dist/public)
  let publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    publicDir = path.resolve(process.cwd(), 'src', 'server', 'public');
  }

  app.use(express.static(publicDir));

  // 1. List profiles
  app.get('/api/profiles', async (_req: Request, res: Response) => {
    try {
      const profiles = await ProfileManager.listProfiles();
      res.json(profiles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get single profile
  app.get('/api/profiles/:id', async (req: Request, res: Response) => {
    try {
      const profile = await ProfileManager.loadProfile(req.params.id as string);
      res.json(profile);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // 3. Get curated jobs for profile
  app.get('/api/profiles/:id/jobs', async (req: Request, res: Response) => {
    try {
      const jobs = await ProfileManager.loadCuratedJobs(req.params.id as string);
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Download JSON export
  app.get('/api/profiles/:id/export/json', async (req: Request, res: Response) => {
    try {
      const profileId = req.params.id as string;
      const jobs = await ProfileManager.loadCuratedJobs(profileId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${profileId}-curated-jobs.json"`
      );
      res.send(JSON.stringify(jobs, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Download CSV export
  app.get('/api/profiles/:id/export/csv', async (req: Request, res: Response) => {
    try {
      const profileId = req.params.id as string;
      const jobs = await ProfileManager.loadCuratedJobs(profileId);
      const csv = CsvExporter.toCsv(jobs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${profileId}-curated-jobs.csv"`
      );
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Trigger dynamic scrape & evaluation
  app.post('/api/profiles/:id/curate', async (req: Request, res: Response) => {
    try {
      const profile = await ProfileManager.loadProfile(req.params.id as string);
      Logger.info(`[WebUI] Starting dynamic curation for profile: ${profile.fullName}`);

      const scrapedJobs = await ScraperOrchestrator.scrapeForProfile(profile, {
        limitPerBoard: 15,
      });

      const curated: CuratedJob[] = [];
      for (const job of scrapedJobs) {
        const evaluation = await JobEvaluator.evaluateJob(job, profile);
        curated.push({
          ...job,
          evaluation,
        });
      }

      // Sort by match score descending
      curated.sort((a, b) => b.evaluation.matchScore - a.evaluation.matchScore);

      await ProfileManager.saveCuratedJobs(profile.id, curated);
      Logger.success(`[WebUI] Saved ${curated.length} curated jobs for ${profile.fullName}`);

      res.json({ success: true, count: curated.length, jobs: curated });
    } catch (err: any) {
      Logger.error(`[WebUI] Curation failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Multi-profile comparison endpoint
  app.post('/api/compare', async (req: Request, res: Response) => {
    try {
      const { job, profileIds } = req.body;
      if (!job || !profileIds || !Array.isArray(profileIds)) {
        return res.status(400).json({ error: 'Missing job or profileIds array' });
      }

      const profiles = await Promise.all(
        profileIds.map((id: string) => ProfileManager.loadProfile(id))
      );

      const comparison = await AIProfileComparator.compareProfilesForJob(job, profiles);
      res.json(comparison);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fallback route serves index.html
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

export async function startServer(
  port = 3000,
  autoOpen = false
): Promise<{ server: any; url: string }> {
  const app = createServer();
  const url = `http://localhost:${port}`;

  return new Promise((resolve) => {
    const server = app.listen(port, async () => {
      Logger.success(`Dashboard Web UI is running live at: ${url}`);
      if (autoOpen) {
        try {
          await open(url);
        } catch {
          // ignore auto-open errors
        }
      }
      resolve({ server, url });
    });
  });
}
