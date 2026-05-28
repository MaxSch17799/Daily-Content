export type Route =
  | { name: "today" }
  | { name: "archive" }
  | { name: "subscribe" }
  | { name: "admin" }
  | { name: "trades"; section?: string }
  | { name: "item"; id: string };

export function parseRoute(pathname = window.location.pathname): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "archive") {
    return { name: "archive" };
  }
  if (parts[0] === "subscribe") {
    return { name: "subscribe" };
  }
  if (parts[0] === "admin") {
    return { name: "admin" };
  }
  if (parts[0] === "trades") {
    return { name: "trades", section: parts[1] || "dashboard" };
  }
  if (parts[0] === "item" && parts[1]) {
    return { name: "item", id: decodeURIComponent(parts[1]) };
  }
  return { name: "today" };
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
