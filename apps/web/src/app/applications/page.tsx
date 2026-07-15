"use client";

import { useEffect, useState } from "react";
import { client, type Application } from "@/lib/api";

const STATUSES = ["SAVED", "APPLIED", "INTERVIEW", "REJECTED", "OFFER"];

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    client
      .listApplications()
      .then(setApps)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await client.updateApplication(id, {
        status,
        appliedDate: status === "APPLIED" ? new Date().toISOString() : undefined,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const exportFile = (format: "csv" | "xlsx") => {
    const url = client.exportUrl(format);
    const secret = process.env.NEXT_PUBLIC_API_SECRET ?? "change-me";
    fetch(url, { headers: { "x-api-secret": secret } })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `applications.${format === "xlsx" ? "xlsx" : "csv"}`;
        a.click();
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Applications</h1>
          <p className="mt-1 text-slate-400">Track every role from saved to offer.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportFile("csv")} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">
            Export CSV
          </button>
          <button onClick={() => exportFile("xlsx")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm">
            Export Excel
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-900/40 p-3 text-red-200">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Applied</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id} className="border-t border-slate-800">
                <td className="px-4 py-3">{app.company}</td>
                <td className="px-4 py-3">{app.role}</td>
                <td className="px-4 py-3">
                  <select
                    value={app.status}
                    onChange={(e) => updateStatus(app.id, e.target.value)}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {app.appliedDate ? new Date(app.appliedDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-slate-400">{app.notes ?? "—"}</td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No applications yet. Save a job from the job detail page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
