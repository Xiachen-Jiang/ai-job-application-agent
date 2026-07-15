"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { client, downloadWithAuth, type JobDetail, type ResumeLabel } from "@/lib/api";

const RESUME_OPTIONS: { label: ResumeLabel; title: string }[] = [
  { label: "ai-engineer", title: "AI Engineer" },
  { label: "backend", title: "Back-End Developer" },
  { label: "frontend", title: "Frontend Developer" },
  { label: "fullstack", title: "Full-Stack Developer" },
  { label: "dotnet", title: ".NET Developer" },
  { label: "software-engineer", title: "Software Engineer" },
];

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [job, setJob] = useState<JobDetail | null>(null);
  const [resumeProfile, setResumeProfile] = useState<ResumeLabel>("software-engineer");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    client
      .getJob(id)
      .then((data) => {
        setJob(data);
        if (data.suggestedResumeLabel) {
          setResumeProfile(data.suggestedResumeLabel);
        }
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [id]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setLoading(label);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(`${label} completed.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoading("");
    }
  };

  if (!job) {
    return <p className="text-slate-400">Loading job...</p>;
  }

  const latestResume = job.tailoredResumes?.[0];
  const latestCover = job.coverLetters?.[0];
  const currentApplication = job.applications?.[0];
  const selectedResumeTitle =
    RESUME_OPTIONS.find((option) => option.label === resumeProfile)?.title ?? resumeProfile;

  const setApplicationStatus = (status: "SAVED" | "APPLIED") =>
    run(status === "APPLIED" ? "Mark applied" : "Save application", async () => {
      const payload: Record<string, unknown> = {
        status,
        ...(status === "APPLIED" ? { appliedDate: new Date().toISOString() } : {}),
      };
      if (currentApplication) {
        return client.updateApplication(currentApplication.id, payload);
      }
      return client.createApplication({
        jobId: job.id,
        company: job.company,
        role: job.title,
        ...payload,
      });
    });

  const STATUS_STYLES: Record<string, string> = {
    SAVED: "bg-slate-700 text-slate-100",
    APPLIED: "bg-emerald-600 text-white",
    INTERVIEW: "bg-sky-600 text-white",
    OFFER: "bg-amber-500 text-slate-900",
    REJECTED: "bg-red-700 text-white",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-400">Match {Math.round(job.matchScore?.totalScore ?? 0)}/100</p>
          <h1 className="text-3xl font-bold">{job.title}</h1>
          <p className="mt-1 text-slate-400">
            {job.company} · {job.location ?? "Australia"} · {job.workType}
          </p>
          {job.salaryRaw && <p className="mt-1 text-slate-300">{job.salaryRaw}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {job.applyUrl && (
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-emerald-600 px-4 py-2 text-emerald-400 hover:bg-emerald-950"
            >
              Open Apply Link
            </a>
          )}
          <button
            onClick={() => setApplicationStatus("SAVED")}
            disabled={!!loading}
            className="rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            Save Application
          </button>
          <button
            onClick={() => setApplicationStatus("APPLIED")}
            disabled={!!loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 hover:bg-emerald-500 disabled:opacity-50"
          >
            {currentApplication?.status === "APPLIED" ? "Update Applied Date" : "Mark as Applied"}
          </button>
        </div>
      </div>

      {currentApplication && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
          <span className="text-slate-400">Application status:</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              STATUS_STYLES[currentApplication.status] ?? "bg-slate-700 text-slate-100"
            }`}
          >
            {currentApplication.status}
          </span>
          {currentApplication.appliedDate && (
            <span className="text-slate-400">
              Applied on {new Date(currentApplication.appliedDate).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-900/40 p-3 text-red-200">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-900/40 p-3 text-emerald-200">{message}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <ScoreCard label="Skills" value={job.matchScore?.skillScore} />
        <ScoreCard label="Salary" value={job.matchScore?.salaryScore} />
        <ScoreCard label="Location" value={job.matchScore?.locationScore} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-400">
            Resume template:
            <select
              value={resumeProfile}
              onChange={(e) => setResumeProfile(e.target.value as ResumeLabel)}
              className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
            >
              {RESUME_OPTIONS.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
          {job.suggestedResumeLabel && (
            <span className="text-xs text-emerald-400">
              Suggested: {RESUME_OPTIONS.find((o) => o.label === job.suggestedResumeLabel)?.title ?? job.suggestedResumeLabel}
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Uses your pre-made targeted resume for {selectedResumeTitle}. No AI rewriting per job.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <ActionButton
            label="Analyze JD"
            loading={loading}
            onClick={() => run("Analyze JD", () => client.analyzeJob(id))}
          />
          <ActionButton
            label="Use Resume"
            loading={loading}
            onClick={() => run("Use Resume", () => client.attachResume(id, resumeProfile))}
          />
          <ActionButton
            label="Generate Cover Letter"
            loading={loading}
            onClick={() =>
              run("Generate Cover Letter", () => client.generateCoverLetter(id, resumeProfile))
            }
          />
        </div>

        {job.analysis && (
          <div className="space-y-3 text-sm">
            <p><span className="text-slate-400">Summary:</span> {job.analysis.summary}</p>
            <p><span className="text-slate-400">Seniority:</span> {job.analysis.seniority}</p>
            <p><span className="text-slate-400">Required:</span> {job.analysis.requiredSkills?.join(", ")}</p>
            <p><span className="text-slate-400">Preferred:</span> {job.analysis.preferredSkills?.join(", ")}</p>
            {job.analysis.hiddenSignals && (
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(job.analysis.hiddenSignals).map(([key, value]) => (
                  <p key={key}><span className="text-slate-400">{key}:</span> {value}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 font-semibold">Application Materials</h2>
        <div className="flex flex-wrap gap-2">
          {latestResume?.docxPath && (
            <DownloadBtn
              label="Resume DOCX"
              onClick={() => downloadWithAuth(client.downloadMaterialUrl(id, "resume", "docx"), "James-resume.docx")}
            />
          )}
          {latestResume?.pdfPath && (
            <DownloadBtn
              label="Resume PDF"
              onClick={() => downloadWithAuth(client.downloadMaterialUrl(id, "resume", "pdf"), "James-resume.pdf")}
            />
          )}
          {latestCover && (
            <>
              <DownloadBtn
                label="Cover Letter DOCX"
                onClick={() =>
                  downloadWithAuth(client.downloadMaterialUrl(id, "cover-letter", "docx"), "James-Cover-Letter.docx")
                }
              />
              {latestCover.pdfPath && (
                <DownloadBtn
                  label="Cover Letter PDF"
                  onClick={() =>
                    downloadWithAuth(client.downloadMaterialUrl(id, "cover-letter", "pdf"), "James-Cover-Letter.pdf")
                  }
                />
              )}
            </>
          )}
          {!latestResume && !latestCover && (
            <p className="text-sm text-slate-500">Use a resume template or generate a cover letter to enable downloads.</p>
          )}
        </div>
        {latestCover?.content && (
          <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-sm text-slate-300">
            {latestCover.content}
          </pre>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 font-semibold">Job Description</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{job.description}</p>
      </section>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-semibold">{Math.round(value ?? 0)}</p>
    </div>
  );
}

function ActionButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
    >
      {loading === label ? "Working..." : label}
    </button>
  );
}

function DownloadBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
      {label}
    </button>
  );
}
