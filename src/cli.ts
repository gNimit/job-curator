#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { ResumeReader } from './resume/reader.js';
import { PersonaBuilder } from './resume/persona-builder.js';
import { ProfileManager } from './profile/manager.js';
import { ScraperOrchestrator } from './scrapers/index.js';
import { JobEvaluator } from './ai/evaluator.js';
import { AIProfileComparator } from './ai/comparator.js';
import { startServer } from './server/app.js';
import { CuratedJob } from './types/evaluation.js';
import { Logger } from './utils/logger.js';
import { config } from './utils/config.js';
import { JobBoard } from './types/job.js';
import { InteractiveTui } from './tui/interactive.js';
import { ScraperFailureManager } from './scrapers/failure-manager.js';

const program = new Command();

program
  .name('job-curator')
  .description('High-performance, dynamic job curator CLI with multi-board scraping, Gemini AI evaluation, and localhost Web UI.')
  .version('1.0.0');

export interface PipelineRunOptions {
  profileId?: string;
  resumePaths?: string[];
  candidateName?: string;
  boards: JobBoard[];
  limit: number;
  minScore: number;
  workArrangements?: Array<'remote' | 'hybrid' | 'onsite'>;
  allowedLocations?: string[];
  serve: boolean;
  port: number;
  open: boolean;
  usePlaywright?: boolean;
}

export async function executeCurationPipeline(options: PipelineRunOptions): Promise<void> {
  Logger.banner();
  const startTime = Date.now();

  try {
    let profile;

    if (options.profileId) {
      Logger.step(1, 4, `Loading existing profile: ${options.profileId}`);
      profile = await ProfileManager.loadProfile(options.profileId);
      if (options.workArrangements) {
        profile.hardConstraints.workArrangements = options.workArrangements;
      }
      if (options.allowedLocations && options.allowedLocations.length > 0) {
        profile.hardConstraints.allowedLocations = options.allowedLocations;
      }
      Logger.success(`Loaded profile for ${profile.fullName} (${profile.headline})`);
    } else {
      Logger.step(1, 4, 'Candidate Persona & Hard Constraints Setup');

      let resumePaths = options.resumePaths || [];
      if (resumePaths.length === 0) {
        const resumes = ResumeReader.listResumes(config.resumesDir);
        if (resumes.length === 0) {
          Logger.error(`No resumes found in ${config.resumesDir}.`);
          Logger.info('Place resume PDFs in ./resumes/ or pass --resume <file> or --resumes <file1,file2>');
          process.exit(1);
        }
        resumePaths = [resumes[0]];
      }

      const overrides: any = {};
      if (options.workArrangements) {
        overrides.workArrangements = options.workArrangements;
      }
      if (options.allowedLocations && options.allowedLocations.length > 0) {
        overrides.allowedLocations = options.allowedLocations;
      }

      if (resumePaths.length === 1) {
        Logger.info(`Parsing single resume: ${chalk.cyan(path.basename(resumePaths[0]))}`);
        const spinner = Logger.spinner(`Extracting text from resume: ${path.basename(resumePaths[0])}...`);
        const parsed = await ResumeReader.parseFile(resumePaths[0]);
        spinner.succeed(`Extracted ${parsed.rawText.length} characters from ${parsed.filename}`);

        const personaSpinner = Logger.spinner('Building structured candidate persona with Gemini...');
        profile = await PersonaBuilder.buildFromResumeText(parsed.rawText, overrides);
        if (options.candidateName) {
          profile.fullName = options.candidateName;
        }
        personaSpinner.succeed(`Persona created for: ${chalk.bold.white(profile.fullName)}`);
      } else {
        Logger.info(`Synthesizing ${resumePaths.length} resumes into a single master profile...`);
        const spinner = Logger.spinner(`Parsing ${resumePaths.length} resume files...`);
        const parsedResumes = await ResumeReader.parseMultipleFiles(resumePaths);
        spinner.succeed(`Parsed ${parsedResumes.length} resumes successfully`);

        const personaSpinner = Logger.spinner('Synthesizing all resumes into a single unified persona with Gemini...');
        profile = await PersonaBuilder.buildFromMultipleResumes(parsedResumes, overrides, options.candidateName);
        personaSpinner.succeed(`Master persona synthesized for: ${chalk.bold.white(profile.fullName)}`);
      }

      // Save profile to profiles/<profile-id>/profile.json
      const profilePath = await ProfileManager.saveProfile(profile);
      Logger.success(`Profile saved to: ${chalk.cyan(profilePath)}`);

      // Display constraints summary
      console.log();
      console.log(chalk.bold.cyan('📋 Candidate Persona & Hard Constraints:'));
      console.log(`   ${chalk.gray('•')} Candidate: ${chalk.bold.white(profile.fullName)} | ${chalk.cyan(profile.headline)}`);
      console.log(`   ${chalk.gray('•')} Discipline: ${chalk.bold.magenta(profile.primarySpecialization || 'Backend')} (${profile.yearsOfExperience} yrs exp)`);
      if (profile.projects && profile.projects.length > 0) {
        console.log(`   ${chalk.gray('•')} Key Projects: ${chalk.green(profile.projects.map((p) => p.name).join(', '))}`);
      }
      console.log(`   ${chalk.gray('•')} Top Skills: ${chalk.white(profile.technicalSkills.slice(0, 8).join(', '))}`);
      console.log(`   ${chalk.gray('•')} Target Roles: ${chalk.white(profile.hardConstraints.targetRoles.join(', '))}`);
      console.log(`   ${chalk.gray('•')} Work Arrangement: ${chalk.white(profile.hardConstraints.workArrangements.join(', '))}`);
      console.log(`   ${chalk.gray('•')} Allowed Locations: ${chalk.white(profile.hardConstraints.allowedLocations.join(', '))}`);
      console.log(`   ${chalk.gray('•')} Excluded Keywords: ${chalk.white(profile.hardConstraints.excludedKeywords.join(', '))}`);
    }

    // Step 2: Dynamic Multi-Board Scraping
    Logger.step(2, 4, 'Dynamic Multi-Board Scraping');
    const rawJobs = await ScraperOrchestrator.scrapeForProfile(profile, {
      boards: options.boards,
      limitPerBoard: options.limit,
      usePlaywright: options.usePlaywright,
    });

    if (rawJobs.length === 0) {
      Logger.warn('No jobs were retrieved from the boards. Check connectivity or scraper options.');
    }

    // Step 3: AI Evaluation against Hard Constraints & Structured Outputs
    Logger.step(3, 4, 'AI Evaluation & Hard Constraint Verification');
    Logger.info(`Evaluating ${rawJobs.length} active listings against candidate persona...`);

    const evalSpinner = Logger.spinner(`Evaluating jobs with Gemini structured outputs...`);
    const curatedJobs: CuratedJob[] = [];

    for (let i = 0; i < rawJobs.length; i++) {
      const job = rawJobs[i];
      evalSpinner.text = `[${i + 1}/${rawJobs.length}] Evaluating: ${job.title.slice(0, 30)} at ${job.company.slice(0, 20)}...`;
      const evaluation = await JobEvaluator.evaluateJob(job, profile);
      curatedJobs.push({
        ...job,
        evaluation,
      });
    }

    evalSpinner.succeed(`Completed AI evaluation for all ${rawJobs.length} listings`);

    // Sort by match score descending
    curatedJobs.sort((a, b) => (b.evaluation?.matchScore ?? 0) - (a.evaluation?.matchScore ?? 0));

    // Filter by min score and constraints
    const verifiedMatches = curatedJobs.filter(
      (j) => (j.evaluation?.matchScore ?? 0) >= options.minScore && j.evaluation?.constraints?.allPassed
    );

    // Step 4: Export to CSV, JSON, and Profile Directory
    Logger.step(4, 4, 'Data Export & Persistence');
    const { jsonPath, csvPath } = await ProfileManager.saveCuratedJobs(profile.id, curatedJobs);
    Logger.success(`Saved structured JSON: ${chalk.cyan(jsonPath)}`);
    Logger.success(`Saved verified CSV:  ${chalk.cyan(csvPath)}`);

    // Terminal Summary Table
    console.log();
    console.log(chalk.bold.cyan('📊 Curated Listings Preview (Top Matches):'));
    console.log(
      chalk.gray(
        '─────────────────────────────────────────────────────────────────────────────────────────────'
      )
    );
    console.log(
      `${chalk.bold('SCORE')}   ${chalk.bold('RECOMMENDATION')}        ${chalk.bold('TITLE'.padEnd(32))} ${chalk.bold('COMPANY'.padEnd(20))} ${chalk.bold('BOARD')}`
    );
    console.log(
      chalk.gray(
        '─────────────────────────────────────────────────────────────────────────────────────────────'
      )
    );

    const previewJobs = curatedJobs.slice(0, 8);
    for (const j of previewJobs) {
      const scoreStr = Logger.scoreColor(j.evaluation.matchScore).padEnd(8);
      const recBadge = Logger.recommendationBadge(j.evaluation.recommendation).padEnd(24);
      const titleStr = j.title.slice(0, 30).padEnd(32);
      const compStr = j.company.slice(0, 18).padEnd(20);
      console.log(`${scoreStr} ${recBadge} ${chalk.white(titleStr)} ${chalk.cyan(compStr)} ${chalk.gray(j.board)}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      chalk.gray(
        '─────────────────────────────────────────────────────────────────────────────────────────────'
      )
    );
    Logger.success(`Curation complete in ${elapsed}s! Found ${verifiedMatches.length} verified strong matches.`);

    // Launch Web UI unless --no-serve is set
    if (options.serve) {
      console.log();
      Logger.section('Launching Localhost Web UI Dashboard');
      await startServer(options.port, options.open);
      Logger.info(`Press Ctrl+C at any time to exit.`);
    }
  } catch (err: any) {
    Logger.error(`Curation pipeline failed: ${err.message}`);
    if (err.stack) {
      console.error(chalk.gray(err.stack));
    }
    process.exit(1);
  }
}

// Single-command end-to-end workflow: "job-curator run"
program
  .command('run', { isDefault: true })
  .description('Run complete end-to-end pipeline: Parse resume -> Profile -> Dynamic scrape -> AI evaluation -> Export CSV/JSON -> Launch Web UI')
  .option('-i, --interactive', 'Launch interactive TUI to choose resumes, load profiles, and fine-tune options')
  .option('-r, --resume <path>', 'Path to resume PDF file')
  .option('--resumes <paths>', 'Comma-separated paths to multiple resume PDFs to merge into one profile')
  .option('--all-resumes', 'Merge all resumes found in ./resumes/ folder into a single master profile')
  .option('--name <name>', 'Optional candidate name override for the unified profile')
  .option('-p, --profile <id>', 'Use existing profile ID instead of parsing resume')
  .option('-b, --boards <boards>', 'Comma-separated boards (web3.career, foorilla.com, cryptojobslist.com)', 'web3.career,foorilla.com,cryptojobslist.com')
  .option('-l, --limit <number>', 'Maximum jobs to scrape per board', '20')
  .option('-m, --min-score <number>', 'Minimum match score to curate (0-100)', '60')
  .option('--port <number>', 'Web UI dashboard port', '3000')
  .option('--no-serve', 'Do not launch localhost Web UI after curation')
  .option('--no-open', 'Do not automatically open browser')
  .option('--reset-health', 'Reset scraper circuit breaker and re-enable all boards')
  .action(async (opts) => {
    if (opts.resetHealth) {
      ScraperFailureManager.reset();
    }

    if (opts.interactive) {
      const tuiConfig = await InteractiveTui.run();
      await executeCurationPipeline({
        profileId: tuiConfig.profileId,
        resumePaths: tuiConfig.resumePaths,
        candidateName: tuiConfig.candidateName,
        boards: tuiConfig.boards,
        limit: tuiConfig.limitPerBoard,
        minScore: tuiConfig.minScore,
        workArrangements: tuiConfig.workArrangements,
        allowedLocations: tuiConfig.allowedLocations,
        serve: tuiConfig.launchWebUi,
        port: tuiConfig.port,
        open: true,
        usePlaywright: tuiConfig.usePlaywright,
      });
      return;
    }

    let resumePaths: string[] | undefined = undefined;
    if (opts.resumes) {
      resumePaths = opts.resumes.split(',').map((s: string) => s.trim());
    } else if (opts.allResumes) {
      resumePaths = ResumeReader.listResumes(config.resumesDir);
    } else if (opts.resume) {
      resumePaths = [opts.resume];
    }

    const boards = opts.boards.split(',').map((b: string) => b.trim()) as JobBoard[];
    const limit = parseInt(opts.limit, 10) || 20;
    const minScore = parseInt(opts.minScore, 10) || 60;
    const port = parseInt(opts.port, 10) || 3000;

    await executeCurationPipeline({
      profileId: opts.profile,
      resumePaths,
      candidateName: opts.name,
      boards,
      limit,
      minScore,
      serve: opts.serve !== false,
      port,
      open: opts.open !== false,
    });
  });

// Profile Management Subcommands
const profileCmd = program.command('profile').description('Manage candidate profiles and hard constraints');

profileCmd
  .command('create')
  .description('Create a candidate persona from one or multiple PDF resumes')
  .option('-r, --resume <path>', 'Path to a single resume PDF')
  .option('--resumes <paths>', 'Comma-separated paths to multiple resume PDFs to merge into one profile')
  .option('--all-resumes', 'Merge all resumes in ./resumes/ directory into one profile')
  .option('--name <name>', 'Candidate name override')
  .option('--roles <roles>', 'Comma-separated target roles override')
  .option('--remote-only', 'Enforce strictly remote positions')
  .action(async (opts) => {
    Logger.banner();
    try {
      let resumePaths: string[] = [];

      if (opts.resumes) {
        resumePaths = opts.resumes.split(',').map((s: string) => s.trim());
      } else if (opts.allResumes) {
        resumePaths = ResumeReader.listResumes(config.resumesDir);
      } else if (opts.resume) {
        resumePaths = [opts.resume];
      } else {
        const found = ResumeReader.listResumes(config.resumesDir);
        if (found.length === 0) {
          Logger.error('No resumes specified and none found in ./resumes/ folder.');
          return;
        }
        resumePaths = [found[0]];
      }

      const overrides: any = {};
      if (opts.roles) overrides.targetRoles = opts.roles.split(',').map((s: string) => s.trim());
      if (opts.remoteOnly) overrides.workArrangements = ['remote'];

      let persona;
      if (resumePaths.length === 1) {
        const parsed = await ResumeReader.parseFile(resumePaths[0]);
        persona = await PersonaBuilder.buildFromResumeText(parsed.rawText, overrides);
        if (opts.name) persona.fullName = opts.name;
      } else {
        Logger.info(`Parsing ${resumePaths.length} resume files...`);
        const parsedList = await ResumeReader.parseMultipleFiles(resumePaths);
        persona = await PersonaBuilder.buildFromMultipleResumes(parsedList, overrides, opts.name);
      }

      const filePath = await ProfileManager.saveProfile(persona);
      Logger.success(`Profile "${persona.id}" created successfully from ${resumePaths.length} document(s): ${filePath}`);
    } catch (err: any) {
      Logger.error(`Failed to create profile: ${err.message}`);
    }
  });

profileCmd
  .command('list')
  .description('List all saved candidate profiles')
  .action(async () => {
    Logger.banner();
    const profiles = await ProfileManager.listProfiles();
    if (profiles.length === 0) {
      Logger.info('No profiles saved yet. Run `job-curator profile create --resume <path>`');
      return;
    }

    console.log(chalk.bold.cyan('Saved Candidate Profiles:'));
    profiles.forEach((p, idx) => {
      console.log(`\n[${idx + 1}] ${chalk.bold.white(p.fullName)} (ID: ${chalk.cyan(p.id)})`);
      console.log(`    Headline: ${p.headline}`);
      console.log(`    Experience: ${p.yearsOfExperience} years`);
      console.log(`    Target Roles: ${p.hardConstraints.targetRoles.join(', ')}`);
      console.log(`    Locations: ${p.hardConstraints.allowedLocations.join(', ')}`);
    });
  });

profileCmd
  .command('show <id>')
  .description('Display detailed persona and constraints for a profile')
  .action(async (id) => {
    try {
      const p = await ProfileManager.loadProfile(id);
      console.log(JSON.stringify(p, null, 2));
    } catch (err: any) {
      Logger.error(err.message);
    }
  });

// Standalone Scrape Subcommand
program
  .command('scrape')
  .description('Dynamically scrape job boards for a candidate profile')
  .requiredOption('-p, --profile <id>', 'Profile ID')
  .option('-b, --boards <boards>', 'Boards to scrape', 'web3.career,foorilla.com,cryptojobslist.com')
  .option('-l, --limit <number>', 'Limit per board', '20')
  .action(async (opts) => {
    Logger.banner();
    try {
      const profile = await ProfileManager.loadProfile(opts.profile);
      const boards = opts.boards.split(',').map((b: string) => b.trim()) as JobBoard[];
      const limit = parseInt(opts.limit, 10) || 20;

      const jobs = await ScraperOrchestrator.scrapeForProfile(profile, {
        boards,
        limitPerBoard: limit,
      });

      Logger.success(`Scraped ${jobs.length} jobs.`);
    } catch (err: any) {
      Logger.error(err.message);
    }
  });

// Multi-Profile Comparison Subcommand
program
  .command('compare')
  .description('AI evaluation and ranking between multiple candidate profiles for a job')
  .requiredOption('--job-title <title>', 'Job title to evaluate against')
  .requiredOption('--company <company>', 'Company name')
  .option('--profiles <profiles>', 'Comma-separated profile IDs to compare')
  .action(async (opts) => {
    Logger.banner();
    try {
      let profilesToCompare;
      if (opts.profiles) {
        const ids = opts.profiles.split(',').map((s: string) => s.trim());
        profilesToCompare = await Promise.all(ids.map((id: string) => ProfileManager.loadProfile(id)));
      } else {
        profilesToCompare = await ProfileManager.listProfiles();
      }

      if (profilesToCompare.length < 2) {
        Logger.error('Need at least 2 profiles to perform a comparison. Create more profiles first.');
        return;
      }

      const mockJob = {
        id: 'comp-job',
        board: 'web3.career' as JobBoard,
        title: opts.jobTitle,
        company: opts.company,
        location: 'Remote',
        isRemote: true,
        url: 'https://example.com/job',
        tags: ['Engineering'],
        description: `${opts.jobTitle} at ${opts.company}. Looking for strong engineering leadership and architecture.`,
        scrapedAt: new Date().toISOString(),
      };

      const spinner = Logger.spinner('Comparing candidate profiles using Gemini AI...');
      const comparison = await AIProfileComparator.compareProfilesForJob(mockJob, profilesToCompare);
      spinner.succeed('Comparison complete');

      console.log();
      console.log(chalk.bold.cyan(`🏆 Comparison Results for: ${opts.jobTitle} at ${opts.company}`));
      console.log(`Top Candidate: ${chalk.bold.green(comparison.topCandidateId)}`);
      console.log(`Executive Rationale: ${comparison.evaluationRationale}`);
      console.log();

      comparison.rankings.forEach((r, idx) => {
        console.log(`Rank #${idx + 1}: ${chalk.bold.white(r.candidateName)} (${r.profileId})`);
        console.log(`  Match Score: ${Logger.scoreColor(r.matchScore)}`);
        console.log(`  Recommendation: ${Logger.recommendationBadge(r.recommendation)}`);
        console.log(`  Key Advantage: ${r.keyAdvantage}`);
        console.log(`  Summary: ${r.fitSummary}`);
        console.log();
      });
    } catch (err: any) {
      Logger.error(`Comparison failed: ${err.message}`);
    }
  });

// Standalone Server Subcommand
program
  .command('serve')
  .description('Launch the localhost Web UI dashboard')
  .option('--port <number>', 'Server port', '3000')
  .option('--open', 'Automatically open browser', false)
  .action(async (opts) => {
    Logger.banner();
    const port = parseInt(opts.port, 10) || 3000;
    await startServer(port, opts.open);
  });

// Standalone Interactive TUI Subcommand
program
  .command('tui')
  .alias('interactive')
  .description('Launch interactive TUI to choose resumes, load profiles, and fine-tune options')
  .action(async () => {
    const tuiConfig = await InteractiveTui.run();
    await executeCurationPipeline({
      profileId: tuiConfig.profileId,
      resumePaths: tuiConfig.resumePaths,
      candidateName: tuiConfig.candidateName,
      boards: tuiConfig.boards,
      limit: tuiConfig.limitPerBoard,
      minScore: tuiConfig.minScore,
      workArrangements: tuiConfig.workArrangements,
      allowedLocations: tuiConfig.allowedLocations,
      serve: tuiConfig.launchWebUi,
      port: tuiConfig.port,
      open: true,
      usePlaywright: tuiConfig.usePlaywright,
    });
  });

// Scraper Circuit Breaker Health Subcommand
program
  .command('health')
  .description('Check circuit breaker health status of all scraping sources')
  .action(() => {
    Logger.banner();
    const report = ScraperFailureManager.getHealthReport();
    console.log(chalk.bold.cyan('🩺 Scraper Circuit Breaker Health Report:'));
    console.log(
      chalk.gray(
        '──────────────────────────────────────────────────────────────────────────────────'
      )
    );
    for (const [board, h] of Object.entries(report)) {
      let statusBadge = chalk.bgGreen.black.bold(' HEALTHY ');
      if (h.status === 'TEMPORARILY_DISABLED') {
        statusBadge = chalk.bgYellow.black.bold(' IN COOLDOWN ');
      } else if (h.status === 'PERMANENTLY_DISABLED') {
        statusBadge = chalk.bgRed.white.bold(' DISABLED ');
      }
      console.log(`• ${chalk.bold(board.padEnd(20))} ${statusBadge} Failures: ${h.totalFailures} (Consecutive: ${h.consecutiveFailures})`);
      if (h.disableReason) {
        console.log(`  ${chalk.yellow('Reason:')} ${h.disableReason}`);
      }
      if (h.disabledUntil && Date.now() < h.disabledUntil) {
        const remaining = Math.ceil((h.disabledUntil - Date.now()) / 60000);
        console.log(`  ${chalk.gray('Cooldown remaining:')} ~${remaining} minute(s) (until ${new Date(h.disabledUntil).toLocaleTimeString()})`);
      }
    }
    console.log(
      chalk.gray(
        '──────────────────────────────────────────────────────────────────────────────────'
      )
    );
    console.log(`Run ${chalk.cyan('job-curator reset-health')} to clear failure states.\n`);
  });

// Reset Circuit Breaker Subcommand
program
  .command('reset-health [board]')
  .description('Reset circuit breaker and re-enable all or specific scraping boards')
  .action((board) => {
    Logger.banner();
    ScraperFailureManager.reset(board as JobBoard | undefined);
  });

program.parse(process.argv);
