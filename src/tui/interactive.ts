import { checkbox, select, input, number, confirm, Separator } from '@inquirer/prompts';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { ResumeReader } from '../resume/reader.js';
import { ProfileManager } from '../profile/manager.js';
import { ScraperFailureManager } from '../scrapers/failure-manager.js';
import { JobBoard } from '../types/job.js';
import { config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

export interface TuiConfig {
  mode: 'new_profile' | 'existing_profile';
  resumePaths?: string[];
  candidateName?: string;
  profileId?: string;
  boards: JobBoard[];
  limitPerBoard: number;
  minScore: number;
  workArrangements?: Array<'remote' | 'hybrid' | 'onsite'>;
  allowedLocations?: string[];
  launchWebUi: boolean;
  port: number;
  usePlaywright: boolean;
}

export class InteractiveTui {
  static async run(): Promise<TuiConfig> {
    Logger.banner();
    console.log(chalk.bold.cyan('🎯 Interactive Career Intelligence Setup & Options Tuning'));
    console.log(chalk.gray('Customize your candidate persona sources, scraping boards, and hard constraints.\n'));

    // Step 1: Choose Source Mode
    const sourceChoice = await select({
      message: 'Choose candidate source:',
      choices: [
        {
          name: '📄 Select one or multiple resumes from ./resumes/ folder',
          value: 'resumes_folder',
        },
        {
          name: '💾 Load an existing saved profile from ./profiles/',
          value: 'saved_profile',
        },
        {
          name: '🔍 Enter a custom resume file path',
          value: 'custom_path',
        },
      ],
    });

    let mode: 'new_profile' | 'existing_profile' = 'new_profile';
    let resumePaths: string[] = [];
    let profileId: string | undefined = undefined;
    let candidateName: string | undefined = undefined;

    if (sourceChoice === 'saved_profile') {
      mode = 'existing_profile';
      const existingProfiles = await ProfileManager.listProfiles();
      if (existingProfiles.length === 0) {
        Logger.warn('No saved profiles found in ./profiles/. Switching to resume selection.');
        mode = 'new_profile';
      } else {
        profileId = await select({
          message: 'Select saved candidate profile to curate:',
          choices: existingProfiles.map((p) => ({
            name: `${p.fullName} (${p.headline}) - [ID: ${p.id}]`,
            value: p.id,
          })),
        });
      }
    }

    if (sourceChoice === 'resumes_folder' || (sourceChoice === 'saved_profile' && mode === 'new_profile')) {
      mode = 'new_profile';
      const foundResumes = ResumeReader.listResumes(config.resumesDir);
      if (foundResumes.length === 0) {
        Logger.error(`No resumes found in ${config.resumesDir}.`);
        const manualPath = await input({
          message: 'Enter absolute or relative path to resume PDF:',
          validate: (val) => fs.existsSync(val) || 'File does not exist',
        });
        resumePaths = [manualPath];
      } else {
        resumePaths = await checkbox({
          message: 'Select one or multiple resumes to synthesize into a master profile (Space to select, Enter to confirm):',
          choices: foundResumes.map((r) => {
            const basename = path.basename(r);
            const stats = fs.statSync(r);
            const sizeKb = (stats.size / 1024).toFixed(0);
            return {
              name: `${basename} (${sizeKb} KB)`,
              value: r,
              checked: true,
            };
          }),
          validate: (selected) => selected.length > 0 || 'You must select at least one resume',
        });

        if (resumePaths.length > 1) {
          const customNamePrompt = await input({
            message: 'Candidate full name for this unified profile (optional, press Enter to auto-detect):',
            default: '',
          });
          if (customNamePrompt.trim()) {
            candidateName = customNamePrompt.trim();
          }
        }
      }
    } else if (sourceChoice === 'custom_path') {
      mode = 'new_profile';
      const customPath = await input({
        message: 'Enter resume path (or comma-separated paths for multiple resumes):',
        validate: (val) => {
          const parts = val.split(',').map((s) => s.trim());
          const missing = parts.filter((p) => !fs.existsSync(p));
          return missing.length === 0 || `Cannot find: ${missing.join(', ')}`;
        },
      });
      resumePaths = customPath.split(',').map((s) => s.trim());
    }

    // Step 2: Scraper Failure Health Check & Options
    const healthReport = ScraperFailureManager.getHealthReport();
    const disabledBoards = (Object.keys(healthReport) as JobBoard[]).filter(
      (b) => healthReport[b].status !== 'HEALTHY'
    );

    if (disabledBoards.length > 0) {
      console.log();
      console.log(chalk.bold.yellow('⚠ Scraper Circuit Breaker Notice:'));
      for (const b of disabledBoards) {
        const info = healthReport[b];
        console.log(
          `  • ${chalk.bold(b)}: ${info.status} (${info.disableReason || 'rate limit cooldown'})`
        );
      }

      const shouldReset = await confirm({
        message: 'Reset circuit breaker and re-enable all boards now?',
        default: true,
      });

      if (shouldReset) {
        ScraperFailureManager.reset();
      }
    }

    // Step 3: Fine-Tune Options Field
    console.log();
    console.log(chalk.bold.cyan('⚙️ Options Field: Fine-Tuning Scraper & Hard Constraints'));

    // Board selection
    const latestHealth = ScraperFailureManager.getHealthReport();
    const defaultBoardChoices = [
      {
        name: `web3.career [${latestHealth['web3.career'].status}]`,
        value: 'web3.career' as JobBoard,
        checked: latestHealth['web3.career'].status === 'HEALTHY',
      },
      {
        name: `foorilla.com [${latestHealth['foorilla.com'].status}]`,
        value: 'foorilla.com' as JobBoard,
        checked: latestHealth['foorilla.com'].status === 'HEALTHY',
      },
      {
        name: `cryptojobslist.com [${latestHealth['cryptojobslist.com'].status}]`,
        value: 'cryptojobslist.com' as JobBoard,
        checked: latestHealth['cryptojobslist.com'].status === 'HEALTHY',
      },
    ];

    const boards = await checkbox({
      message: 'Select target job boards to scrape:',
      choices: defaultBoardChoices,
      validate: (selected) => selected.length > 0 || 'Select at least one job board',
    });

    // Work arrangement preference
    const arrangementChoice = await select({
      message: 'Work arrangement constraint:',
      choices: [
        { name: '🌐 Strictly Remote Only', value: 'remote' },
        { name: '🏢 Hybrid & Remote Allowed', value: 'hybrid' },
        { name: '🌍 Any (Remote, Hybrid, Onsite)', value: 'any' },
      ],
    });

    let workArrangements: Array<'remote' | 'hybrid' | 'onsite'> = ['remote'];
    if (arrangementChoice === 'hybrid') {
      workArrangements = ['remote', 'hybrid'];
    } else if (arrangementChoice === 'any') {
      workArrangements = ['remote', 'hybrid', 'onsite'];
    }

    // Limit per board
    const limitPerBoard = await number({
      message: 'Scraping limit per board (jobs to retrieve):',
      default: 15,
      min: 3,
      max: 100,
    });

    // Min score threshold
    const minScore = await number({
      message: 'Minimum AI match score threshold (0-100%):',
      default: 60,
      min: 0,
      max: 100,
    });

    // Web UI launch
    const launchWebUi = await confirm({
      message: 'Launch interactive localhost Web UI after curation?',
      default: true,
    });

    let port = 3000;
    if (launchWebUi) {
      port =
        (await number({
          message: 'Web UI port number:',
          default: 3000,
          min: 1024,
          max: 65535,
        })) || 3000;
    }

    // Playwright headless fallback
    const usePlaywright = await confirm({
      message: 'Enable headless Playwright fallback for SPA/Cloudflare boards?',
      default: true,
    });

    // Summary confirmation
    console.log();
    console.log(chalk.bold.green('📋 Curation Plan Summary:'));
    if (mode === 'existing_profile') {
      console.log(`   ${chalk.gray('•')} Source: Existing profile "${chalk.cyan(profileId)}"`);
    } else {
      console.log(`   ${chalk.gray('•')} Source: ${resumePaths.length} resume(s) (${resumePaths.map((p) => path.basename(p)).join(', ')})`);
    }
    console.log(`   ${chalk.gray('•')} Target Boards: ${chalk.white(boards.join(', '))}`);
    console.log(`   ${chalk.gray('•')} Work Arrangement: ${chalk.white(workArrangements.join(', '))}`);
    console.log(`   ${chalk.gray('•')} Limit: ${chalk.white(limitPerBoard)} jobs/board | Min Score: ${chalk.white(minScore)}%`);
    console.log(`   ${chalk.gray('•')} Web UI: ${launchWebUi ? chalk.green(`http://localhost:${port}`) : chalk.gray('Disabled')}`);
    console.log();

    const proceed = await confirm({
      message: 'Ready to execute curation pipeline?',
      default: true,
    });

    if (!proceed) {
      Logger.info('Curation cancelled by user.');
      process.exit(0);
    }

    return {
      mode,
      resumePaths,
      candidateName,
      profileId,
      boards,
      limitPerBoard: limitPerBoard || 15,
      minScore: minScore || 60,
      workArrangements,
      launchWebUi,
      port,
      usePlaywright,
    };
  }
}
