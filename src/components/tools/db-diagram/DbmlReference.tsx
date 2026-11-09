import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/tools/CopyButton";
import { DBML_REFERENCE } from "@/utils/db-diagram/reference";

/** Shows `backtick` spans as code. */
function richText(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/).map((part, index) => (part.startsWith("`") && part.length > 1 ? <code key={index}>{part.slice(1, -1)}</code> : part));
}

const sectionText = (section: (typeof DBML_REFERENCE)[number]) =>
  [section.title, ...section.text, ...(section.terms ?? []).flat(), section.example].join("\n").toLowerCase();

/** The DBML syntax reference, with a filter and a list of sections. */
export function DbmlReference() {
  const [query, setQuery] = useState("");
  const sections = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return DBML_REFERENCE.filter((section) => words.every((word) => sectionText(section).includes(word)));
  }, [query]);

  return (
    <div className="db-reference">
      <div className="db-reference-side">
        <input
          type="search"
          className="db-reference-filter"
          aria-label="Filter the reference"
          placeholder="Filter"
          value={query}
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        <nav aria-label="Sections">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#dbml-${section.id}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(`dbml-${section.id}`)?.scrollIntoView?.({ block: "start" });
              }}
            >
              {section.title}
            </a>
          ))}
        </nav>
      </div>
      <div className="db-reference-body">
        {sections.length === 0 && <p className="db-reference-empty">No section matches “{query}”.</p>}
        {sections.map((section) => (
          <section key={section.id} id={`dbml-${section.id}`} aria-labelledby={`dbml-${section.id}-title`}>
            <h3 id={`dbml-${section.id}-title`}>{section.title}</h3>
            {section.text.map((paragraph, index) => (
              <p key={index}>{richText(paragraph)}</p>
            ))}
            {section.terms && (
              <dl>
                {section.terms.map(([term, meaning]) => (
                  <div key={term}>
                    <dt>
                      <code>{term}</code>
                    </dt>
                    <dd>{richText(meaning)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="db-reference-example">
              <pre>{section.example}</pre>
              <CopyButton value={section.example} iconOnly ariaLabel={`Copy the ${section.title.toLowerCase()} example`} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
