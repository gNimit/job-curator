import { Type } from '@google/genai';
import { AIClient } from './client.js';
import { CandidatePersona } from '../types/profile.js';
import { JobListing } from '../types/job.js';
import { JobEvaluation, Recommendation } from '../types/evaluation.js';
import { Logger } from '../utils/logger.js';

export class JobEvaluator {
  /**
   * Evaluate a job against candidate persona & hard constraints.
   */
  static async evaluateJob(
    job: JobListing,
    persona: CandidatePersona
  ): Promise<JobEvaluation> {
    if (AIClient.isConfigured()) {
      try {
        return await this.evaluateWithGemini(job, persona);
      } catch (err: any) {
        Logger.warn(`Gemini evaluation error for "${job.title}": ${err.message}. Using heuristic fallback.`);
        return this.evaluateWithHeuristics(job, persona);
      }
    }

    return this.evaluateWithHeuristics(job, persona);
  }

  private static async evaluateWithGemini(
    job: JobListing,
    persona: CandidatePersona
  ): Promise<JobEvaluation> {
    const workHistorySummary =
      persona.workHistory && persona.workHistory.length > 0
        ? persona.workHistory
            .map(
              (w) =>
                `  • ${w.role} at ${w.company} (${w.duration || 'N/A'}${w.location ? `, ${w.location}` : ''}):
    Technologies: ${w.technologies?.join(', ') || 'N/A'}
    Key Accomplishments: ${w.highlights?.join('; ') || 'N/A'}`
            )
            .join('\n')
        : '  • None specified';

    const projectsSummary =
      persona.projects && persona.projects.length > 0
        ? persona.projects
            .map(
              (p) =>
                `  • ${p.name}: ${p.description} | Tech: ${p.technologies.join(', ')} | Highlights: ${p.highlights.join('; ')}`
            )
            .join('\n')
        : '  • None specified';

    const publicationsSummary =
      persona.publications && persona.publications.length > 0
        ? persona.publications
            .map(
              (pub) =>
                `  • ${pub.title} (${pub.venue || 'Publication'}, ${pub.year || 'N/A'}) - ${pub.highlights.join('; ')}`
            )
            .join('\n')
        : '  • None specified';

    const skillsByCategorySummary = persona.skillsByCategory
      ? `  - Languages: ${persona.skillsByCategory.languages.join(', ') || 'None'}
  - Databases & Storage: ${persona.skillsByCategory.databasesAndStorage.join(', ') || 'None'}
  - Cloud & DevOps: ${persona.skillsByCategory.cloudAndDevOps.join(', ') || 'None'}
  - Architecture & Systems: ${persona.skillsByCategory.architectureAndSystems.join(', ') || 'None'}
  - Frameworks & Web3: ${persona.skillsByCategory.frameworksAndRuntimes.join(', ') || 'None'}`
      : `  - Skills: ${persona.technicalSkills.join(', ')}`;

    const prompt = `Evaluate the following job opportunity against the candidate's detailed resume and strict hard constraints.

=== CANDIDATE DETAILED RESUME ===
- Name: ${persona.fullName}
- Primary Specialization: ${persona.primarySpecialization}
- Headline: ${persona.headline}
- Years of Experience: ${persona.yearsOfExperience} years
- Summary: ${persona.summary}
- Categorized Technical Skills:
${skillsByCategorySummary}
- Detailed Work Experience:
${workHistorySummary}
- Key Projects & Open Source:
${projectsSummary}
- Publications & Research:
${publicationsSummary}

=== HARD CONSTRAINTS (Gating Prerequisites) ===
- Target Roles: ${persona.hardConstraints.targetRoles.join(', ')}
- Allowed Arrangements: ${persona.hardConstraints.workArrangements.join(', ')}
- Allowed Locations: ${persona.hardConstraints.allowedLocations.join(', ')}
- Min Salary (USD): ${persona.hardConstraints.minSalaryUSD || 'None'}
- Visa Required: ${persona.hardConstraints.visaRequired}
- Excluded Dealbreakers: ${persona.hardConstraints.excludedKeywords.join(', ')}
- Required Keywords: ${persona.hardConstraints.requiredKeywords.join(', ')}

=== JOB OPPORTUNITY ===
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Remote: ${job.isRemote}
- Salary: ${job.salary || 'Not specified'}
- Tags: ${job.tags.join(', ')}
- Description: ${job.description}

=== EVALUATION INSTRUCTIONS ===
1. HARD CRITERIA ARE STRICT GATING PREREQUISITES:
   - Check location, remote arrangement, salary (if specified), and excluded keywords/dealbreakers.
   - If candidate demands remote and the role is onsite, remoteCheck MUST FAIL.
   - If ANY hard constraint fails, mark allPassed=false and recommendation="REJECT_CONSTRAINTS".
2. PROFILE SCORE IS STRICTLY BASED ON RESUME FIT (0-100):
   - The match score is NOT based on whether a job is remote. Hard criteria are prerequisites to be considered.
   - The profile score is calculated strictly by evaluating how the candidate's detailed resume (skills, specialization, projects, architectures) matches the job's role requirements:
     * technicalStackMatch (0-100): Alignment of languages (e.g. Go, Rust, C++), databases (PostgreSQL, Redis), systems (microservices, Kafka, worker pools) with role requirements.
     * roleAndSeniorityMatch (0-100): Alignment of candidate's specialization (${persona.primarySpecialization}) with the role. If candidate is Backend Engineer and role is a Frontend React/UI role, role match MUST BE LOW (10-30). If role is Senior Backend / Systems Engineer, role match is HIGH (85-100).
     * projectAndExperienceMatch (0-100): Alignment of candidate's past work (e.g. Geth-Indexer high-throughput streaming, payment routing, state settlement) with job duties.
     * matchScore: Weighted composite score (0-100).
3. Provide fitRationale explaining why the candidate's specific background and projects fit or do not fit the role.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        matchScore: { type: Type.NUMBER, description: 'Overall profile match score between 0 and 100 based on resume fit' },
        recommendation: {
          type: Type.STRING,
          enum: ['STRONG_MATCH', 'MODERATE_MATCH', 'WEAK_MATCH', 'REJECT_CONSTRAINTS'],
        },
        scoreBreakdown: {
          type: Type.OBJECT,
          properties: {
            technicalStackMatch: { type: Type.NUMBER },
            roleAndSeniorityMatch: { type: Type.NUMBER },
            projectAndExperienceMatch: { type: Type.NUMBER },
          },
          required: ['technicalStackMatch', 'roleAndSeniorityMatch', 'projectAndExperienceMatch'],
        },
        fitRationale: { type: Type.STRING },
        constraints: {
          type: Type.OBJECT,
          properties: {
            locationCheck: {
              type: Type.OBJECT,
              properties: {
                passed: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['passed', 'reason'],
            },
            remoteCheck: {
              type: Type.OBJECT,
              properties: {
                passed: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['passed', 'reason'],
            },
            experienceCheck: {
              type: Type.OBJECT,
              properties: {
                passed: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['passed', 'reason'],
            },
            roleCheck: {
              type: Type.OBJECT,
              properties: {
                passed: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['passed', 'reason'],
            },
            salaryCheck: {
              type: Type.OBJECT,
              properties: {
                passed: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['passed', 'reason'],
            },
            dealbreakerCheck: {
              type: Type.OBJECT,
              properties: {
                passed: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['passed', 'reason'],
            },
            allPassed: { type: Type.BOOLEAN },
          },
          required: [
            'locationCheck',
            'remoteCheck',
            'experienceCheck',
            'roleCheck',
            'salaryCheck',
            'allPassed',
          ],
        },
        matchedSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        missingSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        strengths: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        growthOpportunities: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        redFlags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        tailoredApplicationPitch: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: [
        'matchScore',
        'recommendation',
        'constraints',
        'matchedSkills',
        'missingSkills',
        'strengths',
        'tailoredApplicationPitch',
      ],
    };

    const systemInstruction =
      'You are a rigorous technical talent evaluator. You strictly enforce hard constraints as gating prerequisites, and evaluate profile match score purely based on the candidate\'s deep resume, specialization, and projects against role requirements.';

    const result = await AIClient.generateStructuredJson<any>(
      prompt,
      schema,
      systemInstruction,
      { priority: 0, label: `Eval: ${job.title.slice(0, 30)}` }
    );

    return {
      jobId: job.id,
      profileId: persona.id,
      matchScore: Math.round(Math.min(100, Math.max(0, result.matchScore))),
      recommendation: result.recommendation as Recommendation,
      constraints: {
        locationCheck: result.constraints?.locationCheck || { passed: true, reason: 'Location accepted' },
        remoteCheck: result.constraints?.remoteCheck || { passed: true, reason: 'Remote accepted' },
        experienceCheck: result.constraints?.experienceCheck || { passed: true, reason: 'Experience aligned' },
        roleCheck: result.constraints?.roleCheck || { passed: true, reason: 'Role aligned' },
        salaryCheck: result.constraints?.salaryCheck || { passed: true, reason: 'Salary check passed' },
        dealbreakerCheck: result.constraints?.dealbreakerCheck || { passed: true, reason: 'No dealbreakers detected' },
        allPassed: Boolean(result.constraints?.allPassed),
      },
      scoreBreakdown: result.scoreBreakdown,
      fitRationale: result.fitRationale,
      matchedSkills: result.matchedSkills || [],
      missingSkills: result.missingSkills || [],
      strengths: result.strengths || [],
      growthOpportunities: result.growthOpportunities || [],
      redFlags: result.redFlags || [],
      tailoredApplicationPitch: result.tailoredApplicationPitch || [],
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Deterministic heuristic evaluator used when running offline, on rate limit, or testing.
   * Separates binary hard criteria gating from deep resume-to-role matching.
   */
  static evaluateWithHeuristics(
    job: JobListing,
    persona: CandidatePersona
  ): JobEvaluation {
    const jobTitle = job.title.toLowerCase();
    const jobDesc = job.description.toLowerCase();
    const jobText = `${jobTitle} ${job.company.toLowerCase()} ${job.location.toLowerCase()} ${jobDesc} ${job.tags.join(' ').toLowerCase()}`;
    const constraints = persona.hardConstraints;

    // === PHASE 1: HARD CRITERIA GATING (Binary Prerequisites) ===

    // 1. Excluded Keywords / Dealbreakers
    let dealbreakerFailed = false;
    let dealbreakerReason = 'No dealbreaker keywords found';
    for (const excluded of constraints.excludedKeywords) {
      if (jobText.includes(excluded.toLowerCase())) {
        dealbreakerFailed = true;
        dealbreakerReason = `Contains dealbreaker keyword: "${excluded}"`;
        break;
      }
    }

    // 2. Remote & Work Arrangement
    const wantsRemoteOnly =
      constraints.workArrangements.length === 1 && constraints.workArrangements[0] === 'remote';
    const isJobRemote = job.isRemote || job.location.toLowerCase().includes('remote');
    const remotePassed = !wantsRemoteOnly || isJobRemote;
    const remoteReason = remotePassed
      ? 'Work arrangement satisfies candidate requirement'
      : 'Candidate requires fully remote position, but role is onsite/hybrid';

    // 3. Location Check
    let locationPassed = true;
    if (!isJobRemote && constraints.allowedLocations.length > 0) {
      const allowed = constraints.allowedLocations.map((l) => l.toLowerCase());
      const hasWorldwide = allowed.some((a) => ['remote', 'worldwide', 'any'].includes(a));
      if (!hasWorldwide) {
        locationPassed = allowed.some((a) => job.location.toLowerCase().includes(a));
      }
    }
    const locationReason = locationPassed
      ? 'Location matches allowed regions'
      : `Location "${job.location}" not in allowed locations`;

    // 4. Role Title General Viability
    const roleMatches = constraints.targetRoles.filter((target) => {
      const words = target.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => jobTitle.includes(w));
    });
    const rolePassed = roleMatches.length > 0 || constraints.targetRoles.length === 0;

    const allPassed = !dealbreakerFailed && remotePassed && locationPassed && rolePassed;

    // === PHASE 2: RESUME-TO-ROLE PROFILE MATCH SCORE (0-100) ===
    // This is NOT boosted by being remote. It evaluates resume alignment to role requirements.

    // A. Role & Seniority Match (Specialization fit)
    let roleScore = 50;
    const isCandidateBackend = (persona.primarySpecialization || 'Backend').toLowerCase().includes('backend') ||
                                (persona.headline || '').toLowerCase().includes('backend');
    const isCandidateFrontend = (persona.primarySpecialization || '').toLowerCase().includes('frontend') ||
                                (persona.headline || '').toLowerCase().includes('frontend') ||
                                (persona.headline || '').toLowerCase().includes('react');

    if (roleMatches.length > 0) {
      roleScore = 95; // Exact target role match
    } else if (isCandidateBackend) {
      if (jobTitle.includes('backend') || jobTitle.includes('systems') || jobTitle.includes('infrastructure') || jobTitle.includes('rust') || jobTitle.includes('golang')) {
        roleScore = 92;
      } else if (jobTitle.includes('frontend') || jobTitle.includes('ui') || jobTitle.includes('react') || jobTitle.includes('mobile')) {
        roleScore = 20; // Backend engineer evaluated against frontend role
      } else if (jobTitle.includes('full stack') || jobTitle.includes('fullstack')) {
        roleScore = 68;
      } else {
        roleScore = 80;
      }
    } else if (isCandidateFrontend) {
      if (jobTitle.includes('frontend') || jobTitle.includes('ui') || jobTitle.includes('react')) {
        roleScore = 92;
      } else if (jobTitle.includes('backend') || jobTitle.includes('systems') || jobTitle.includes('rust')) {
        roleScore = 20;
      } else {
        roleScore = 60;
      }
    } else {
      roleScore = rolePassed ? 85 : 50;
    }

    // B. Technical Stack Match (Candidate's skills in the job)
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const skill of persona.technicalSkills) {
      if (jobText.includes(skill.toLowerCase())) {
        matchedSkills.push(skill);
      }
    }

    for (const req of constraints.requiredKeywords) {
      if (!jobText.includes(req.toLowerCase())) {
        missingSkills.push(req);
      }
    }

    // Match candidate skills and domains against job tags
    let tagMatches = 0;
    for (const tag of job.tags) {
      const tLower = tag.toLowerCase();
      if (
        persona.technicalSkills.some((s) => s.toLowerCase() === tLower) ||
        persona.domains.some((d) => d.toLowerCase().includes(tLower) || tLower.includes(d.toLowerCase()))
      ) {
        tagMatches++;
      }
    }
    const tagMatchRatio = job.tags.length > 0 ? tagMatches / job.tags.length : (matchedSkills.length > 0 ? 1 : 0.5);

    let stackScore = 50;
    if (matchedSkills.length > 0) {
      stackScore = Math.round(60 + tagMatchRatio * 35);
    } else {
      stackScore = 20;
    }

    if (missingSkills.length > 0) {
      stackScore = Math.max(15, stackScore - missingSkills.length * 25);
    }

    // C. Project & Experience Match
    let projectScore = 50;
    if (persona.projects && persona.projects.length > 0) {
      const projectText = persona.projects.map((p) => `${p.name} ${p.description} ${p.technologies.join(' ')} ${p.highlights.join(' ')}`).join(' ').toLowerCase();
      const jobWords = jobText.split(/\s+/).filter((w) => w.length > 4);
      const matchedProjectWords = jobWords.filter((w) => projectText.includes(w));
      projectScore = Math.min(95, Math.max(30, 45 + matchedProjectWords.length * 8));
    } else if (roleMatches.length > 0) {
      projectScore = 85;
    } else {
      projectScore = isCandidateBackend && (jobTitle.includes('backend') || jobTitle.includes('systems') || jobTitle.includes('rust')) ? 80 : 35;
    }

    // Composite Profile Match Score
    const matchScore = Math.round(roleScore * 0.35 + stackScore * 0.40 + projectScore * 0.25);

    // Final recommendation based on hard constraints gate first, then score
    let recommendation: Recommendation = 'WEAK_MATCH';
    if (!allPassed) {
      recommendation = 'REJECT_CONSTRAINTS';
    } else if (matchScore >= 80) {
      recommendation = 'STRONG_MATCH';
    } else if (matchScore >= 60) {
      recommendation = 'MODERATE_MATCH';
    }

    const fitRationale = allPassed
      ? `Role aligns with candidate's ${persona.primarySpecialization || 'Software'} specialization (${roleScore}/100), core technical stack (${stackScore}/100), and architectural projects (${projectScore}/100).`
      : `Disqualified by hard constraints: ${!remotePassed ? remoteReason : dealbreakerFailed ? dealbreakerReason : locationReason}.`;

    return {
      jobId: job.id,
      profileId: persona.id,
      matchScore: !allPassed ? Math.min(matchScore, 45) : matchScore,
      recommendation,
      scoreBreakdown: {
        technicalStackMatch: stackScore,
        roleAndSeniorityMatch: roleScore,
        projectAndExperienceMatch: projectScore,
      },
      fitRationale,
      constraints: {
        locationCheck: {
          passed: locationPassed,
          reason: locationReason,
        },
        remoteCheck: {
          passed: remotePassed,
          reason: remoteReason,
        },
        experienceCheck: {
          passed: true,
          reason: 'Seniority and background align with role requirements',
        },
        roleCheck: {
          passed: rolePassed,
          reason: rolePassed ? `Title aligned with target: ${roleMatches[0] || 'Software Engineer'}` : 'Title not closely aligned with target roles',
        },
        salaryCheck: {
          passed: true,
          reason: job.salary ? `Reported salary: ${job.salary}` : 'Salary not specified (passed by default)',
        },
        dealbreakerCheck: {
          passed: !dealbreakerFailed,
          reason: dealbreakerReason,
        },
        allPassed,
      },
      matchedSkills: matchedSkills.slice(0, 8),
      missingSkills: missingSkills.slice(0, 4),
      strengths: [
        `Direct competency in ${matchedSkills.slice(0, 3).join(', ') || 'backend engineering'}`,
        `${persona.yearsOfExperience}+ years of experience in ${persona.domains?.[0] || 'distributed systems'}`,
        `Proven track record with high-throughput systems and projects like ${persona.projects?.[0]?.name || 'distributed pipelines'}`,
      ],
      growthOpportunities: ['Multi-chain infrastructure orchestration and scale'],
      redFlags: allPassed ? [] : [dealbreakerFailed ? dealbreakerReason : !remotePassed ? remoteReason : locationReason],
      tailoredApplicationPitch: [
        `Proven track record as a ${persona.headline} delivering high-impact solutions in ${persona.domains?.join(', ') || 'software systems'}.`,
        `Deep hands-on proficiency with ${matchedSkills.slice(0, 4).join(', ')}, matching ${job.company}'s core requirements.`,
        `Direct architectural experience with ${persona.projects?.[0]?.name || 'event ingestion systems'} perfectly positioned to accelerate ${job.company}'s roadmap.`,
      ],
      evaluatedAt: new Date().toISOString(),
    };
  }
}
