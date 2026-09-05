import { z } from 'zod';
import { JobListing } from './job.js';

export const RecommendationSchema = z.enum([
  'STRONG_MATCH',
  'MODERATE_MATCH',
  'WEAK_MATCH',
  'REJECT_CONSTRAINTS',
]);
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const HardConstraintCheckSchema = z.object({
  passed: z.boolean(),
  reason: z.string(),
});
export type HardConstraintCheck = z.infer<typeof HardConstraintCheckSchema>;

export const ScoreBreakdownSchema = z.object({
  technicalStackMatch: z.number().min(0).max(100),
  roleAndSeniorityMatch: z.number().min(0).max(100),
  projectAndExperienceMatch: z.number().min(0).max(100),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const ConstraintEvaluationSchema = z.object({
  locationCheck: HardConstraintCheckSchema,
  remoteCheck: HardConstraintCheckSchema,
  experienceCheck: HardConstraintCheckSchema,
  roleCheck: HardConstraintCheckSchema,
  salaryCheck: HardConstraintCheckSchema,
  dealbreakerCheck: HardConstraintCheckSchema.optional(),
  allPassed: z.boolean(),
});
export type ConstraintEvaluation = z.infer<typeof ConstraintEvaluationSchema>;

export const JobEvaluationSchema = z.object({
  jobId: z.string(),
  profileId: z.string(),
  matchScore: z.number().min(0).max(100),
  recommendation: RecommendationSchema,
  constraints: ConstraintEvaluationSchema,
  scoreBreakdown: ScoreBreakdownSchema.optional(),
  fitRationale: z.string().optional(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  strengths: z.array(z.string()),
  growthOpportunities: z.array(z.string()),
  redFlags: z.array(z.string()),
  tailoredApplicationPitch: z.array(z.string()),
  evaluatedAt: z.string(),
});
export type JobEvaluation = z.infer<typeof JobEvaluationSchema>;

export interface CuratedJob extends JobListing {
  evaluation: JobEvaluation;
}

export interface CandidateComparisonRank {
  profileId: string;
  candidateName: string;
  matchScore: number;
  recommendation: Recommendation;
  keyAdvantage: string;
  fitSummary: string;
}

export interface ProfileComparisonResult {
  jobId: string;
  jobTitle: string;
  company: string;
  rankings: CandidateComparisonRank[];
  topCandidateId: string;
  evaluationRationale: string;
}
