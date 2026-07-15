export interface MatchScoreInput {
  jobDescription: string;
  jobLocation?: string | null;
  jobSalaryRaw?: string | null;
  userSkills: string[];
  userLocations: string[];
  minSalaryAud?: number | null;
  visaSponsorshipRequired: boolean;
  requiredSkills?: string[];
  preferredSkills?: string[];
}

export interface MatchScoreResult {
  skillScore: number;
  salaryScore: number;
  locationScore: number;
  visaScore: number;
  totalScore: number;
  breakdown: Record<string, unknown>;
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function extractSkillsFromText(text: string): string[] {
  const common = [
    "typescript", "javascript", "python", "java", "react", "node", "aws", "azure",
    "docker", "kubernetes", "sql", "postgresql", "mongodb", "git", "agile", "scrum",
    "leadership", "communication", "stakeholder", "api", "rest", "graphql", "next.js",
  ];
  const lower = text.toLowerCase();
  return common.filter((skill) => lower.includes(skill));
}

function parseSalaryRange(text?: string | null): { min?: number; max?: number } {
  if (!text) return {};
  const numbers = text.match(/\d[\d,]*/g)?.map((n) => parseInt(n.replace(/,/g, ""), 10)) ?? [];
  if (numbers.length === 0) return {};
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function computeSalaryScore(jobSalaryRaw: string | null | undefined, minSalaryAud?: number | null): number {
  if (!minSalaryAud) return 70;
  const range = parseSalaryRange(jobSalaryRaw);
  if (!range.min && !range.max) return 50;
  const jobMin = range.min ?? range.max ?? 0;
  const jobMax = range.max ?? range.min ?? jobMin;
  if (jobMax >= minSalaryAud) return 100;
  if (jobMin >= minSalaryAud * 0.9) return 85;
  const ratio = jobMax / minSalaryAud;
  return Math.max(0, Math.min(100, ratio * 100));
}

function computeLocationScore(
  jobLocation: string | null | undefined,
  userLocations: string[]
): number {
  if (!jobLocation) return 50;
  const jobLoc = jobLocation.toLowerCase();
  if (jobLoc.includes("remote")) return 100;
  for (const loc of userLocations) {
    if (jobLoc.includes(loc.toLowerCase())) return 100;
  }
  if (userLocations.some((l) => l.toLowerCase() === "remote")) return 70;
  return 30;
}

function computeVisaScore(description: string, visaRequired: boolean): number {
  const text = description.toLowerCase();
  const sponsorshipKeywords = [
    "visa sponsorship",
    "sponsor visa",
    "482",
    "186",
    "working rights",
    "citizen or permanent resident",
    "must have full working rights",
  ];
  const mentionsSponsorship = sponsorshipKeywords.some((k) => text.includes(k));
  const blocksSponsorship = text.includes("citizenship required") || text.includes("pr/citizen only");

  if (!visaRequired) return 100;
  if (blocksSponsorship) return 0;
  if (mentionsSponsorship) return 100;
  return 40;
}

export function computeMatchScore(input: MatchScoreInput): MatchScoreResult {
  const extracted = extractSkillsFromText(input.jobDescription);
  const jdSkills = [...(input.requiredSkills ?? []), ...(input.preferredSkills ?? []), ...extracted];
  const skillScore = Math.round(
    jaccard(input.userSkills, jdSkills) * 100 * 0.7 +
      jaccard(input.userSkills, input.requiredSkills ?? []) * 100 * 0.3
  );

  const salaryScore = Math.round(computeSalaryScore(input.jobSalaryRaw, input.minSalaryAud));
  const locationScore = Math.round(computeLocationScore(input.jobLocation, input.userLocations));
  const visaScore = Math.round(computeVisaScore(input.jobDescription, input.visaSponsorshipRequired));

  const totalScore = Math.round(
    0.4 * skillScore + 0.25 * salaryScore + 0.2 * locationScore + 0.15 * visaScore
  );

  return {
    skillScore,
    salaryScore,
    locationScore,
    visaScore,
    totalScore,
    breakdown: {
      weights: { skill: 0.4, salary: 0.25, location: 0.2, visa: 0.15 },
      jdSkillsUsed: jdSkills.slice(0, 20),
    },
  };
}

export function detectWorkType(text: string): "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN" {
  const lower = text.toLowerCase();
  if (lower.includes("remote") && !lower.includes("hybrid")) return "REMOTE";
  if (lower.includes("hybrid")) return "HYBRID";
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("office")) return "ONSITE";
  return "UNKNOWN";
}
