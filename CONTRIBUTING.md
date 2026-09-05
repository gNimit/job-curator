# Contributing to JobCurator ⚡

Thank you for your interest in contributing to JobCurator! We welcome contributions from the community to help make technical career curation faster, smarter, and more autonomous.

## 🛠️ Development Setup

1. **Prerequisites**:
   - Node.js v20 or higher
   - npm v10 or higher
   - Google Gemini API key (optional for local heuristic testing, required for LLM evaluation)

2. **Clone & Install**:
   ```bash
   git clone https://github.com/your-username/job-curator.git
   cd job-curator
   npm install
   npx playwright install chromium
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY if desired
   ```

4. **Run in Development**:
   ```bash
   # Zero-compile execution with tsx
   npm start -- run --profile alex-chen --no-serve
   ```

5. **Run Tests & Typecheck**:
   ```bash
   npm test
   npm run typecheck
   ```

## 🏗️ Architecture Guidelines

- **Zero Compile Overhead**: Keep `tsx` compatibility clean and avoid circular dependencies.
- **Scraper Safety**: Ensure scrapers handle HTTP rate limits politely, rotate user agents if necessary, and use Playwright pool as fallback for client-rendered SPA boards.
- **AI Structured Outputs**: When updating Gemini prompts or schemas, always use official `@google/genai` type definitions and schemas (`Type.OBJECT`, `Type.ARRAY`, `Type.STRING`, etc.) with `responseMimeType: "application/json"`.
- **Hard Constraints**: Ensure hard constraints logic strictly checks locations, work arrangements, role titles, and dealbreakers.

## 🤝 Submitting Pull Requests

1. Fork the repository and create a new feature branch (`git checkout -b feature/amazing-feature`).
2. Ensure all tests pass (`npm test`) and typechecking is clean (`npm run typecheck`).
3. Commit your changes with clear messages.
4. Push to your fork and submit a Pull Request.

## 📜 License
By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
