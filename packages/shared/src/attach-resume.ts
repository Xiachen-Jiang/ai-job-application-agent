import fs from "fs/promises";
import path from "path";
import { RESUME_LABELS, type ResumeLabel } from "./resume-profile";
import { getStorage } from "./storage";

export function getResumeTemplatesDir(): string {
  if (process.env.RESUME_TEMPLATES_DIR) {
    return process.env.RESUME_TEMPLATES_DIR;
  }
  const monorepoRoot = path.resolve(__dirname, "../../..");
  return path.join(monorepoRoot, "storage", "resume-templates");
}

export async function resolveTemplateDocxPath(label: ResumeLabel, storedDocxPath?: string | null): Promise<string> {
  if (storedDocxPath) {
    if (path.isAbsolute(storedDocxPath)) return storedDocxPath;
    return path.join(getResumeTemplatesDir(), storedDocxPath);
  }
  return path.join(getResumeTemplatesDir(), RESUME_LABELS[label].filename);
}

export async function attachResumeTemplate(input: {
  label: ResumeLabel;
  company: string;
  jobTitle: string;
  templateDocxPath?: string | null;
  conflictSuffix?: string;
}): Promise<{ docxPath: string; folder: string }> {
  const sourcePath = await resolveTemplateDocxPath(input.label, input.templateDocxPath);
  const buffer = await fs.readFile(sourcePath);

  const storage = getStorage();
  const folder = await storage.getApplicationDir(input.company, input.jobTitle, input.conflictSuffix);
  const docxPath = await storage.writeFile(path.join(folder, "James-resume.docx"), buffer);

  return { docxPath, folder };
}
