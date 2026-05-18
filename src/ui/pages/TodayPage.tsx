import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, DailyItem, fetchToday } from "../../api";
import { ItemView } from "../components/ItemView";
import { ErrorPanel, LoadingPanel } from "../components/StatusPanel";

export function TodayPage({ onViewerPasswordRequired }: { onViewerPasswordRequired: () => void }) {
  const [item, setItem] = useState<DailyItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItem(await fetchToday());
    } catch (err) {
      if (err instanceof ApiError && err.code === "viewer_password_required") {
        onViewerPasswordRequired();
      } else {
        setError(err instanceof Error ? err.message : "Failed to load today's item.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <LoadingPanel label="Loading today's item" />;
  }

  if (error) {
    return (
      <section className="page-section">
        <ErrorPanel message={error} />
        <button className="secondary-button" type="button" onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden />
          Retry
        </button>
      </section>
    );
  }

  if (!item) {
    return <ErrorPanel message="No item available yet." />;
  }

  return (
    <section className="page-section">
      <ItemView item={item} />
    </section>
  );
}

