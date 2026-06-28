import { Download, Eye, EyeOff, Info, Lock, PauseCircle, Play, Plus, RefreshCw, Save, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import {
  AdminSummary,
  DailyItem,
  Mode,
  ModeSaveInput,
  dispatchGeneration,
  fetchAdminSummary,
  saveAdminMode,
  updateAdminSettings,
  updateItemVisibility
} from "../../api";
import { ErrorPanel, LoadingPanel } from "../components/StatusPanel";

type ModeDraft = ModeSaveInput;

export function AdminPage() {
  const [password, setPassword] = useState(() => localStorage.getItem("adminPassword") || "");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [activeMode, setActiveMode] = useState("");
  const [publicLock, setPublicLock] = useState(false);
  const [generationPaused, setGenerationPaused] = useState(false);
  const [homepageMode, setHomepageMode] = useState<"latest" | "archive_cycle">("latest");
  const [selectedModeId, setSelectedModeId] = useState("");
  const [modeDraft, setModeDraft] = useState<ModeDraft>(() => createEmptyModeDraft());
  const [showModeTips, setShowModeTips] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const totalRequestsToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (summary?.usageCounters ?? [])
      .filter((counter) => counter.day === today)
      .reduce((sum, counter) => sum + counter.requests, 0);
  }, [summary]);

  async function load(currentPassword = password, preferredModeId = selectedModeId) {
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
      setGenerationPaused(result.settings.generation_paused === "1");
      setHomepageMode(normalizeHomepageMode(result.settings.homepage_mode));
      const nextMode = getSelectedMode(result.modes, preferredModeId || result.settings.active_mode);
      if (nextMode) {
        setSelectedModeId(nextMode.id);
        setModeDraft(modeToDraft(nextMode));
      }
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
      await updateAdminSettings(password, { activeMode, publicLock, generationPaused, homepageMode });
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

  async function toggleItemVisibility(item: DailyItem) {
    const nextPublished = !item.published;
    setSavingItemId(item.id);
    setMessage(null);
    setError(null);
    try {
      await updateItemVisibility(password, item.id, nextPublished);
      setSummary((current) =>
        current
          ? {
              ...current,
              recentItems: current.recentItems.map((recentItem) =>
                recentItem.id === item.id ? { ...recentItem, published: nextPublished } : recentItem
              )
            }
          : current
      );
      setMessage(nextPublished ? "Item is visible in the public archive." : "Item is hidden from the public archive.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Visibility update failed.");
    } finally {
      setSavingItemId(null);
    }
  }

  async function saveMode(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const mode = normalizeModeDraft(modeDraft);
      await saveAdminMode(password, mode);
      setSelectedModeId(mode.id);
      setMessage("Mode saved.");
      await load(password, mode.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mode save failed.");
    }
  }

  function selectMode(modeId: string) {
    const mode = summary?.modes.find((candidate) => candidate.id === modeId);
    setSelectedModeId(modeId);
    if (mode) {
      setModeDraft(modeToDraft(mode));
    }
  }

  function startNewMode() {
    setSelectedModeId("");
    setModeDraft(createEmptyModeDraft());
    setMessage(null);
    setError(null);
  }

  async function importModeYaml(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setMessage(null);
    setError(null);
    try {
      const parsed = YAML.parse(await file.text());
      const imported = normalizeModeDraft({
        id: readYamlString(parsed, "id"),
        label: readYamlString(parsed, "label"),
        language: readYamlString(parsed, "language") || "en",
        text_model: readYamlString(parsed, "text_model") || "gpt-5.4-mini",
        image_model: readYamlString(parsed, "image_model") || "gpt-image-1-mini",
        image_quality: readYamlString(parsed, "image_quality") || "medium",
        image_style: readYamlString(parsed, "image_style"),
        instructions: readYamlString(parsed, "instructions"),
        enabled: true
      });
      setSelectedModeId(imported.id);
      setModeDraft(imported);
      setMessage("YAML imported into the editor. Save the mode to store it in D1.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "YAML import failed.");
    }
  }

  function exportModeYaml() {
    try {
      const mode = normalizeModeDraft(modeDraft);
      const yaml = YAML.stringify(
        {
          id: mode.id,
          label: mode.label,
          language: mode.language,
          text_model: mode.text_model,
          image_model: mode.image_model,
          image_quality: mode.image_quality,
          image_style: mode.image_style,
          instructions: mode.instructions
        },
        { lineWidth: 0 }
      );
      const blob = new Blob([yaml], { type: "application/yaml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${mode.id}.yaml`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "YAML export failed.");
    }
  }

  function updateModeDraft<K extends keyof ModeDraft>(key: K, value: ModeDraft[K]) {
    setModeDraft((current) => ({ ...current, [key]: value }));
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
            <div className="metric">
              <span>Generation</span>
              <strong>{summary.settings.generation_paused === "1" ? "Paused" : "Active"}</strong>
            </div>
            <div className="metric">
              <span>Homepage</span>
              <strong>{homepageModeLabel(summary.settings.homepage_mode)}</strong>
            </div>
          </div>

          <form className="admin-grid" onSubmit={saveSettings}>
            <label>
              Mode
              <select value={activeMode} onChange={(event) => setActiveMode(event.target.value)}>
                {summary.modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.enabled === 1 ? mode.label : `${mode.label} (disabled)`}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={publicLock} onChange={(event) => setPublicLock(event.target.checked)} />
              Require viewer password
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={generationPaused}
                onChange={(event) => setGenerationPaused(event.target.checked)}
              />
              Pause generation
            </label>
            <label>
              Homepage display
              <select value={homepageMode} onChange={(event) => setHomepageMode(normalizeHomepageMode(event.target.value))}>
                <option value="latest">Newest item</option>
                <option value="archive_cycle">Daily archive rotation</option>
              </select>
            </label>
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Save settings
            </button>
            <button className="secondary-button" type="button" onClick={() => void runGenerator()} disabled={generationPaused}>
              {generationPaused ? <PauseCircle size={16} aria-hidden /> : <Play size={16} aria-hidden />}
              {generationPaused ? "Paused" : "Run generator"}
            </button>
          </form>

          <section className="mode-editor">
            <div className="mode-editor-header">
              <h2>Mode editor</h2>
              <div className="mode-editor-toolbar">
                <button className="icon-button" type="button" onClick={startNewMode} aria-label="New mode">
                  <Plus size={18} aria-hidden />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  aria-label="Import YAML"
                >
                  <Upload size={18} aria-hidden />
                </button>
                <button className="icon-button" type="button" onClick={exportModeYaml} aria-label="Export YAML">
                  <Download size={18} aria-hidden />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setShowModeTips((current) => !current)}
                  aria-label="Mode tips"
                  aria-expanded={showModeTips}
                >
                  <Info size={18} aria-hidden />
                </button>
              </div>
            </div>
            <input
              ref={importInputRef}
              className="mode-file-input"
              type="file"
              accept=".yaml,.yml,application/yaml,text/yaml,text/plain"
              onChange={(event) => void importModeYaml(event)}
            />
            {showModeTips && (
              <div className="mode-tips">
                Use lowercase ids with underscores. Keep image prompts visual, avoid asking for readable text in images,
                and include a line that prevents repeats.
              </div>
            )}
            <form className="mode-editor-grid" onSubmit={saveMode}>
              <label>
                Existing mode
                <select value={selectedModeId} onChange={(event) => selectMode(event.target.value)}>
                  <option value="">New mode</option>
                  {summary.modes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ID
                <input
                  value={modeDraft.id}
                  onChange={(event) => updateModeDraft("id", modeIdFromLabel(event.target.value))}
                  placeholder="absurd_tech_breakthrough"
                />
              </label>
              <label>
                Label
                <input value={modeDraft.label} onChange={(event) => updateModeDraft("label", event.target.value)} />
              </label>
              <label>
                Language
                <input value={modeDraft.language} onChange={(event) => updateModeDraft("language", event.target.value)} />
              </label>
              <label>
                Text model
                <input
                  value={modeDraft.text_model}
                  onChange={(event) => updateModeDraft("text_model", event.target.value)}
                />
              </label>
              <label>
                Image model
                <input
                  value={modeDraft.image_model}
                  onChange={(event) => updateModeDraft("image_model", event.target.value)}
                />
              </label>
              <label>
                Image quality
                <select
                  value={modeDraft.image_quality}
                  onChange={(event) => updateModeDraft("image_quality", event.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="checkbox-row mode-enabled">
                <input
                  type="checkbox"
                  checked={modeDraft.enabled}
                  onChange={(event) => updateModeDraft("enabled", event.target.checked)}
                />
                Enabled
              </label>
              <label className="wide-field">
                Image style
                <textarea
                  rows={3}
                  value={modeDraft.image_style}
                  onChange={(event) => updateModeDraft("image_style", event.target.value)}
                />
              </label>
              <label className="wide-field">
                Instructions
                <textarea
                  rows={8}
                  value={modeDraft.instructions}
                  onChange={(event) => updateModeDraft("instructions", event.target.value)}
                />
              </label>
              <div className="mode-editor-actions">
                <button className="primary-button" type="submit">
                  <Save size={16} aria-hidden />
                  Save mode
                </button>
              </div>
            </form>
          </section>

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
            nowrap
          />

          <AdminArchive
            items={summary.recentItems}
            savingItemId={savingItemId}
            onToggleVisibility={(item) => void toggleItemVisibility(item)}
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

function formatMode(mode: string): string {
  return mode
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeHomepageMode(value: string | undefined): "latest" | "archive_cycle" {
  return value === "archive_cycle" ? "archive_cycle" : "latest";
}

function homepageModeLabel(value: string | undefined): string {
  return normalizeHomepageMode(value) === "archive_cycle" ? "Archive rotation" : "Newest item";
}

function createEmptyModeDraft(): ModeDraft {
  return {
    id: "",
    label: "",
    language: "en",
    text_model: "gpt-5.4-mini",
    image_model: "gpt-image-1-mini",
    image_quality: "medium",
    instructions: "Create one original item in English.\nDo not repeat recent items.",
    image_style: "editorial illustration, clear subject, no readable text in image",
    enabled: true
  };
}

function getSelectedMode(modes: Mode[], preferredId?: string): Mode | undefined {
  return modes.find((mode) => mode.id === preferredId) || modes[0];
}

function modeToDraft(mode: Mode): ModeDraft {
  return {
    id: mode.id,
    label: mode.label,
    language: mode.language,
    text_model: mode.text_model,
    image_model: mode.image_model,
    image_quality: mode.image_quality,
    instructions: mode.instructions,
    image_style: mode.image_style,
    enabled: mode.enabled === 1
  };
}

function normalizeModeDraft(draft: ModeDraft): ModeDraft {
  const mode = {
    id: modeIdFromLabel(draft.id),
    label: draft.label.trim(),
    language: draft.language.trim() || "en",
    text_model: draft.text_model.trim(),
    image_model: draft.image_model.trim(),
    image_quality: draft.image_quality.trim(),
    instructions: draft.instructions.trim(),
    image_style: draft.image_style.trim(),
    enabled: draft.enabled
  };

  if (!/^[a-z0-9][a-z0-9_-]{1,80}$/.test(mode.id)) {
    throw new Error("Mode ID must use lowercase letters, numbers, underscores, or hyphens.");
  }
  if (!mode.label || !mode.text_model || !mode.image_model || !mode.instructions || !mode.image_style) {
    throw new Error("Mode fields cannot be empty.");
  }
  if (!["low", "medium", "high"].includes(mode.image_quality)) {
    throw new Error("Image quality must be low, medium, or high.");
  }

  return mode;
}

function readYamlString(parsed: unknown, key: string): string {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  const value = (parsed as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function modeIdFromLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function savePassword(
  event: FormEvent,
  password: string,
  load: (password: string, preferredModeId?: string) => Promise<void>
) {
  event.preventDefault();
  localStorage.setItem("adminPassword", password);
  await load(password);
}

function AdminTable({
  title,
  headers,
  rows,
  nowrap = false
}: {
  title: string;
  headers: string[];
  rows: string[][];
  nowrap?: boolean;
}) {
  return (
    <section className="table-section">
      <h2>{title}</h2>
      <div className={nowrap ? "table-wrap nowrap" : "table-wrap"}>
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

function AdminArchive({
  items,
  savingItemId,
  onToggleVisibility
}: {
  items: DailyItem[];
  savingItemId: string | null;
  onToggleVisibility: (item: DailyItem) => void;
}) {
  return (
    <section className="table-section">
      <h2>Admin archive</h2>
      <div className="admin-archive-list">
        {items.map((item) => (
          <article className={item.published ? "admin-archive-item" : "admin-archive-item hidden"} key={item.id}>
            <div className="admin-archive-thumb">
              <img src={item.imageUrl} alt="" loading="lazy" />
            </div>
            <div className="admin-archive-copy">
              <div className="meta-line compact">
                <span>{formatTimestamp(item.createdAt)}</span>
                <span>{formatMode(item.mode)}</span>
                <span>{item.published ? "Visible" : "Hidden"}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
            </div>
            <button
              className="secondary-button visibility-button"
              type="button"
              onClick={() => onToggleVisibility(item)}
              disabled={savingItemId === item.id}
            >
              {item.published ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              {item.published ? "Hide" : "Show"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
