import { Lock, Play, RefreshCw, Save } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminSummary, dispatchGeneration, fetchAdminSummary, updateAdminSettings } from "../../api";
import { ErrorPanel, LoadingPanel } from "../components/StatusPanel";

export function AdminPage() {
  const [password, setPassword] = useState(() => localStorage.getItem("adminPassword") || "");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [activeMode, setActiveMode] = useState("");
  const [publicLock, setPublicLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalRequestsToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (summary?.usageCounters ?? [])
      .filter((counter) => counter.day === today)
      .reduce((sum, counter) => sum + counter.requests, 0);
  }, [summary]);

  async function load(currentPassword = password) {
    if (!currentPassword) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem("adminPassword", currentPassword);
      const result = await fetchAdminSummary(currentPassword);
      setSummary(result);
      setActiveMode(result.settings.active_mode || "fictional_satire_news");
      setPublicLock(result.settings.public_lock === "1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin load failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateAdminSettings(password, { activeMode, publicLock });
      setMessage("Settings saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function runGenerator() {
    setMessage(null);
    setError(null);
    try {
      await dispatchGeneration(password);
      setMessage("GitHub generation workflow dispatched.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow dispatch failed.");
    }
  }

  useEffect(() => {
    if (password) {
      void load(password);
    }
  }, []);

  return (
    <section className="page-section">
      <div className="section-heading">
        <h1>Admin</h1>
        <button className="icon-button" type="button" onClick={() => void load()} aria-label="Refresh admin">
          <RefreshCw size={18} aria-hidden />
        </button>
      </div>

      <form className="admin-password-row" onSubmit={(event) => void savePassword(event, password, load)}>
        <Lock size={18} aria-hidden />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Admin password"
        />
        <button className="secondary-button" type="submit" disabled={!password}>
          Unlock
        </button>
      </form>

      {error && <ErrorPanel message={error} />}
      {message && <div className="success-panel">{message}</div>}
      {loading && <LoadingPanel label="Loading admin data" />}

      {summary && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span>Requests today</span>
              <strong>{totalRequestsToday.toLocaleString()}</strong>
            </div>
            <div className="metric">
              <span>Subscribers</span>
              <strong>{summary.subscriptionCount}</strong>
            </div>
            <div className="metric">
              <span>Active mode</span>
              <strong>{summary.settings.active_mode}</strong>
            </div>
            <div className="metric">
              <span>Public lock</span>
              <strong>{summary.settings.public_lock === "1" ? "On" : "Off"}</strong>
            </div>
          </div>

          <form className="admin-grid" onSubmit={saveSettings}>
            <label>
              Mode
              <select value={activeMode} onChange={(event) => setActiveMode(event.target.value)}>
                {summary.modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={publicLock} onChange={(event) => setPublicLock(event.target.checked)} />
              Require viewer password
            </label>
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Save settings
            </button>
            <button className="secondary-button" type="button" onClick={() => void runGenerator()}>
              <Play size={16} aria-hidden />
              Run generator
            </button>
          </form>

          <AdminTable
            title="Usage"
            headers={["Day", "Route", "Requests", "Rows read", "Rows written"]}
            rows={summary.usageCounters.map((counter) => [
              counter.day,
              counter.route,
              counter.requests.toLocaleString(),
              counter.rows_read.toLocaleString(),
              counter.rows_written.toLocaleString()
            ])}
          />

          <AdminTable
            title="Generation runs"
            headers={["Date", "Mode", "Status", "Message"]}
            rows={summary.generationRuns.map((run) => [
              run.run_date,
              run.mode || "",
              run.status,
              run.message || ""
            ])}
          />

          <AdminTable
            title="Recent items"
            headers={["Created", "Mode", "Title"]}
            rows={summary.recentItems.map((item) => [formatTimestamp(item.createdAt), item.mode, item.title])}
          />
        </>
      )}
    </section>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
}

async function savePassword(
  event: FormEvent,
  password: string,
  load: (password: string) => Promise<void>
) {
  event.preventDefault();
  localStorage.setItem("adminPassword", password);
  await load(password);
}

function AdminTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <section className="table-section">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
