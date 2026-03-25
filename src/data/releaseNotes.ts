export interface ReleaseNotesEntry {
  version: string;
  title: string;
  markdown: string;
}

const RELEASE_NOTE_FILES = import.meta.glob("../../release-notes/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function parseReleaseNotes(filePath: string, markdown: string): ReleaseNotesEntry | null {
  const match = filePath.match(/release-notes\/v(.+)\.md$/);
  if (!match) {
    return null;
  }

  const version = match[1];
  const normalizedMarkdown = markdown.trim();
  const headingMatch = normalizedMarkdown.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim() || `Release v${version}`;
  const bodyMarkdown = headingMatch
    ? normalizedMarkdown.replace(/^#\s+.+\n*/m, "").trim()
    : normalizedMarkdown;

  return {
    version,
    title,
    markdown: bodyMarkdown,
  };
}

const RELEASE_NOTES = Object.entries(RELEASE_NOTE_FILES)
  .map(([filePath, markdown]) => parseReleaseNotes(filePath, markdown))
  .filter((entry): entry is ReleaseNotesEntry => Boolean(entry));

export function getReleaseNotes(version: string) {
  return RELEASE_NOTES.find((entry) => entry.version === version) ?? null;
}
