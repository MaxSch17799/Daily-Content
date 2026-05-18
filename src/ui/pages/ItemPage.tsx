import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, DailyItem, fetchItem } from "../../api";
import { navigate } from "../../router";
import { ItemView } from "../components/ItemView";
import { ErrorPanel, LoadingPanel } from "../components/StatusPanel";

export function ItemPage({ id, onViewerPasswordRequired }: { id: string; onViewerPasswordRequired: () => void }) {
  const [item, setItem] = useState<DailyItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchItem(id)
      .then((result) => {
        if (mounted) {
          setItem(result);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "viewer_password_required") {
          onViewerPasswordRequired();
        } else if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load item.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <section className="page-section">
      <button className="secondary-button" type="button" onClick={() => navigate("/archive")}>
        <ArrowLeft size={16} aria-hidden />
        Archive
      </button>
      {error && <ErrorPanel message={error} />}
      {!error && !item && <LoadingPanel label="Loading item" />}
      {item && <ItemView item={item} />}
    </section>
  );
}

