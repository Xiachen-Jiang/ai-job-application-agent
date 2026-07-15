"use client";

import { useEffect, useState } from "react";
import { client, type MasterResumeRecord } from "@/lib/api";

export default function SettingsPage() {
  const [profile, setProfile] = useState({
    email: "jiangxiachen01@outlook.com",
    targetRolesText: "",
    targetLocationsText: "",
    skillsText: "",
    minSalaryAud: 85000,
    visaSponsorshipRequired: false,
    preferredWorkType: "HYBRID",
  });
  const [resumes, setResumes] = useState<MasterResumeRecord[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([client.getProfile(), client.listMasterResumes()])
      .then(([p, resumeList]) => {
        if (p) {
          setProfile({
            email: String(p.email ?? ""),
            targetRolesText: ((p.targetRoles as string[]) ?? []).join(", "),
            targetLocationsText: ((p.targetLocations as string[]) ?? []).join(", "),
            skillsText: ((p.skills as string[]) ?? []).join(", "),
            minSalaryAud: Number(p.minSalaryAud ?? 85000),
            visaSponsorshipRequired: Boolean(p.visaSponsorshipRequired),
            preferredWorkType: String(p.preferredWorkType ?? "HYBRID"),
          });
        }
        setResumes(resumeList);
      })
      .catch((e) => setError(e.message));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await client.updateProfile({
        email: profile.email,
        targetRoles: profile.targetRolesText.split(",").map((s) => s.trim()).filter(Boolean),
        targetLocations: profile.targetLocationsText.split(",").map((s) => s.trim()).filter(Boolean),
        skills: profile.skillsText.split(",").map((s) => s.trim()).filter(Boolean),
        minSalaryAud: profile.minSalaryAud,
        visaSponsorshipRequired: profile.visaSponsorshipRequired,
        preferredWorkType: profile.preferredWorkType,
      });
      setMessage("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-slate-400">
          Six targeted resume templates are used for job applications. The system suggests the closest match per job; you can override on the job page.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-900/40 p-3 text-red-200">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-900/40 p-3 text-emerald-200">{message}</p>}

      <form onSubmit={saveProfile} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="font-semibold">Job Preferences</h2>
        <Field label="Email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} />
        <Field
          label="Target Roles (comma-separated)"
          value={profile.targetRolesText}
          onChange={(v) => setProfile({ ...profile, targetRolesText: v })}
        />
        <Field
          label="Target Locations"
          value={profile.targetLocationsText}
          onChange={(v) => setProfile({ ...profile, targetLocationsText: v })}
        />
        <Field
          label="Skills"
          value={profile.skillsText}
          onChange={(v) => setProfile({ ...profile, skillsText: v })}
        />
        <label className="block text-sm">
          <span className="text-slate-400">Min Salary (AUD)</span>
          <input
            type="number"
            value={profile.minSalaryAud}
            onChange={(e) => setProfile({ ...profile, minSalaryAud: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={profile.visaSponsorshipRequired}
            onChange={(e) => setProfile({ ...profile, visaSponsorshipRequired: e.target.checked })}
          />
          Visa sponsorship required
        </label>
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2">
          Save Profile
        </button>
      </form>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="font-semibold">Targeted Resume Templates</h2>
        <p className="text-sm text-slate-500">
          Source files live in <code className="text-slate-300">storage/resume-templates/</code> (or{" "}
          <code className="text-slate-300">RESUME_TEMPLATES_DIR</code> if set). Update the DOCX files there and re-run seed if filenames change.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2 pr-4">Profile</th>
                <th className="pb-2">Template file</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => (
                <tr key={resume.id} className="border-t border-slate-800">
                  <td className="py-3 pr-4 font-medium">{resume.displayName}</td>
                  <td className="py-3 text-slate-400">{resume.docxPath ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
      />
    </label>
  );
}
