import OpenAI from "openai";
import path from "path";
import {
  type AgentDefinition,
  type MasterResumeContent,
  masterResumeSchema,
  masterResumeToDocx,
  masterResumeToPdf,
  getStorage,
} from "@job-agent/shared";
import { z } from "zod";

const inputSchema = z.object({
  masterResume: masterResumeSchema,
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  conflictSuffix: z.string().optional(),
});

const outputSchema = z.object({
  content: masterResumeSchema,
  docxPath: z.string(),
  pdfPath: z.string(),
  folder: z.string(),
});

export type ResumeAgentInput = z.infer<typeof inputSchema>;
export type ResumeAgentOutput = z.infer<typeof outputSchema>;

function injectKeywords(resume: MasterResumeContent, keywords: string[]): MasterResumeContent {
  const mergedSkills = [...new Set([...resume.skills, ...keywords.slice(0, 12)])];
  return { ...resume, skills: mergedSkills };
}

function rankExperiences(resume: MasterResumeContent, keywords: string[]): MasterResumeContent {
  const scored = resume.experiences.map((exp) => {
    const text = `${exp.title} ${exp.company} ${exp.bullets.join(" ")}`.toLowerCase();
    const score = keywords.reduce((acc, kw) => (text.includes(kw.toLowerCase()) ? acc + 1 : acc), 0);
    return { exp, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return { ...resume, experiences: scored.map((s) => s.exp) };
}

async function rewriteWithOpenAI(
  resume: MasterResumeContent,
  jobTitle: string,
  company: string,
  jobDescription: string
): Promise<MasterResumeContent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-your")) return resume;

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "Tailor the resume JSON for the target job. Rewrite bullet points with measurable achievements. Inject ATS keywords naturally. Keep the same JSON schema. Do not invent employers or degrees.",
      },
      {
        role: "user",
        content: `Target: ${jobTitle} at ${company}\nJD:\n${jobDescription.slice(0, 8000)}\n\nResume JSON:\n${JSON.stringify(resume)}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return resume;
  try {
    return masterResumeSchema.parse(JSON.parse(content));
  } catch {
    return resume;
  }
}

export const resumeAgent: AgentDefinition<ResumeAgentInput, ResumeAgentOutput> = {
  name: "resume-agent",
  inputSchema,
  outputSchema,
  retry: { maxAttempts: 2, backoffMs: 2000 },
  async execute(input, ctx) {
    const keywords = [...input.requiredSkills, ...input.preferredSkills];
    let tailored = rankExperiences(input.masterResume, keywords);
    tailored = injectKeywords(tailored, keywords);
    tailored = await rewriteWithOpenAI(tailored, input.jobTitle, input.company, input.jobDescription);

    const storage = getStorage();
    const folder = await storage.getApplicationDir(
      input.company,
      input.jobTitle,
      input.conflictSuffix
    );

    const docxBuffer = await masterResumeToDocx(tailored);
    const pdfBuffer = await masterResumeToPdf(tailored);

    const docxPath = await storage.writeFile(path.join(folder, "resume.docx"), docxBuffer);
    const pdfPath = await storage.writeFile(path.join(folder, "resume.pdf"), pdfBuffer);

    ctx.logger.info("Resume generated", { folder, docxPath, pdfPath });
    return { content: tailored, docxPath, pdfPath, folder };
  },
};

export { inputSchema as resumeAgentInputSchema, outputSchema as resumeAgentOutputSchema };
