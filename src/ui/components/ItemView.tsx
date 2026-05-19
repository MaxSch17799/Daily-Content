import { Calendar, Tag } from "lucide-react";
import type { DailyItem } from "../../api";

export function ItemView({ item, compact = false }: { item: DailyItem; compact?: boolean }) {
  if (!compact) {
    return (
      <article className="daily-article">
        <header className="daily-header">
          <div className="meta-line">
            <span>
              <Calendar size={16} aria-hidden />
              {formatTimestamp(item.createdAt)}
            </span>
            <span>{formatMode(item.mode)}</span>
          </div>
          <h1>{item.title}</h1>
        </header>
        <div className="daily-body">
          <div className="daily-image-wrap">
            <img src={item.imageUrl} alt="" loading="eager" />
          </div>
          <div className="daily-copy">
            <p className="lede">{item.notificationText}</p>
            <div className="full-text">{splitParagraphs(item.fullText).map((line) => <p key={line}>{line}</p>)}</div>
            <div className="tag-list" aria-label="Tags">
              {item.tags.map((tag) => (
                <span key={tag}>
                  <Tag size={14} aria-hidden />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="item-row">
      <div className="item-row-image">
        <img src={item.imageUrl} alt="" loading="lazy" />
      </div>
      <div className="item-row-copy">
        <div className="meta-line">
          <span>
            <Calendar size={16} aria-hidden />
            {formatTimestamp(item.createdAt)}
          </span>
          <span>{formatMode(item.mode)}</span>
        </div>
        <h1>{item.title}</h1>
        <p className="lede">{item.summary}</p>
        <div className="tag-list" aria-label="Tags">
          {item.tags.map((tag) => (
            <span key={tag}>
              <Tag size={14} aria-hidden />
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatMode(mode: string): string {
  return mode
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
