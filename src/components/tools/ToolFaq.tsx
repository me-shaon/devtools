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
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">FAQ</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map(({ q, a }) => (
          <div key={q} className="space-y-1.5 rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">{q}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
