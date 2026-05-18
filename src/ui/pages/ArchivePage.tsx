import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, DailyItem, fetchArchive } from "../../api";
import { navigate } from "../../router";
import { ItemView } from "../components/ItemView";
import { ErrorPanel, LoadingPanel } from "../components/StatusPanel";

export function ArchivePage({ onViewerPasswordRequired }: { onViewerPasswordRequired: () => void }) {
  const [items, setItems] = useState<DailyItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(offset = 0) {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchArchive(offset, 20);
      setItems((current) => (offset === 0 ? result.items : [...current, ...result.items]));
      setNextOffset(result.nextOffset);
    } catch (err) {
      if (err instanceof ApiError && err.code === "viewer_password_required") {
        onViewerPasswordRequired();
      } else {
        setError(err instanceof Error ? err.message : "Failed to load archive.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
  }, []);

  return (
    <section className="page-section">
      <div className="section-heading">
        <h1>Archive</h1>
        <button className="icon-button" type="button" onClick={() => void load(0)} aria-label="Refresh archive">
          <RefreshCw size={18} aria-hidden />
        </button>
      </div>

      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 && <LoadingPanel label="Loading archive" />}

      <div className="archive-list">
        {items.map((item) => (
          <button className="archive-item-button" type="button" key={item.id} onClick={() => navigate(`/item/${item.id}`)}>
            <ItemView item={item} compact />
          </button>
        ))}
      </div>

      {nextOffset !== null && (
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void load(nextOffset)}>
          {loading ? "Loading" : "Load more"}
        </button>
      )}
    </section>
  );
}

