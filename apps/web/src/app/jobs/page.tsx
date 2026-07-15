"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { client, downloadWithAuth, type Job, type BatchPrepareResult } from "@/lib/api";

const STATE_OPTIONS = ["VIC", "WA", "SA"] as const;

const STATUS_STYLES: Record<string, string> = {
  SAVED: "bg-slate-700 text-slate-100",
  APPLIED: "bg-emerald-600 text-white",
  INTERVIEW: "bg-sky-600 text-white",
  OFFER: "bg-amber-500 text-slate-900",
  REJECTED: "bg-red-700 text-white",
};

function isJobApplied(job: Job): boolean {
  return job.applications?.[0]?.status === "APPLIED";
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState(
    "software engineer or software developer or full stack developer or AI engineer or back end developer or .NET developer"
  );
  const [states, setStates] = useState<string[]>(["VIC", "WA", "SA"]);
  const [maxAgeDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({
    title: "",
    company: "",
    description: "",
    applyUrl: "",
    location: "",
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState("");
  const [batchResults, setBatchResults] = useState<BatchPrepareResult[] | null>(null);
  const [message, setMessage] = useState("");

  const loadJobs = () => {
    client
      .listJobs("score", "SEEK", "pending")
      .then(setJobs)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === jobs.length ? [] : jobs.map((j) => j.id)));
  };

  const handlePrepare = async () => {
    if (selectedIds.length === 0) return;
    setBatchLoading("prepare");
    setError("");
    setBatchResults(null);
    try {
      const res = await client.batchPrepare(selectedIds);
      setBatchResults(res.results);
      loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prepare failed");
    } finally {
      setBatchLoading("");
    }
  };

  const handleOpenApply = () => {
    const targets = (batchResults ?? [])
      .filter((r) => r.ok && r.applyUrl && selectedIds.includes(r.jobId))
      .map((r) => r.applyUrl as string);
    const fallback = jobs
      .filter((j) => selectedIds.includes(j.id) && j.applyUrl)
      .map((j) => j.applyUrl as string);
    const urls = targets.length > 0 ? targets : fallback;
    urls.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
  };

  const handleMarkApplied = async () => {
    if (selectedIds.length === 0) return;
    setBatchLoading("apply");
    setError("");
    setMessage("");
    try {
      await client.batchApply(selectedIds);
      setMessage("Marked as APPLIED. These jobs now appear on Applied Jobs.");
      loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mark applied failed");
    } finally {
      setBatchLoading("");
    }
  };

  const handleDeleteNonApplied = async (scope: "all" | "selected") => {
    if (scope === "selected" && selectedIds.length === 0) {
      setMessage("Select jobs to remove.");
      return;
    }

    const deletableCount =
      scope === "selected"
        ? selectedIds.filter((id) => {
            const job = jobs.find((j) => j.id === id);
            return job && !isJobApplied(job);
          }).length
        : jobs.filter((j) => !isJobApplied(j)).length;

    if (deletableCount === 0) {
      setMessage(scope === "selected" ? "Selected jobs are all APPLIED and were kept." : "No non-applied jobs to remove.");
      return;
    }

    const label =
      scope === "selected"
        ? `Remove ${deletableCount} selected job(s) that are not APPLIED? APPLIED jobs will be kept.`
        : `Remove all ${deletableCount} non-applied Seek job(s)? APPLIED jobs will be kept.`;

    if (!window.confirm(label)) return;

    setBatchLoading("delete");
    setError("");
    setMessage("");
    try {
      const res = await client.deleteNonAppliedJobs(
        scope === "selected" ? { jobIds: selectedIds } : { source: "SEEK" }
      );
      setMessage(`Removed ${res.deleted} job(s). Kept ${res.skipped} APPLIED job(s).`);
      setSelectedIds((prev) => prev.filter((id) => !res.deletedJobs.some((j) => j.jobId === id)));
      setBatchResults(null);
      loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBatchLoading("");
    }
  };

  const toggleState = (state: string) => {
    setStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  };

  const handleSearch = async () => {
    if (states.length === 0) {
      setError("Select at least one state (VIC, WA, or SA).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = (await client.searchJobs(query, {
        states,
        maxAgeDays,
        limit: 50,
      })) as { count?: number; jobs?: Job[] };
      setLastCount(result.count ?? result.jobs?.length ?? 0);
      loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await client.createManualJob(manual);
      setShowManual(false);
      setManual({ title: "", company: "", description: "", applyUrl: "", location: "" });
      loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Jobs</h1>
          <p className="mt-1 text-slate-400">
            Search Seek — posted within {maxAgeDays} days, VIC / WA / SA. APPLIED jobs appear on{" "}
            <Link href="/jobs/applied" className="text-emerald-400 hover:underline">
              Applied Jobs
            </Link>
            .
          </p>
        </div>
        <button
          onClick={() => setShowManual(!showManual)}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
        >
          Add Manual Job
        </button>
        <button
          onClick={() => handleDeleteNonApplied("all")}
          disabled={!!batchLoading || jobs.filter((j) => !isJobApplied(j)).length === 0}
          className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-300 hover:bg-red-950 disabled:opacity-50"
        >
          {batchLoading === "delete" ? "Removing..." : "Remove non-applied"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2"
          placeholder="Keywords e.g. software engineer, AI engineer"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-400">States:</span>
          {STATE_OPTIONS.map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => toggleState(state)}
              className={`rounded-lg px-3 py-1 text-sm ${
                states.includes(state)
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-700 text-slate-400"
              }`}
            >
              {state}
            </button>
          ))}
          <span className="ml-2 text-xs text-slate-500">Last {maxAgeDays} days only</span>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Searching Seek..." : "Search Seek"}
        </button>
        {lastCount !== null && (
          <p className="text-sm text-emerald-400">Imported {lastCount} jobs from Seek.</p>
        )}
      </div>

      {showManual && (
        <form onSubmit={handleManualSubmit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <input
            required
            placeholder="Job title"
            value={manual.title}
            onChange={(e) => setManual({ ...manual, title: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <input
            required
            placeholder="Company"
            value={manual.company}
            onChange={(e) => setManual({ ...manual, company: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <input
            placeholder="Location"
            value={manual.location}
            onChange={(e) => setManual({ ...manual, location: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <input
            placeholder="Apply URL"
            value={manual.applyUrl}
            onChange={(e) => setManual({ ...manual, applyUrl: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <textarea
            required
            placeholder="Job description"
            value={manual.description}
            onChange={(e) => setManual({ ...manual, description: e.target.value })}
            className="min-h-[120px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2">
            Save Job
          </button>
        </form>
      )}

      {error && <p className="rounded-lg bg-red-900/40 p-3 text-red-200">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-900/40 p-3 text-emerald-200">{message}</p>}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4">
          <span className="text-sm font-medium text-emerald-300">
            {selectedIds.length} selected
          </span>
          <button
            onClick={handlePrepare}
            disabled={!!batchLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {batchLoading === "prepare" ? "Preparing..." : "Prepare Selected"}
          </button>
          <button
            onClick={handleOpenApply}
            disabled={!!batchLoading}
            className="rounded-lg border border-emerald-600 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"
          >
            Open Apply Pages
          </button>
          <button
            onClick={() => handleMarkApplied}
            disabled={!!batchLoading}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
          >
            {batchLoading === "apply" ? "Marking..." : "Mark Selected Applied"}
          </button>
          <button
            onClick={() => handleDeleteNonApplied("selected")}
            disabled={!!batchLoading}
            className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-300 hover:bg-red-950 disabled:opacity-50"
          >
            Delete selected
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="ml-auto text-sm text-slate-400 hover:text-white"
          >
            Clear
          </button>
        </div>
      )}

      {batchResults && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Prepared {batchResults.filter((r) => r.ok).length}/{batchResults.length}
            </h2>
            <button
              onClick={() => setBatchResults(null)}
              className="text-sm text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <ul className="space-y-2 text-sm">
            {batchResults.map((r) => (
              <li
                key={r.jobId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
              >
                {r.ok ? (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">OK</span>
                ) : (
                  <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs text-white">FAIL</span>
                )}
                <span className="font-medium">{r.title ?? r.jobId}</span>
                {r.company && <span className="text-slate-400">{r.company}</span>}
                {r.ok && r.resumeDisplayName && (
                  <span className="text-emerald-400">Resume: {r.resumeDisplayName}</span>
                )}
                {r.ok && (
                  <span className="flex gap-2">
                    <button
                      onClick={() =>
                        downloadWithAuth(
                          client.downloadMaterialUrl(r.jobId, "resume", "docx"),
                          "James-resume.docx"
                        )
                      }
                      className="text-slate-300 underline hover:text-white"
                    >
                      Resume
                    </button>
                    <button
                      onClick={() =>
                        downloadWithAuth(
                          client.downloadMaterialUrl(r.jobId, "cover-letter", "docx"),
                          "James-Cover-Letter.docx"
                        )
                      }
                      className="text-slate-300 underline hover:text-white"
                    >
                      Cover Letter
                    </button>
                  </span>
                )}
                {r.ok && r.applyUrl && (
                  <a
                    href={r.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 underline hover:text-emerald-300"
                  >
                    Apply
                  </a>
                )}
                {!r.ok && r.error && <span className="text-red-300">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={jobs.length > 0 && selectedIds.length === jobs.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(job.id)}
                    onChange={() => toggleSelect(job.id)}
                    aria-label={`Select ${job.title}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-900/50 px-2 py-1 text-emerald-300">
                    {Math.round(job.matchScore?.totalScore ?? 0)}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{job.title}</td>
                <td className="px-4 py-3">{job.company}</td>
                <td className="px-4 py-3 text-slate-400">{job.location ?? "—"}</td>
                <td className="px-4 py-3">
                  {job.applications?.[0] ? (
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        STATUS_STYLES[job.applications[0].status] ?? "bg-slate-700 text-slate-100"
                      }`}
                    >
                      {job.applications[0].status}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{job.source ?? "SEEK"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/jobs/${job.id}`} className="text-emerald-400 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No Seek jobs yet. Click &quot;Search Seek&quot; to import listings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
