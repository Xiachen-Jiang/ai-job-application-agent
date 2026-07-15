import fs from "fs";
import path from "path";
import { prisma } from "./index";
import { masterResumeSchema, RESUME_LABELS, type ResumeLabel } from "@job-agent/shared";

const dataDir = path.join(__dirname, "../data/resumes");

function loadResume(label: "ai" | "software") {
  const filePath = path.join(dataDir, `${label}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return masterResumeSchema.parse(raw);
}

const allSkills = [
  "C#",
  "TypeScript",
  "JavaScript",
  "Python",
  "Angular",
  "React",
  "ASP.NET Core",
  "LangChain",
  "LangGraph",
  "OpenAI API",
  "Google Gemini",
  "SQL Server",
  "PostgreSQL",
  "Azure DevOps",
  "AI Agents",
  "REST APIs",
];

const profiles: { label: ResumeLabel; displayName: string; coverContentKey: "ai" | "software"; filename: string }[] = [
  { label: "ai-engineer", displayName: RESUME_LABELS["ai-engineer"].displayName, coverContentKey: "ai", filename: RESUME_LABELS["ai-engineer"].filename },
  { label: "backend", displayName: RESUME_LABELS.backend.displayName, coverContentKey: "software", filename: RESUME_LABELS.backend.filename },
  { label: "frontend", displayName: RESUME_LABELS.frontend.displayName, coverContentKey: "software", filename: RESUME_LABELS.frontend.filename },
  { label: "fullstack", displayName: RESUME_LABELS.fullstack.displayName, coverContentKey: "software", filename: RESUME_LABELS.fullstack.filename },
  { label: "dotnet", displayName: RESUME_LABELS.dotnet.displayName, coverContentKey: "software", filename: RESUME_LABELS.dotnet.filename },
  { label: "software-engineer", displayName: RESUME_LABELS["software-engineer"].displayName, coverContentKey: "software", filename: RESUME_LABELS["software-engineer"].filename },
];

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "jiangxiachen01@outlook.com";

  await prisma.userProfile.upsert({
    where: { email },
    update: {
      targetRoles: [
        "AI Engineer",
        "Software Engineer",
        "Full Stack Developer",
        "Back-End Developer",
        "Frontend Developer",
        ".NET Developer",
      ],
      targetLocations: ["Adelaide", "Remote", "Melbourne", "Sydney", "Perth"],
      minSalaryAud: 85000,
      visaSponsorshipRequired: false,
      preferredWorkType: "HYBRID",
      skills: allSkills,
    },
    create: {
      email,
      targetRoles: [
        "AI Engineer",
        "Software Engineer",
        "Full Stack Developer",
        "Back-End Developer",
        "Frontend Developer",
        ".NET Developer",
      ],
      targetLocations: ["Adelaide", "Remote", "Melbourne", "Sydney", "Perth"],
      minSalaryAud: 85000,
      visaSponsorshipRequired: false,
      preferredWorkType: "HYBRID",
      skills: allSkills,
    },
  });

  const aiContent = loadResume("ai");
  const softwareContent = loadResume("software");

  for (const profile of profiles) {
    const content = profile.coverContentKey === "ai" ? aiContent : softwareContent;
    await prisma.masterResume.upsert({
      where: { label: profile.label },
      update: {
        displayName: profile.displayName,
        content,
        docxPath: profile.filename,
        isActive: true,
        version: { increment: 1 },
      },
      create: {
        label: profile.label,
        displayName: profile.displayName,
        content,
        docxPath: profile.filename,
        version: 1,
        isActive: true,
      },
    });
  }

  await prisma.masterResume.updateMany({
    where: { label: { in: ["ai", "software"] } },
    data: { isActive: false },
  });

  console.log("Seed completed with 6 targeted resume templates for James Jiang.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
