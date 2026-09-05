import { CuratedJob } from '../types/evaluation.js';

export class JsonExporter {
  static toJson(jobs: CuratedJob[], pretty = true): string {
    return JSON.stringify(jobs, null, pretty ? 2 : 0);
  }
}
