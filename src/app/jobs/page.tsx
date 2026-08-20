"use client";

import { useEffect, useState } from "react";
import type { JobDto } from "@/types/api";
import { formatDistanceToNow } from "date-fns";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [name, setName] = useState("");
  const [jenkinsPath, setJenkinsPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  function load() {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs);
  }

  useEffect(load, []);

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, jenkinsPath }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(JSON.stringify(data.error ?? "Failed to add job"));
        return;
      }
      setName("");
      setJenkinsPath("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(job: JobDto) {
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    load();
  }

  async function removeJob(job: JobDto) {
    if (!confirm(`Delete job "${job.name}" and all related data (tests, failures, tickets)?`)) return;
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    load();
  }

  async function syncOne(job: JobDto) {
    setSyncingId(job.id);
    try {
      const res = await fetch(`/api/sync?jobId=${job.id}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Sync failed");
      }
      load();
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Jenkins jobs</h1>

      <form onSubmit={addJob} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Display name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. backend-integration-tests"
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Jenkins job path
          </label>
          <input
            required
            value={jenkinsPath}
            onChange={(e) => setJenkinsPath(e.target.value)}
            placeholder="e.g. team-folder/backend-integration-tests"
            className="rounded-md border px-2 py-1.5 text-sm font-mono"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {saving ? "Adding…" : "Add job"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Jenkins path</th>
              <th className="px-4 py-2 text-left font-medium">Tests</th>
              <th className="px-4 py-2 text-left font-medium">Last sync</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-4 py-2 font-medium">{job.name}</td>
                <td className="px-4 py-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                  {job.jenkinsPath}
                </td>
                <td className="px-4 py-2">{job._count.testCases}</td>
                <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                  {job.lastSyncAt
                    ? formatDistanceToNow(new Date(job.lastSyncAt), { addSuffix: true })
                    : "never"}
                  {job.lastSyncError && (
                    <div className="text-xs" style={{ color: "var(--status-critical)" }}>
                      {job.lastSyncError}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleEnabled(job)}
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: job.enabled ? "var(--status-good)" : "var(--gridline)",
                      color: job.enabled ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    {job.enabled ? "enabled" : "disabled"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => syncOne(job)}
                      disabled={syncingId === job.id}
                      className="text-xs underline disabled:opacity-60"
                      style={{ color: "var(--series-1)" }}
                    >
                      {syncingId === job.id ? "syncing…" : "sync"}
                    </button>
                    <button
                      onClick={() => removeJob(job)}
                      className="text-xs underline"
                      style={{ color: "var(--status-critical)" }}
                    >
                      delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                  No jobs configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        The job path is its location in Jenkins as it appears in the URL, e.g. for{" "}
        <code>https://jenkins/job/team/job/my-tests/</code> use <code>team/my-tests</code>.
        The Jenkins connection (URL, user, token) is configured in the <code>.env</code> file.
      </p>
    </div>
  );
}
