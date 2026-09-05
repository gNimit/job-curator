import { z } from 'zod';

export const JobBoardSchema = z.enum(['web3.career', 'foorilla.com', 'cryptojobslist.com']);
export type JobBoard = z.infer<typeof JobBoardSchema>;

export const JobListingSchema = z.object({
  id: z.string(),
  board: JobBoardSchema,
  title: z.string(),
  company: z.string(),
  companyUrl: z.string().optional(),
  location: z.string(),
  isRemote: z.boolean().default(false),
  salary: z.string().optional(),
  salaryUSDMin: z.number().optional(),
  salaryUSDMax: z.number().optional(),
  url: z.string().url(),
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
  postedAt: z.string().optional(),
  scrapedAt: z.string(),
});
export type JobListing = z.infer<typeof JobListingSchema>;

export interface ScrapeOptions {
  keywords?: string[];
  roles?: string[];
  locations?: string[];
  remoteOnly?: boolean;
  limit?: number;
  usePlaywright?: boolean;
}
