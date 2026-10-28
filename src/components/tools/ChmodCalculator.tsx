import { useMemo, useRef, useState } from "react";
import { FileLock2, Terminal } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import {
  CLASSES,
  PERMS,
  PRESETS,
  SPECIAL_BITS,
  applyExpression,
  chmodCommands,
  explainMode,
  formatLs,
  formatOctal,
  formatSymbolic,
  parseModeInput,
  parseSymbolic,
  parseUmask,
  umaskDefaults,
} from "@/utils/chmod";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "What do the octal digits mean?",
    a: "Each digit adds read (4), write (2), and execute (1). The last three digits are for the owner, the group, and others. So 755 gives the owner 7 (read, write, and execute) and gives the group and others 5 (read and execute). An optional first digit holds setuid (4), setgid (2), and sticky (1).",
  },
  {
    q: "What do s, S, t, and T mean in ls -l output?",
    a: "A lowercase s or t means that the special bit and the execute bit are both set. A capital S or T means that the special bit is set without execute. Setuid and setgid show in the owner and group execute positions. Sticky shows in the others execute position.",
  },
  {
    q: "What does +x do without u, g, o, or a?",
    a: "Real chmod adds execute for all classes, but skips the bits that your umask blocks. This tool has no umask, so it reads `+x` as `a+x`. With umask 022, both give the same result.",
  },
  {
    q: "What is the difference between x and X?",
    a: "`x` always adds execute. `X` adds execute only to a directory, or to a file that already has an execute bit. Use `chmod -R u=rwX,go=rX dir` to make directories enterable without making every file executable. Set the Directory switch to see how `X` acts on a directory.",
  },
  {
    q: "How does the umask set the default mode?",
    a: "A program usually creates a file with mode 666 and a directory with mode 777. The kernel then removes the bits that the umask sets. With umask 022, new files get 644 and new directories get 755.",
  },
];

/** Applies a parsed file type to the Directory switch. Types other than file and directory leave it as it is. */
const directoryFor = (fileType: string | undefined, current: boolean) => (fileType === "directory" ? true : fileType === "file" ? false : current);

export function ChmodCalculator() {
  const [mode, setMode] = useState(0o755);
  const [isDirectory, setIsDirectory] = useState(false);
  const [octalText, setOctalText] = useState("755");
  const [octalError, setOctalError] = useState<string | null>(null);
  const [octalNote, setOctalNote] = useState<string | null>(null);
  const [symbolicText, setSymbolicText] = useState("rwxr-xr-x");
  const [symbolicError, setSymbolicError] = useState<string | null>(null);
  const [expression, setExpression] = useState("");
  const [path, setPath] = useState("file");
  const [recursive, setRecursive] = useState(false);
  const [umaskText, setUmaskText] = useState("022");
  // The mode before the user started to type an expression in the Octal field. Each keystroke applies
  // the expression to this mode, so u+w followed by a backspace does not keep the w.
  const expressionBase = useRef<number | null>(null);

  /** Sets the mode and rewrites every text field except the one the user is typing in. */
  const update = (next: number, source?: "octal" | "symbolic") => {
    setMode(next);
    if (source !== "octal") {
      expressionBase.current = null;
      setOctalText(formatOctal(next));
      setOctalError(null);
      setOctalNote(null);
    }
    if (source !== "symbolic") {
      setSymbolicText(formatSymbolic(next));
      setSymbolicError(null);
    }
  };

  const changeOctal = (text: string) => {
    setOctalText(text);
    const base = expressionBase.current ?? mode;
    const result = parseModeInput(text, base, isDirectory);
    if ("error" in result) {
      // Keep the base through a half-typed expression, such as "a+z" on the way to "a+r".
      setOctalError(result.error);
      setOctalNote(null);
      return;
    }
    setOctalError(null);
    expressionBase.current = result.kind === "expression" ? base : null;
    if (result.path !== undefined) setPath(result.path);
    if (result.recursive !== undefined) setRecursive(result.recursive);
    if (result.fileType) setIsDirectory(directoryFor(result.fileType, isDirectory));
    setOctalNote(result.kind === "octal" && result.path === undefined ? null : `Read as ${formatOctal(result.mode)}.`);
    update(result.mode, "octal");
  };

  const changeSymbolic = (text: string) => {
    setSymbolicText(text);
    const result = parseSymbolic(text);
    if ("error" in result) {
      setSymbolicError(result.error);
      return;
    }
    setSymbolicError(null);
    setIsDirectory(directoryFor(result.fileType, isDirectory));
    update(result.mode, "symbolic");
  };

  const toggleBit = (bit: number) => update(mode ^ bit);

  const preview = useMemo(() => (expression.trim() ? applyExpression(mode, expression, isDirectory) : null), [mode, expression, isDirectory]);
  const applyPreview = () => {
    if (preview?.ok) update(preview.mode);
  };

  const commands = chmodCommands(mode, path, recursive);
  const lsText = formatLs(mode, isDirectory);
  const sentences = explainMode(mode, isDirectory);
  const umask = parseUmask(umaskText);
  const defaults = umask.ok ? umaskDefaults(umask.mode) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileLock2 className="h-5 w-5" />
            Permissions
          </CardTitle>
          <CardDescription>Type a mode, paste an ls -l string or a chmod command, or set the bits below. All fields stay in sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chmod-octal">Octal</Label>
              <Input
                id="chmod-octal"
                type="text"
                aria-invalid={Boolean(octalError)}
                spellCheck={false}
                autoComplete="off"
                placeholder="755, 4755, or chmod 755 file"
                value={octalText}
                onChange={(event) => changeOctal(event.target.value)}
                className="font-mono"
              />
              {octalError ? (
                <p className="text-xs text-destructive" role="alert">
                  {octalError}
                </p>
              ) : (
                octalNote && (
                  <p className="text-xs text-muted-foreground" role="status">
                    {octalNote}
                  </p>
                )
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="chmod-symbolic">Symbolic</Label>
              <Input
                id="chmod-symbolic"
                type="text"
                aria-invalid={Boolean(symbolicError)}
                spellCheck={false}
                autoComplete="off"
                placeholder="rwxr-xr-x or drwxrwxrwt"
                value={symbolicText}
                onChange={(event) => changeSymbolic(event.target.value)}
                className="font-mono"
              />
              {symbolicError && (
                <p className="text-xs text-destructive" role="alert">
                  {symbolicError}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
            {PRESETS.map((preset) => (
              <Button
                key={preset.mode}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={mode === preset.mode}
                onClick={() => update(preset.mode)}
              >
                <span className="font-mono font-semibold">{formatOctal(preset.mode)}</span>
                <span className="text-muted-foreground">{preset.label}</span>
              </Button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-[auto_1fr]">
            <table className="text-sm" aria-label="Permission bits">
              <thead>
                <tr>
                  <th scope="col" />
                  {PERMS.map((perm) => (
                    <th key={perm.perm} scope="col" className="px-3 pb-2 text-center text-xs font-medium text-muted-foreground">
                      {perm.label}
                    </th>
                  ))}
                  <th scope="col" className="px-3 pb-2 text-center text-xs font-medium text-muted-foreground">
                    Digit
                  </th>
                </tr>
              </thead>
              <tbody>
                {CLASSES.map((item) => (
                  <tr key={item.who} className="border-t border-border/50">
                    <th scope="row" className="py-2 pr-4 text-left font-medium">
                      {item.label}
                    </th>
                    {PERMS.map((perm) => {
                      const bit = perm.bit << item.shift;
                      return (
                        <td key={perm.perm} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            aria-label={`${item.label} ${perm.label.toLowerCase()}`}
                            checked={(mode & bit) !== 0}
                            onChange={() => toggleBit(bit)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-mono">{(mode >> item.shift) & 7}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Special bits</h3>
              <div className="flex flex-wrap gap-4">
                {SPECIAL_BITS.map((special) => (
                  <label key={special.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={(mode & special.bit) !== 0} onChange={() => toggleBit(special.bit)} />
                    {special.label}
                  </label>
                ))}
              </div>
              <label className="option-switch" htmlFor="chmod-directory">
                Directory
                <Switch id="chmod-directory" checked={isDirectory} onCheckedChange={setIsDirectory} />
              </label>
              <p className="text-xs text-muted-foreground">Set this for a directory. It changes the ls -l type, the meaning of each bit, and how X acts.</p>
            </div>
          </div>

          <div className="space-y-1" aria-label="Explanation">
            {sentences.map((sentence, index) => (
              // The first three sentences cover owner, group, and others. The rest are notes.
              <p key={sentence} className={index < 3 ? "text-base font-medium" : "text-sm text-muted-foreground"}>
                {sentence}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Commands
          </CardTitle>
          <CardDescription>Copy a command that sets this mode.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48 flex-1 space-y-2">
              <Label htmlFor="chmod-path">File or directory</Label>
              <Input
                id="chmod-path"
                type="text"
                spellCheck={false}
                autoComplete="off"
                placeholder="file"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                className="font-mono"
              />
            </div>
            <label className="option-switch mb-2" htmlFor="chmod-recursive">
              Recursive (-R)
              <Switch id="chmod-recursive" checked={recursive} onCheckedChange={setRecursive} />
            </label>
          </div>
          {[
            { label: "Octal command", value: commands.octal },
            { label: "Symbolic command", value: commands.symbolic },
            { label: "ls -l", value: lsText },
          ].map((row) => (
            <div key={row.label} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{row.label}</Label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm" aria-label={row.label}>
                  {row.value}
                </code>
                <CopyButton value={row.value} ariaLabel={`Copy ${row.label}`} iconOnly />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apply an Expression</CardTitle>
          <CardDescription>Change the current mode with a chmod expression, such as u+x, go-w, a=r, or u=rwx,g=rx,o=.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applyPreview();
            }}
          >
            <Input
              type="text"
              aria-label="Expression"
              aria-invalid={preview ? !preview.ok : false}
              spellCheck={false}
              autoComplete="off"
              placeholder="u+x"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              className="min-w-48 flex-1 font-mono"
            />
            <Button type="submit" disabled={!preview?.ok}>
              Apply
            </Button>
          </form>
          {preview &&
            (preview.ok ? (
              <p className="text-sm" role="status">
                {formatOctal(mode)} ({formatSymbolic(mode)}) becomes{" "}
                <code className="font-mono font-medium">
                  {formatOctal(preview.mode)} ({formatSymbolic(preview.mode)})
                </code>
                .
              </p>
            ) : (
              <div className="workspace-notice rounded-md" data-tone="error" role="alert">
                {"error" in preview && preview.error}
              </div>
            ))}
          <p className="text-xs text-muted-foreground">A plain +x acts as a+x here. Real chmod also skips the bits that the umask blocks.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>umask</CardTitle>
          <CardDescription>Enter a umask to see the mode of new files and directories.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="text"
            aria-label="umask"
            aria-invalid={!umask.ok}
            spellCheck={false}
            autoComplete="off"
            placeholder="022"
            value={umaskText}
            onChange={(event) => setUmaskText(event.target.value)}
            className="w-32 font-mono"
          />
          {defaults ? (
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Default modes">
              {[
                { label: "New files", value: defaults.file },
                { label: "New directories", value: defaults.directory },
              ].map((row) => (
                <li key={row.label} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <code className="ml-auto font-mono text-sm">
                    {formatOctal(row.value)} ({formatSymbolic(row.value)})
                  </code>
                  <CopyButton value={formatOctal(row.value)} ariaLabel={`Copy ${row.label.toLowerCase()} mode`} iconOnly />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-destructive" role="alert">
              {"error" in umask && umask.error}
            </p>
          )}
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
