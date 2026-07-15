export const RESUME_LABELS = {
  "ai-engineer": {
    label: "ai-engineer",
    displayName: "AI Engineer",
    filename: "James-Jiang-Resume-AI-Engineer.docx",
    coverContentKey: "ai",
  },
  backend: {
    label: "backend",
    displayName: "Back-End Developer",
    filename: "James-Jiang-Resume-Back-End-Developer.docx",
    coverContentKey: "software",
  },
  frontend: {
    label: "frontend",
    displayName: "Frontend Developer",
    filename: "James-Jiang-Resume-Frontend-Developer.docx",
    coverContentKey: "software",
  },
  fullstack: {
    label: "fullstack",
    displayName: "Full-Stack Developer",
    filename: "James-Jiang-Resume-Full-Stack-Developer.docx",
    coverContentKey: "software",
  },
  dotnet: {
    label: "dotnet",
    displayName: ".NET Developer",
    filename: "James-Jiang-Resume-NET-Developer.docx",
    coverContentKey: "software",
  },
  "software-engineer": {
    label: "software-engineer",
    displayName: "Software Engineer",
    filename: "James-Jiang-Resume-Software-Engineer.docx",
    coverContentKey: "software",
  },
} as const;

export type ResumeLabel = keyof typeof RESUME_LABELS;

const PROFILE_KEYWORDS: { label: ResumeLabel; keywords: string[]; weight?: number }[] = [
  {
    label: "ai-engineer",
    keywords: [
      "ai engineer",
      "ai developer",
      "machine learning",
      "ml engineer",
      "llm",
      "langchain",
      "langgraph",
      "generative ai",
      "agent engineer",
      "ai agent",
      "prompt engineer",
      "nlp",
      "deep learning",
      "artificial intelligence",
      "openai",
      "gemini",
      "automation",
    ],
  },
  {
    label: "backend",
    keywords: [
      "back-end",
      "backend",
      "back end",
      "api developer",
      "server-side",
      "plsql",
      "postgresql",
      "microservices",
      "node.js",
      "rest api",
    ],
  },
  {
    label: "frontend",
    keywords: [
      "front-end",
      "frontend",
      "front end",
      "react",
      "angular",
      "vue",
      "ui developer",
      "ux developer",
      "web developer",
      "css",
      "typescript developer",
    ],
  },
  {
    label: "fullstack",
    keywords: ["full stack", "fullstack", "full-stack", "full stack developer"],
  },
  {
    label: "dotnet",
    keywords: [".net", "dotnet", "dot net", "c#", "asp.net", "blazor", "entity framework", "azure"],
  },
  {
    label: "software-engineer",
    keywords: ["software engineer", "software developer", "developer", "programmer"],
  },
];

export function isResumeLabel(value: string): value is ResumeLabel {
  return value in RESUME_LABELS;
}

export function suggestResumeLabel(jobTitle: string, jobDescription: string): ResumeLabel {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();
  let best: ResumeLabel = "software-engineer";
  let bestScore = 0;

  for (const profile of PROFILE_KEYWORDS) {
    let score = 0;
    for (const keyword of profile.keywords) {
      if (text.includes(keyword)) score += keyword.includes(" ") ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = profile.label;
    }
  }

  return best;
}

export function resolveCoverContentKey(label: ResumeLabel): "ai" | "software" {
  return RESUME_LABELS[label].coverContentKey;
}
