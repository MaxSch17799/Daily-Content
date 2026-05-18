export function LoadingPanel({ label = "Loading" }: { label?: string }) {
  return <div className="status-panel">{label}</div>;
}

export function ErrorPanel({ message }: { message: string }) {
  return <div className="status-panel error">{message}</div>;
}

