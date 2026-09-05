import { z } from 'zod';

export const WorkArrangementSchema = z.enum(['remote', 'hybrid', 'onsite']);
export type WorkArrangement = z.infer<typeof WorkArrangementSchema>;

export const HardConstraintsSchema = z.object({
  targetRoles: z.array(z.string()).min(1, 'At least one target role is required'),
  workArrangements: z.array(WorkArrangementSchema).default(['remote']),
  allowedLocations: z.array(z.string()).default(['Remote', 'Worldwide']),
  minSalaryUSD: z.number().nullable().optional(),
  visaRequired: z.boolean().default(false),
  excludedKeywords: z.array(z.string()).default(['intern', 'unpaid', 'volunteer']),
  requiredKeywords: z.array(z.string()).default([]),
});
export type HardConstraints = z.infer<typeof HardConstraintsSchema>;

export const WorkExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  duration: z.string().optional(),
  location: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
});
export type WorkExperience = z.infer<typeof WorkExperienceSchema>;

export const ProjectSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  description: z.string().default(''),
  technologies: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  link: z.string().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const PublicationSchema = z.object({
  title: z.string(),
  venue: z.string().optional(),
  year: z.string().optional(),
  link: z.string().optional(),
  highlights: z.array(z.string()).default([]),
});
export type Publication = z.infer<typeof PublicationSchema>;

export const SkillsByCategorySchema = z.object({
  languages: z.array(z.string()).default([]),
  frameworksAndRuntimes: z.array(z.string()).default([]),
  databasesAndStorage: z.array(z.string()).default([]),
  cloudAndDevOps: z.array(z.string()).default([]),
  architectureAndSystems: z.array(z.string()).default([]),
});
export type SkillsByCategory = z.infer<typeof SkillsByCategorySchema>;

export const EducationSchema = z.object({
  degree: z.string(),
  institution: z.string(),
  year: z.string().optional(),
});
export type Education = z.infer<typeof EducationSchema>;

export const CandidatePersonaSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email().optional(),
  headline: z.string(),
  primarySpecialization: z.string().default('Backend'),
  secondarySpecializations: z.array(z.string()).default([]),
  summary: z.string(),
  yearsOfExperience: z.number().nonnegative(),
  technicalSkills: z.array(z.string()),
  skillsByCategory: SkillsByCategorySchema.optional(),
  softSkills: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  workHistory: z.array(WorkExperienceSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  publications: z.array(PublicationSchema).default([]),
  education: z.array(EducationSchema).default([]),
  hardConstraints: HardConstraintsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CandidatePersona = z.infer<typeof CandidatePersonaSchema>;
