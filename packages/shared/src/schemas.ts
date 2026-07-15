import { z } from "zod";

export const personalInfoSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
  portfolio: z.string().optional(),
  summary: z.string().optional(),
});

export const experienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().optional(),
  start_date: z.string(),
  end_date: z.string(),
  bullets: z.array(z.string()),
});

export const projectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
});

export const educationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  graduation_date: z.string().optional(),
});

export const masterResumeSchema = z.object({
  personal_info: personalInfoSchema,
  skills: z.array(z.string()),
  experiences: z.array(experienceSchema),
  projects: z.array(projectSchema),
  education: z.array(educationSchema),
});

export type MasterResumeContent = z.infer<typeof masterResumeSchema>;

export const userProfileSchema = z.object({
  email: z.string().email(),
  targetRoles: z.array(z.string()).default([]),
  targetLocations: z.array(z.string()).default([]),
  minSalaryAud: z.number().int().nullable().optional(),
  visaSponsorshipRequired: z.boolean().default(false),
  preferredWorkType: z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]).default("UNKNOWN"),
  skills: z.array(z.string()).default([]),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;

export const jobInputSchema = z.object({
  source: z.enum(["APS_JOBS", "SEEK", "MANUAL"]),
  externalId: z.string().optional(),
  title: z.string(),
  company: z.string(),
  salaryRaw: z.string().optional(),
  location: z.string().optional(),
  workType: z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]).default("UNKNOWN"),
  description: z.string(),
  applyUrl: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
});

export type JobInput = z.infer<typeof jobInputSchema>;

export const jdAnalysisOutputSchema = z.object({
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  seniority: z.string(),
  industry: z.string(),
  summary: z.string(),
  match_score: z.number().min(0).max(100),
  hidden_signals: z
    .object({
      leadership: z.string().optional(),
      stakeholder_management: z.string().optional(),
      communication: z.string().optional(),
      domain_knowledge: z.string().optional(),
    })
    .optional(),
});

export type JdAnalysisOutput = z.infer<typeof jdAnalysisOutputSchema>;

export const jobSearchInputSchema = z.object({
  query: z.string().default("software engineer"),
  location: z.string().default(""),
  source: z.enum(["aps_jobs", "seek"]).default("seek"),
  states: z.array(z.enum(["VIC", "WA", "SA", "NSW", "QLD", "ACT", "TAS", "NT"])).default(["VIC", "WA", "SA"]),
  maxAgeDays: z.number().int().min(1).max(30).default(7),
  limit: z.number().int().min(1).max(100).default(50),
});

export type JobSearchInput = z.infer<typeof jobSearchInputSchema>;

export const manualJobInputSchema = z.object({
  title: z.string(),
  company: z.string(),
  description: z.string(),
  applyUrl: z.string().url().optional(),
  location: z.string().optional(),
  salaryRaw: z.string().optional(),
  workType: z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]).default("UNKNOWN"),
});

export type ManualJobInput = z.infer<typeof manualJobInputSchema>;

export const applicationCreateSchema = z.object({
  jobId: z.string().optional(),
  company: z.string(),
  role: z.string(),
  status: z.enum(["SAVED", "APPLIED", "INTERVIEW", "REJECTED", "OFFER"]).default("SAVED"),
  notes: z.string().optional(),
  resumeVersionId: z.string().optional(),
  coverLetterId: z.string().optional(),
});

export const applicationUpdateSchema = z.object({
  status: z.enum(["SAVED", "APPLIED", "INTERVIEW", "REJECTED", "OFFER"]).optional(),
  appliedDate: z.string().datetime().optional().nullable(),
  followUpDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional(),
  resumeVersionId: z.string().optional().nullable(),
  coverLetterId: z.string().optional().nullable(),
});
