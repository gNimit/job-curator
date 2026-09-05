import { Type } from '@google/genai';
import { AIClient } from './client.js';
import { JobEvaluator } from './evaluator.js';
import { CandidatePersona } from '../types/profile.js';
import { JobListing } from '../types/job.js';
import { ProfileComparisonResult, CandidateComparisonRank } from '../types/evaluation.js';
import { Logger } from '../utils/logger.js';

export class AIProfileComparator {
  /**
   * Compare multiple candidate profiles against a specific job opportunity.
   */
  static async compareProfilesForJob(
    job: JobListing,
    profiles: CandidatePersona[]
  ): Promise<ProfileComparisonResult> {
    if (profiles.length === 0) {
      throw new Error('At least one candidate profile is required for comparison.');
    }

    // Step 1: Run individual evaluations
    const individualEvaluations = await Promise.all(
      profiles.map(async (profile) => {
        const evaluation = await JobEvaluator.evaluateJob(job, profile);
        return { profile, evaluation };
      })
    );

    // Step 2: Use Gemini for deep comparative synthesis if configured
    if (AIClient.isConfigured() && profiles.length > 1) {
      try {
        return await this.compareWithGemini(job, individualEvaluations);
      } catch (err: any) {
        Logger.warn(`Gemini comparison error: ${err.message}. Using structured heuristic comparison.`);
      }
    }

    // Fallback heuristic ranking
    const sorted = [...individualEvaluations].sort(
      (a, b) => b.evaluation.matchScore - a.evaluation.matchScore
    );

    const rankings: CandidateComparisonRank[] = sorted.map((item, idx) => ({
      profileId: item.profile.id,
      candidateName: item.profile.fullName,
      matchScore: item.evaluation.matchScore,
      recommendation: item.evaluation.recommendation,
      keyAdvantage:
        item.evaluation.strengths[0] ||
        `Strong technical skills in ${item.profile.technicalSkills.slice(0, 3).join(', ')}`,
      fitSummary: `Ranked #${idx + 1} with ${item.evaluation.matchScore}% match score. Constraints passed: ${item.evaluation.constraints.allPassed ? 'Yes' : 'No'}.`,
    }));

    return {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      rankings,
      topCandidateId: rankings[0]?.profileId || profiles[0].id,
      evaluationRationale: `${rankings[0]?.candidateName} ranks highest with an overall score of ${rankings[0]?.matchScore}%, demonstrating immediate technical fit and passing all hard constraints.`,
    };
  }

  private static async compareWithGemini(
    job: JobListing,
    items: Array<{ profile: CandidatePersona; evaluation: any }>
  ): Promise<ProfileComparisonResult> {
    const prompt = `Compare the following candidate profiles for the target job opportunity and rank them from best fit to lowest fit.

TARGET JOB:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location} (Remote: ${job.isRemote})
- Description: ${job.description}

CANDIDATES:
${items
  .map(
    (item, i) => `
[Candidate ${i + 1}] ID: ${item.profile.id}
Name: ${item.profile.fullName}
Title: ${item.profile.headline}
Experience: ${item.profile.yearsOfExperience} years
Skills: ${item.profile.technicalSkills.join(', ')}
Individual Score: ${item.evaluation.matchScore}%
`
  )
  .join('\n')}

INSTRUCTIONS:
1. Provide a ranked list of candidates based on holistic match, culture/domain fit, and technical superiority for this specific role.
2. For each candidate explain their keyAdvantage and fitSummary.
3. Select the topCandidateId and provide an executive evaluationRationale.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        rankings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              profileId: { type: Type.STRING },
              candidateName: { type: Type.STRING },
              matchScore: { type: Type.NUMBER },
              recommendation: {
                type: Type.STRING,
                enum: ['STRONG_MATCH', 'MODERATE_MATCH', 'WEAK_MATCH', 'REJECT_CONSTRAINTS'],
              },
              keyAdvantage: { type: Type.STRING },
              fitSummary: { type: Type.STRING },
            },
            required: ['profileId', 'candidateName', 'matchScore', 'recommendation', 'keyAdvantage', 'fitSummary'],
          },
        },
        topCandidateId: { type: Type.STRING },
        evaluationRationale: { type: Type.STRING },
      },
      required: ['rankings', 'topCandidateId', 'evaluationRationale'],
    };

    const systemInstruction =
      'You are a Chief Talent Officer. Compare candidates objectively and rank them with rigorous strategic hiring rationale.';

    const res = await AIClient.generateStructuredJson<any>(prompt, schema, systemInstruction);

    return {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      rankings: res.rankings,
      topCandidateId: res.topCandidateId || items[0].profile.id,
      evaluationRationale: res.evaluationRationale,
    };
  }
}
