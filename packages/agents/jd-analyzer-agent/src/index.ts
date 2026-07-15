import OpenAI from "openai";
import {
  type AgentDefinition,
  jdAnalysisOutputSchema,
  type JdAnalysisOutput,
} from "@job-agent/shared";
import { z } from "zod";

const inputSchema = z.object({
  jobDescription: z.string().min(20),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  userSkills: z.array(z.string()).default([]),
});

export type JdAnalyzerInput = z.infer<typeof inputSchema>;

function fallbackAnalysis(jobDescription: string, userSkills: string[]): JdAnalysisOutput {
  const lower = jobDescription.toLowerCase();
  const skillPool = [
    "typescript", "javascript", "python", "java", "react", "node.js", "aws", "docker",
    "kubernetes", "postgresql", "leadership", "communication", "agile",
  ];
  const required = skillPool.filter((s) => lower.includes(s)).slice(0, 8);
  const preferred = skillPool.filter((s) => !required.includes(s) && lower.includes(s)).slice(0, 5);
  const overlap = userSkills.filter((s) =>
    [...required, ...preferred].some((r) => r.toLowerCase() === s.toLowerCase())
  );
  const matchScore = Math.min(100, Math.round((overlap.length / Math.max(required.length, 1)) * 100));

  return {
    required_skills: required,
    preferred_skills: preferred,
    seniority: lower.includes("senior") ? "Senior" : lower.includes("junior") ? "Junior" : "Mid",
    industry: "Technology / Public Sector",
    summary: jobDescription.slice(0, 300),
    match_score: matchScore,
    hidden_signals: {
      leadership: lower.includes("lead") ? "Leadership expectations detected" : "Not emphasized",
      stakeholder_management: lower.includes("stakeholder") ? "Stakeholder management required" : "Limited mention",
      communication: lower.includes("communication") ? "Strong communication skills required" : "Standard",
      domain_knowledge: "Review domain-specific terms in full JD",
    },
  };
}

export const jdAnalyzerAgent: AgentDefinition<JdAnalyzerInput, JdAnalysisOutput> = {
  name: "jd-analyzer-agent",
  inputSchema,
  outputSchema: jdAnalysisOutputSchema,
  retry: { maxAttempts: 2, backoffMs: 2000 },
  async execute(input, ctx) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith("sk-your")) {
      ctx.logger.info("OpenAI not configured, using fallback analyzer");
      return fallbackAnalysis(input.jobDescription, input.userSkills);
    }

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const systemPrompt = `You analyze job descriptions for an Australian job seeker.
Return structured JSON with required_skills, preferred_skills, seniority, industry, summary, match_score (0-100 vs user skills), and hidden_signals (leadership, stakeholder_management, communication, domain_knowledge).
Be concise and ATS-focused.`;

    const userPrompt = `Job Title: ${input.jobTitle ?? "N/A"}
Company: ${input.company ?? "N/A"}
User Skills: ${input.userSkills.join(", ")}

Job Description:
${input.jobDescription.slice(0, 12000)}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "jd_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              required_skills: { type: "array", items: { type: "string" } },
              preferred_skills: { type: "array", items: { type: "string" } },
              seniority: { type: "string" },
              industry: { type: "string" },
              summary: { type: "string" },
              match_score: { type: "number" },
              hidden_signals: {
                type: "object",
                properties: {
                  leadership: { type: "string" },
                  stakeholder_management: { type: "string" },
                  communication: { type: "string" },
                  domain_knowledge: { type: "string" },
                },
                required: ["leadership", "stakeholder_management", "communication", "domain_knowledge"],
                additionalProperties: false,
              },
            },
            required: [
              "required_skills",
              "preferred_skills",
              "seniority",
              "industry",
              "summary",
              "match_score",
              "hidden_signals",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI response");
    return jdAnalysisOutputSchema.parse(JSON.parse(content));
  },
};

export { inputSchema as jdAnalyzerInputSchema };
