const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET ?? "change-me";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": API_SECRET,
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const client = {
  getProfile: () => api<Record<string, unknown>>("/api/profile"),
  updateProfile: (data: unknown) =>
    api("/api/profile", { method: "PUT", body: JSON.stringify(data) }),
  listMasterResumes: () => api<MasterResumeRecord[]>("/api/resume/master"),
  getMasterResume: (label: string) => api<MasterResumeRecord>(`/api/resume/master/${label}`),
  saveMasterResume: (label: "ai" | "software", content: unknown) =>
    api("/api/resume/master", { method: "POST", body: JSON.stringify({ label, content }) }),
  searchJobs: (
    query: string,
    options?: {
      states?: string[];
      maxAgeDays?: number;
      limit?: number;
    }
  ) =>
    api("/api/jobs/search", {
      method: "POST",
      body: JSON.stringify({
        query,
        source: "seek",
        states: options?.states ?? ["VIC", "WA", "SA"],
        maxAgeDays: options?.maxAgeDays ?? 7,
        limit: options?.limit ?? 50,
      }),
    }),
  listJobs: (sort = "score", source?: string, applicationStatus?: "pending" | "applied") => {
    const params = new URLSearchParams({ sort });
    if (source) params.set("source", source);
    if (applicationStatus) params.set("applicationStatus", applicationStatus);
    return api<Job[]>(`/api/jobs?${params.toString()}`);
  },
  getJob: (id: string) => api<JobDetail>(`/api/jobs/${id}`),
  analyzeJob: (id: string) => api(`/api/jobs/${id}/analyze`, { method: "POST" }),
  attachResume: (id: string, label: ResumeLabel) =>
    api(`/api/jobs/${id}/resume`, { method: "POST", body: JSON.stringify({ label }) }),
  generateCoverLetter: (id: string, label?: ResumeLabel, template = "concise_tech") =>
    api(`/api/jobs/${id}/cover-letter`, {
      method: "POST",
      body: JSON.stringify({ template, ...(label ? { label } : {}) }),
    }),
  batchPrepare: (jobIds: string[], coverTemplate = "concise_tech") =>
    api<BatchPrepareResponse>("/api/jobs/batch-prepare", {
      method: "POST",
      body: JSON.stringify({ jobIds, coverTemplate }),
    }),
  batchApply: (jobIds: string[]) =>
    api<BatchApplyResponse>("/api/jobs/batch-apply", {
      method: "POST",
      body: JSON.stringify({ jobIds }),
    }),
  deleteNonAppliedJobs: (options?: { jobIds?: string[]; source?: "SEEK" | "APS_JOBS" | "MANUAL" }) =>
    api<DeleteNonAppliedResponse>("/api/jobs/delete-non-applied", {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }),
  createManualJob: (data: unknown) =>
    api("/api/jobs/manual", { method: "POST", body: JSON.stringify(data) }),
  listApplications: () => api<Application[]>("/api/applications"),
  createApplication: (data: unknown) =>
    api("/api/applications", { method: "POST", body: JSON.stringify(data) }),
  updateApplication: (id: string, data: unknown) =>
    api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getStats: () => api<{ byStatus: { status: string; _count: { status: number } }[]; totalJobs: number }>(
    "/api/applications/stats/summary"
  ),
  exportUrl: (format: "csv" | "xlsx") =>
    `${API_URL}/api/applications/export?format=${format}`,
  downloadMaterialUrl: (jobId: string, type: "resume" | "cover-letter", format: "docx" | "pdf") =>
    `${API_URL}/api/jobs/${jobId}/materials/${type}/export?format=${format}`,
};

export interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  salaryRaw?: string;
  workType: string;
  source?: string;
  applyUrl?: string;
  matchScore?: { totalScore: number; skillScore: number; salaryScore: number; locationScore: number; visaScore: number };
  applications?: Application[];
}

export type ResumeLabel =
  | "ai-engineer"
  | "backend"
  | "frontend"
  | "fullstack"
  | "dotnet"
  | "software-engineer";

export interface MasterResumeRecord {
  id: string;
  label: ResumeLabel;
  displayName: string;
  content: unknown;
  docxPath?: string | null;
  version: number;
}

export interface JobDetail extends Job {
  description: string;
  suggestedResumeLabel?: ResumeLabel;
  analysis?: {
    requiredSkills: string[];
    preferredSkills: string[];
    seniority?: string;
    industry?: string;
    summary?: string;
    llmMatchScore?: number;
    hiddenSignals?: Record<string, string>;
  };
  tailoredResumes?: { id: string; version: number; docxPath?: string; pdfPath?: string }[];
  coverLetters?: { id: string; version: number; content?: string; docxPath?: string; pdfPath?: string }[];
  applications?: Application[];
}

export interface Application {
  id: string;
  company: string;
  role: string;
  status: string;
  appliedDate?: string;
  followUpDate?: string;
  notes?: string;
  job?: Job;
}

export interface BatchPrepareResult {
  jobId: string;
  ok: boolean;
  error?: string;
  title?: string;
  company?: string;
  applyUrl?: string | null;
  resumeLabel?: string;
  resumeDisplayName?: string;
  folder?: string;
  applicationId?: string;
  applicationStatus?: string;
}

export interface BatchPrepareResponse {
  results: BatchPrepareResult[];
  prepared: number;
  total: number;
}

export interface BatchApplyResult {
  jobId: string;
  ok: boolean;
  error?: string;
  applicationId?: string;
  status?: string;
}

export interface BatchApplyResponse {
  results: BatchApplyResult[];
  applied: number;
  total: number;
}

export interface DeleteNonAppliedResponse {
  deleted: number;
  skipped: number;
  deletedJobs: { jobId: string; title: string; company: string }[];
  skippedJobs: { jobId: string; title: string; company: string; reason: string }[];
}

export function downloadWithAuth(url: string, filename: string) {
  fetch(url, { headers: { "x-api-secret": API_SECRET } })
    .then((res) => res.blob())
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    });
}
