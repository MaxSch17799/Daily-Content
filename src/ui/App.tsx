import { Archive, Bell, Briefcase, CalendarDays, Gauge, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { parseRoute, Route, navigate } from "../router";
import { AdminPage } from "./pages/AdminPage";
import { ArchivePage } from "./pages/ArchivePage";
import { ItemPage } from "./pages/ItemPage";
import { SubscribePage } from "./pages/SubscribePage";
import { TodayPage } from "./pages/TodayPage";
import { TradesPage } from "./pages/TradesPage";
import { ViewerPasswordDialog } from "./components/ViewerPasswordDialog";

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [viewerPasswordRequired, setViewerPasswordRequired] = useState(false);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => navigate("/")}>
          <Newspaper size={22} aria-hidden />
          <span>Daily Content</span>
        </button>
        <nav className="nav-links" aria-label="Primary">
          <NavButton icon={<CalendarDays size={18} />} label="Today" active={route.name === "today"} path="/" />
          <NavButton icon={<Archive size={18} />} label="Archive" active={route.name === "archive"} path="/archive" />
          <NavButton icon={<Bell size={18} />} label="Subscribe" active={route.name === "subscribe"} path="/subscribe" />
          <NavButton icon={<Briefcase size={18} />} label="Trades" active={route.name === "trades"} path="/trades" />
          <NavButton icon={<Gauge size={18} />} label="Admin" active={route.name === "admin"} path="/admin" />
        </nav>
      </header>

      <main>
        {route.name === "today" && <TodayPage onViewerPasswordRequired={() => setViewerPasswordRequired(true)} />}
        {route.name === "archive" && <ArchivePage onViewerPasswordRequired={() => setViewerPasswordRequired(true)} />}
        {route.name === "item" && <ItemPage id={route.id} onViewerPasswordRequired={() => setViewerPasswordRequired(true)} />}
        {route.name === "subscribe" && <SubscribePage />}
        {route.name === "admin" && <AdminPage />}
        {route.name === "trades" && <TradesPage section={route.section} />}
      </main>

      {viewerPasswordRequired && (
        <ViewerPasswordDialog
          onClose={() => setViewerPasswordRequired(false)}
          onSaved={() => {
            setViewerPasswordRequired(false);
            setRoute(parseRoute());
          }}
        />
      )}
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  path
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  path: string;
}) {
  return (
    <button className={active ? "nav-button active" : "nav-button"} type="button" onClick={() => navigate(path)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
