import fs from 'fs';
import path from 'path';

export interface ParsedResumeText {
  filename: string;
  filePath: string;
  rawText: string;
  pageCount: number;
}

export class ResumeReader {
  /**
   * Parse a single resume file (PDF, TXT, MD) and return clean plain text.
   */
  static async parseFile(filePath: string): Promise<ParsedResumeText> {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Resume file not found: ${filePath}`);
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const filename = path.basename(resolvedPath);

    if (ext === '.txt' || ext === '.md') {
      const rawText = fs.readFileSync(resolvedPath, 'utf-8');
      return {
        filename,
        filePath: resolvedPath,
        rawText: rawText.trim(),
        pageCount: 1,
      };
    }

    if (ext === '.pdf') {
      const buffer = fs.readFileSync(resolvedPath);
      try {
        const pdfModule = (await import('pdf-parse')) as any;
        // Handle PDFParse class from pdf-parse v2
        const PDFParseClass =
          pdfModule.PDFParse ||
          pdfModule.default?.PDFParse ||
          (typeof pdfModule.default === 'function' ? pdfModule.default : null);

        if (PDFParseClass && typeof PDFParseClass === 'function') {
          const parser = new PDFParseClass({ data: buffer });
          const parsed = await parser.getText();
          const cleanText = (parsed.text || '')
            .replace(/-- \d+ of \d+ --/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();

          return {
            filename,
            filePath,
            rawText: cleanText,
            pageCount: parsed.total || 1,
          };
        } else if (typeof pdfModule.default === 'function') {
          // pdf-parse v1 style
          const data = await pdfModule.default(buffer);
          return {
            filename,
            filePath,
            rawText: (data.text || '').trim(),
            pageCount: data.numpages || 1,
          };
        }
      } catch (err: any) {
        throw new Error(`Failed to parse PDF resume (${filename}): ${err.message}`);
      }
    }

    throw new Error(`Unsupported resume file format: ${ext}. Please use PDF, TXT, or MD.`);
  }

  /**
   * Scan dedicated resume directory and return list of resumes found.
   */
  static listResumes(resumesDir: string): string[] {
    if (!fs.existsSync(resumesDir)) {
      fs.mkdirSync(resumesDir, { recursive: true });
      return [];
    }

    return fs
      .readdirSync(resumesDir)
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ['.pdf', '.txt', '.md'].includes(ext);
      })
      .map((file) => path.join(resumesDir, file));
  }

  /**
   * Parse multiple resume files and return array of parsed results.
   */
  static async parseMultipleFiles(filePaths: string[]): Promise<ParsedResumeText[]> {
    const results: ParsedResumeText[] = [];
    for (const file of filePaths) {
      const parsed = await this.parseFile(file);
      results.push(parsed);
    }
    return results;
  }

  /**
   * Combine multiple parsed resume texts into a structured multi-source document.
   */
  static combineResumeTexts(resumes: ParsedResumeText[]): string {
    return resumes
      .map(
        (r, idx) =>
          `=== RESUME SOURCE ${idx + 1}: ${r.filename} ===\n${r.rawText}`
      )
      .join('\n\n');
  }
}

