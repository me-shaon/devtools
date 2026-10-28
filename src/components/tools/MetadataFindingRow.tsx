import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/tools/CopyButton";
import { CodeTextarea } from "@/components/tools/ToolWorkspace";
import type { MetadataFinding } from "@/utils/image-metadata";

/** One metadata item with its source, a Removed or Kept badge, and its full value when it is long. */
export function MetadataFindingRow({ finding, id, removed }: { finding: MetadataFinding; id: string; removed: boolean }) {
  const [open, setOpen] = useState(false);
  const value = finding.raw ?? finding.detail;
  return (
    <div className="border-b border-border/50">
      <div className="result-row border-b-0">
        <span className="result-row-label">
          {finding.label}
          <span className="block text-2xs font-normal">{finding.source}</span>
        </span>
        <span className="result-row-value">
          {finding.detail}
          <span className={`ml-2 rounded px-1.5 py-0.5 font-sans text-2xs ${removed ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {removed ? "Removed" : "Kept"}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {finding.raw && (
            <button
              type="button"
              className="toolbar-text-button"
              aria-expanded={open}
              aria-controls={`${id}-raw`}
              aria-label={`${open ? "Hide" : "Show"} full value of ${finding.label}`}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            </button>
          )}
          <CopyButton value={value} iconOnly label={`Copy ${finding.label}`} />
        </span>
      </div>
      {finding.raw && open && (
        <div id={`${id}-raw`} className="px-4 pb-3">
          <CodeTextarea
            readOnly
            value={finding.raw}
            aria-label={`Full value of ${finding.label}`}
            rows={Math.min(14, finding.raw.split("\n").length + 1)}
            className="h-auto max-h-80 rounded-md border bg-muted/40 text-xs"
          />
        </div>
      )}
    </div>
  );
}
