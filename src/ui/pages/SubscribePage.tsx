import { Bell, BellOff, CheckCircle2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { subscribeToPush, supportsPush } from "../../push";
import { ErrorPanel } from "../components/StatusPanel";

export function SubscribePage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      await subscribeToPush(password);
      setStatus("Notifications are enabled on this device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setLoading(false);
    }
  }

  const supported = supportsPush();

  return (
    <section className="page-section narrow">
      <div className="section-heading">
        <h1>Notifications</h1>
      </div>

      <div className="tool-panel">
        <div className="panel-icon">{supported ? <Bell size={24} aria-hidden /> : <BellOff size={24} aria-hidden />}</div>
        <div>
          <h2>Daily push</h2>
          <p>Enter the subscription password, then Android Chrome will ask whether this site can send notifications.</p>
        </div>
      </div>

      {!supported && <ErrorPanel message="This browser does not support Web Push notifications." />}
      {error && <ErrorPanel message={error} />}
      {status && (
        <div className="success-panel">
          <CheckCircle2 size={18} aria-hidden />
          {status}
        </div>
      )}

      <form className="form-stack" onSubmit={submit}>
        <label>
          Subscription password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            disabled={!supported || loading}
          />
        </label>
        <button className="primary-button" type="submit" disabled={!supported || !password || loading}>
          <Bell size={16} aria-hidden />
          {loading ? "Enabling" : "Enable notifications"}
        </button>
      </form>
    </section>
  );
}

