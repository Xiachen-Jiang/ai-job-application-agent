"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { client, downloadWithAuth, type Job } from "@/lib/api";

export default function AppliedJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .listJobs("recent", "SEEK", "applied")
      .then(setJobs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Applied Jobs</h1>
          <p className="mt-1 text-slate-400">
            Jobs you have marked as APPLIED. Active listings stay on{" "}
            <Link href="/jobs" className="text-emerald-400 hover:underline">
              Jobs
            </Link>
            .
          </p>
        </div>
        <Link
          href="/jobs"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
        >
          Back to Jobs
        </Link>
      </div>

      {error && <p className="rounded-lg bg-red-900/40 p-3 text-red-200">{error}</p>}

      {loading ? (
        <p className="text-slate-400">Loading applied jobs...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Materials</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const appliedDate = job.applications?.[0]?.appliedDate;
                return (
                  <tr key={job.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                    <td className="px-4 py-3 text-slate-300">
                      {appliedDate ? new Date(appliedDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">{job.title}</td>
                    <td className="px-4 py-3">{job.company}</td>
                    <td className="px-4 py-3 text-slate-400">{job.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-900/50 px-2 py-1 text-emerald-300">
                        {Math.round(job.matchScore?.totalScore ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            downloadWithAuth(
                              client.downloadMaterialUrl(job.id, "resume", "docx"),
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
                              client.downloadMaterialUrl(job.id, "cover-letter", "docx"),
                              "James-Cover-Letter.docx"
                            )
                          }
                          className="text-slate-300 underline hover:text-white"
                        >
                          Cover
                        </button>
                        {job.applyUrl && (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 underline hover:text-emerald-300"
                          >
                            Seek
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/jobs/${job.id}`} className="text-emerald-400 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No applied jobs yet. Mark jobs as APPLIED from the Jobs page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
