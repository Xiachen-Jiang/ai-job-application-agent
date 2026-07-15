"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { client } from "@/lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<{ byStatus: { status: string; _count: { status: number } }[]; totalJobs: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    client
      .getStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-slate-400">Track your job search pipeline and application progress.</p>
      </div>

      {error && <p className="rounded-lg bg-red-900/40 p-3 text-red-200">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Jobs" value={stats?.totalJobs ?? 0} />
        {stats?.byStatus.map((s) => (
          <StatCard key={s.status} label={s.status} value={s._count.status} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ActionCard href="/jobs" title="Search Jobs" desc="Run APS Jobs search and review match scores." />
        <ActionCard href="/applications" title="Applications" desc="Track saved, applied, and interview stages." />
        <ActionCard href="/settings" title="Settings" desc="Update profile, skills, and master resume." />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-emerald-400">{value}</p>
    </div>
  );
}

function ActionCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-emerald-500/50"
    >
      <h2 className="font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{desc}</p>
    </Link>
  );
}
