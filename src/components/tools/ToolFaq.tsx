export interface ToolFaqItem {
  q: string;
  a: string;
}

interface ToolFaqSectionProps {
  items: ToolFaqItem[];
}

export function ToolFaqSection({ items }: ToolFaqSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <details className="tool-help">
      <summary>Help & reference</summary>
      <div className="tool-help-content">
        {items.map(({ q, a }) => (
          <details key={q} className="tool-help-question">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </details>
  );
}
