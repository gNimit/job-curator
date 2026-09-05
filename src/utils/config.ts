import dotenv from 'dotenv';
import path from 'path';

// Load .env from current working directory or app root
dotenv.config();

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
  geminiMaxConcurrency: parseInt(process.env.GEMINI_MAX_CONCURRENCY || '2', 10),
  geminiRequestIntervalMs: parseInt(process.env.GEMINI_REQUEST_INTERVAL_MS || '1200', 10),
  geminiMaxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10),
  resumesDir: path.resolve(process.cwd(), 'resumes'),
  profilesDir: path.resolve(process.cwd(), 'profiles'),
  scraperUserAgent:
    process.env.SCRAPER_USER_AGENT ||
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  scraperTimeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10),
  defaultPort: parseInt(process.env.PORT || '3000', 10),
};
