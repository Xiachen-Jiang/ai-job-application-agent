import OpenAI from "openai";
import path from "path";
import {
  type AgentDefinition,
  type MasterResumeContent,
  masterResumeSchema,
  coverLetterToDocx,
  coverLetterToPdf,
  getStorage,
} from "@job-agent/shared";
import { z } from "zod";

const inputSchema = z.object({
  company: z.string(),
  jobTitle: z.string(),
  jobDescription: z.string(),
  masterResume: masterResumeSchema,
  template: z.enum(["formal", "concise_tech", "narrative"]),
  conflictSuffix: z.string().optional(),
});

const outputSchema = z.object({
  content: z.string(),
  docxPath: z.string(),
  pdfPath: z.string(),
  folder: z.string(),
});

export type CoverLetterAgentInput = z.infer<typeof inputSchema>;
export type CoverLetterAgentOutput = z.infer<typeof outputSchema>;

const templates = {
  formal:
    "Write a formal, concise cover letter suitable for Australian public sector or corporate roles. 250-350 words. ATS-friendly plain text.",
  concise_tech:
    "Write a concise technical cover letter highlighting relevant skills and measurable outcomes. 250-300 words. No fluff.",
  narrative:
    "Write a narrative cover letter connecting career story to the role. 300-350 words. Professional tone.",
};

function fallbackCoverLetter(input: CoverLetterAgentInput): string {
  const resume = input.masterResume as MasterResumeContent;
  const topSkills = resume.skills.slice(0, 5).join(", ");
  return `Dear Hiring Manager,

I am writing to express my interest in the ${input.jobTitle} position at ${input.company}. With experience across ${topSkills}, I am confident I can contribute effectively to your team.

In my recent roles, I have delivered measurable outcomes including improved system reliability and faster delivery cycles. I am particularly drawn to this opportunity because it aligns with my strengths in building scalable solutions and collaborating with stakeholders.

I would welcome the opportunity to discuss how my background can support ${input.company}'s goals. Thank you for considering my application.

Sincerely,
${resume.personal_info.name}`;
}

async function generateCoverLetter(input: CoverLetterAgentInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-your")) return fallbackCoverLetter(input);

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const resume = input.masterResume as MasterResumeContent;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: templates[input.template] },
      {
        role: "user",
        content: `Company: ${input.company}\nRole: ${input.jobTitle}\nCandidate: ${resume.personal_info.name}\nSkills: ${resume.skills.join(", ")}\nSummary: ${resume.personal_info.summary ?? ""}\n\nJob Description:\n${input.jobDescription.slice(0, 6000)}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || fallbackCoverLetter(input);
}

export const coverLetterAgent: AgentDefinition<CoverLetterAgentInput, CoverLetterAgentOutput> = {
  name: "cover-letter-agent",
  inputSchema,
  outputSchema,
  retry: { maxAttempts: 2, backoffMs: 2000 },
  async execute(input, ctx) {
    const content = await generateCoverLetter(input);
    const storage = getStorage();
    const folder = await storage.getApplicationDir(
      input.company,
      input.jobTitle,
      input.conflictSuffix
    );

    const docxBuffer = await coverLetterToDocx(content, input.company, input.jobTitle);
    const pdfBuffer = await coverLetterToPdf(content, input.company, input.jobTitle);

    const docxPath = await storage.writeFile(path.join(folder, "James-Cover-Letter.docx"), docxBuffer);
    const pdfPath = await storage.writeFile(path.join(folder, "James-Cover-Letter.pdf"), pdfBuffer);

    ctx.logger.info("Cover letter generated", { folder });
    return { content, docxPath, pdfPath, folder };
  },
};

export { inputSchema as coverLetterAgentInputSchema, outputSchema as coverLetterAgentOutputSchema };
