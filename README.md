# JobCurator ⚡

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google Gemini API](https://img.shields.io/badge/Google%20Gemini-SDK%20v2-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Vitest](https://img.shields.io/badge/Tests-Vitest%20Passed-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

> **High-performance, single-command CLI in TypeScript that scrapes dynamic job boards, parses active listings, filters them with Google Gemini AI structured outputs against fixed candidate hard constraints, and exports verified matching jobs to CSV, JSON, and an interactive localhost Web UI.**

---

## 🌟 Key Features

- 📄 **PDF Resume Ingestion & Persona Formulation**: Reads candidate resumes in PDF format from a dedicated `resumes/` folder to automatically construct a structured candidate persona, skillset map, and search constraints.
- 🎯 **Strict Hard Constraints Verification**: Verifies candidate requirements (locations, work arrangement: remote/hybrid/onsite, seniority, minimum salary, dealbreaker keywords) before matching.
- 🌐 **Dynamic Profile-Driven Multi-Board Scraping**: Dynamically searches across top job boards:
  - **web3.career**: Direct Cheerio extraction + dynamic query targeting + Playwright fallback.
  - **foorilla.com**: High-throughput HTMX live stream extraction.
  - **cryptojobslist.com**: Sitemap ingestion + Schema.org `JobPosting` JSON-LD parsing + headless Playwright fallback for Cloudflare/bot-protected pages.
- 🤖 **Google Gemini Structured Output Engine**: Utilizes `@google/genai` with strict JSON Schema outputs to calculate match scores (0–100), identify skill synergies, highlight red flags, and generate tailored application pitches for cover letters.
- 👥 **AI Cross-Profile Comparison**: Compare multiple candidate profiles against any role to rank fits, contrast advantages, and identify the #1 candidate.
- 📁 **Profile-Isolated Storage**: Curated listings and evaluations are automatically saved inside each candidate's dedicated folder (`profiles/<profile-id>/jobs.json` and `jobs.csv`).
- 📊 **Localhost Web UI Dashboard**: Interactive dark-mode dashboard running on `http://localhost:3000` with profile switching, live search & filtering, match score badges, and one-click pitch copying.

---

## 🏛️ System Architecture

```
                                  ┌─────────────────────────────┐
                                  │   resumes/<candidate>.pdf   │
                                  └──────────────┬──────────────┘
                                                 │
                                         [ResumeReader]
                                                 │
                                                 ▼
                                     [PersonaBuilder + Gemini]
                                                 │
                                                 ▼
                                ┌────────────────────────────────┐
                                │   profiles/<id>/profile.json   │
                                │   (Persona + Hard Constraints) │
                                └────────────────┬───────────────┘
                                                 │
                             ┌───────────────────┴───────────────────┐
                             │ Dynamic Search Queries & Roles Filter │
                             └───────────────────┬───────────────────┘
                                                 │
                     ┌───────────────────────────┼───────────────────────────┐
                     ▼                           ▼                           ▼
            [web3.career]                 [foorilla.com]            [cryptojobslist.com]
          (Cheerio / Dynamic)           (HTMX / Top Jobs)          (Sitemap / Playwright)
                     │                           │                           │
                     └───────────────────────────┼───────────────────────────┘
                                                 │
                                       [ScraperOrchestrator]
                                      (Deduplicate & Normalize)
                                                 │
                                                 ▼
                                    [JobEvaluator + Gemini AI]
                                  (Hard Constraints + 0-100 Fit)
                                                 │
                         ┌───────────────────────┴───────────────────────┐
                         ▼                                               ▼
         ┌───────────────────────────────┐               ┌───────────────────────────────┐
         │ profiles/<id>/jobs.csv & json │               │      Localhost Web UI         │
         │ (Verified Curated Jobs Export)│               │    http://localhost:3000      │
         └───────────────────────────────┘               └───────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20 or higher (`node -v`)
- **npm**: v10 or higher (`npm -v`)

### 2. Installation
```bash
git clone https://github.com/your-username/job-curator.git
cd job-curator
npm install
npx playwright install chromium
```

### 3. Setup Gemini API Key
Copy the example environment configuration:
```bash
cp .env.example .env
```
Add your Gemini API Key in `.env`:
```env
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```
*(Note: If no API key is provided, JobCurator automatically runs in deterministic heuristic mode so you can test all features and workflows immediately).*

### 4. Single-Command Execution
Run the entire end-to-end pipeline with one command:
```bash
npx tsx src/cli.ts run
```
Or with built binary:
```bash
npm run build
npm start
```

This single command will:
1. Scan `./resumes/` and extract the candidate persona and hard constraints.
2. Save the candidate profile to `./profiles/<profile-id>/profile.json`.
3. Dynamically query `web3.career`, `foorilla.com`, and `cryptojobslist.com` based on candidate skills and target roles.
4. Run Gemini AI structured evaluations against hard constraints.
5. Export verified matching jobs to `./profiles/<profile-id>/jobs.json` and `jobs.csv`.
6. Launch the interactive dashboard at `http://localhost:3000`!

---

## 💻 CLI Commands & Options

### `job-curator run` (Default)
Executes the full pipeline:
```bash
npx tsx src/cli.ts run [options]

Options:
  -r, --resume <path>     Path to resume PDF file (defaults to first in ./resumes)
  --resumes <paths>       Comma-separated paths to multiple resume PDFs to merge into one profile
  --all-resumes           Merge all resumes found in ./resumes/ folder into a single master profile
  --name <name>           Candidate name override for the unified profile
  -p, --profile <id>      Use existing profile ID instead of re-parsing resume
  -b, --boards <boards>   Comma-separated boards (default: web3.career,foorilla.com,cryptojobslist.com)
  -l, --limit <number>    Maximum jobs to scrape per board (default: 20)
  -m, --min-score <n>     Minimum match score threshold (default: 60)
  --port <number>         Web UI dashboard port (default: 3000)
  --no-serve              Skip launching the localhost Web UI
  --no-open               Do not automatically open browser window
```

### Profile Management (Single & Multi-Resume Synthesis)
```bash
# 1. Merge ALL resumes in ./resumes/ into a single master candidate profile:
npx tsx src/cli.ts profile create --all-resumes

# 2. Merge specific multiple resumes (e.g. Enterprise, Web3, Backend versions):
npx tsx src/cli.ts profile create \
  --resumes resumes/alex-chen-backend.pdf,resumes/alex-chen-web3.pdf \
  --name "Alex Chen"

# 3. Create persona from a single resume PDF:
npx tsx src/cli.ts profile create --resume resumes/alex-chen-swe.pdf

# 4. List all saved candidate profiles:
npx tsx src/cli.ts profile list

# 5. Inspect a profile's constraints and details:
npx tsx src/cli.ts profile show alex-chen
```

### AI Cross-Profile Comparison
Compare and rank multiple candidate profiles against a specific role:
```bash
npx tsx src/cli.ts compare \
  --job-title "Senior Rust Infrastructure Engineer" \
  --company "Paradigm Labs" \
  --profiles alex-chen,sarah-connor
```

### Standalone Scraping & Dashboard
```bash
# Run dynamic scraper for a profile
npx tsx src/cli.ts scrape --profile alex-chen --limit 15

# Launch the Web UI dashboard
npx tsx src/cli.ts serve --port 3000
```

---

## 🖥️ Localhost Web UI Dashboard

Start the web dashboard at `http://localhost:3000`:
```bash
npx tsx src/cli.ts serve
```

### Features:
- 🔄 **Profile Switcher**: Effortlessly switch between multiple candidate profiles stored in `profiles/`.
- ⚡ **Live Curate Trigger**: Trigger dynamic multi-board scraping directly from the UI with real-time feedback.
- 📥 **Export Buttons**: Download verified jobs in RFC 4180 CSV or structured JSON format.
- 🎯 **Hard Constraints Status**: At-a-glance checklist of verified criteria (Location, Remote arrangement, Role alignment, Experience).
- 🏷️ **Match Score Badges**:
  - `≥ 80%`: **Strong Match** (Emerald green badge)
  - `≥ 60%`: **Moderate Match** (Amber badge)
  - `< 60%`: **Weak Match** (Gray badge)
  - `Failed`: **Constraints Rejected** (Red badge)
- 📋 **AI Tailored Pitch**: Pre-generated custom bullet points ready to copy directly into cover letters or introductory messages.
- 🔍 **Live Search & Filters**: Filter by match recommendation, board source, or search across company, title, and matched technologies.

---

## 📂 Project Structure

```
job-curator/
├── package.json               # Package configuration, bin executable & scripts
├── tsconfig.json              # TypeScript strict configuration
├── vitest.config.ts           # Vitest unit & integration test configuration
├── .env.example               # Template environment configuration
├── LICENSE                    # MIT License
├── resumes/                   # Dedicated folder for user PDF resumes
│   ├── alex-chen-senior-blockchain-engineer.pdf
│   └── sarah-connor-rust-distributed-systems.pdf
├── profiles/                  # Profile-isolated storage
│   └── alex-chen/
│       ├── profile.json       # Candidate persona & hard constraints
│       ├── jobs.json          # Curated matching jobs
│       └── jobs.csv           # RFC 4180 verified CSV export
├── src/
│   ├── cli.ts                 # Commander CLI entrypoint
│   ├── index.ts               # Programmatic library exports
│   ├── ai/
│   │   ├── client.ts          # Google GenAI SDK wrapper
│   │   ├── evaluator.ts       # Structured output job evaluator
│   │   └── comparator.ts      # Multi-profile AI comparison engine
│   ├── resume/
│   │   ├── reader.ts          # PDF text extraction & directory scanner
│   │   └── persona-builder.ts # Gemini structured persona extractor
│   ├── scrapers/
│   │   ├── base.ts            # Base scraper with retry & Playwright fallback
│   │   ├── playwright-pool.ts # Headless Chromium pool manager
│   │   ├── web3-career.ts     # web3.career dynamic scraper
│   │   ├── foorilla.ts        # foorilla.com HTMX scraper
│   │   ├── cryptojobslist.ts  # cryptojobslist.com sitemap & JSON-LD scraper
│   │   └── index.ts           # Scraper orchestrator & deduplicator
│   ├── profile/
│   │   └── manager.ts         # Profile & curated job persistence
│   ├── exporters/
│   │   ├── csv.ts             # RFC 4180 CSV serializer
│   │   └── json.ts            # JSON serializer
│   ├── server/
│   │   ├── app.ts             # Express REST API server
│   │   └── public/            # Dashboard web UI (HTML / CSS / JS)
│   ├── types/                 # Zod schemas & TypeScript definitions
│   └── utils/                 # Logging, Ora spinners, and chalk styling
└── tests/                     # Vitest test suite
```

---

## 🧪 Testing

Run the automated test suite:
```bash
npm test
```

Typecheck TypeScript codebase:
```bash
npm run typecheck
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
