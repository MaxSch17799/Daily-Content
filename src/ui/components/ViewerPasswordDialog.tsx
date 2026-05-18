import { Lock } from "lucide-react";
import { FormEvent, useState } from "react";

export function ViewerPasswordDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem("viewerPassword", password);
    onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit}>
        <div className="modal-title">
          <Lock size={20} aria-hidden />
          <h2>Viewer password</h2>
        </div>
        <p>The public free-tier guard is active. Enter the viewer password to keep browsing.</p>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Viewer password"
        />
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!password}>
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}

