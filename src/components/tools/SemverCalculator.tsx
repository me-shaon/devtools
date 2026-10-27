import { useMemo, useState } from "react";
import { ArrowRightLeft, ListChecks } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  RANGE_EXAMPLES,
  VERSION_DIALECTS,
  compareVersions,
  evaluateRange,
  nextVersions,
  splitVersions,
  type VersionCheck,
  type VersionDialect,
} from "@/utils/semver";

const DEFAULT_VERSIONS = ["1.1.9", "1.2.0", "1.4.2", "1.9.0-beta.1", "2.0.0", "2.0.5", "2.1.0"].join("\n");

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Why does the same range mean different things in each package manager?",
    a: "Each tool has its own rules. A bare `1.2` is `^1.2` in Cargo, `1.2.x` in npm, and exactly 1.2.0 in Composer. Python needs an operator, such as `==1.2`. Pick the package manager first.",
  },
  {
    q: "What do ^ and ~ allow?",
    a: "A caret allows changes that keep the left-most non-zero number. So `^1.2.3` allows up to 2.0.0, and `^0.3.1` allows up to 0.4.0. In npm and Cargo, `~1.2.3` allows up to 1.3.0. In Composer, `~1.2` allows up to 2.0.0, because the last number given can change.",
  },
  {
    q: "How do I join comparators?",
    a: "npm: a space means AND, and `||` means OR. Cargo: a comma means AND, and there is no OR. Composer: a space or a comma means AND, and `||` means OR. Python: a comma means AND, and there is no OR.",
  },
  {
    q: "When does a pre-release match?",
    a: "npm and Cargo match a pre-release such as 1.3.0-beta.1 only when a comparator names a pre-release of 1.3.0. Composer matches it inside the bounds, but installs it only when minimum-stability or a flag such as `@beta` allows it. Python matches it only with `pip --pre`, or when a specifier names a pre-release.",
  },
  {
    q: "What do -0 and -dev mean in the normalized range?",
    a: "npm writes `<2.0.0-0` to exclude the pre-releases of 2.0.0. Composer adds `-dev`, its lowest stability, so `>=1.2.0.0-dev` includes 1.2.0 pre-releases and `<2.0.0.0-dev` excludes 2.0.0 pre-releases.",
  },
  {
    q: "How are versions ordered?",
    a: "npm and Cargo follow SemVer 2.0. A pre-release comes before its release, and build metadata does not count. Composer orders dev, alpha, beta, RC, stable, then patch. Python orders dev, a, b, rc, the final release, then post.",
  },
  {
    q: "Which rules does this tool follow?",
    a: "npm uses the semver package that npm itself uses. Cargo follows the Rust semver crate, and Composer follows composer/semver. Python follows PEP 440 as the packaging library implements it. Branch names such as `dev-main` are not supported.",
  },
];

const STATUS_TEXT: Record<NonNullable<VersionCheck["status"]>, { label: string; className: string }> = {
  match: { label: "Matches", className: "text-success" },
  miss: { label: "No match", className: "text-muted-foreground" },
  prerelease: { label: "Pre-release excluded", className: "text-warning" },
  unstable: { label: "Matches, not stable enough", className: "text-warning" },
};

const ORDER_TEXT = { [-1]: "<", 0: "=", 1: ">" } as const;

const isExample = (range: string) => Object.values(RANGE_EXAMPLES).some((examples) => examples.some((example) => example.range === range));

export function SemverCalculator() {
  const [dialect, setDialect] = useState<VersionDialect>("npm");
  const [range, setRange] = useState(RANGE_EXAMPLES.npm[0].range);
  const [versions, setVersions] = useState(DEFAULT_VERSIONS);
  const [left, setLeft] = useState("2.0.0-beta.11");
  const [right, setRight] = useState("2.0.0-rc.1");
  const [preid, setPreid] = useState("rc");

  const rangeText = useDebouncedValue(range);
  const versionsText = useDebouncedValue(versions);
  const leftText = useDebouncedValue(left);
  const rightText = useDebouncedValue(right);

  const result = useMemo(() => evaluateRange(dialect, rangeText, splitVersions(versionsText)), [dialect, rangeText, versionsText]);
  const comparison = useMemo(() => compareVersions(dialect, leftText, rightText), [dialect, leftText, rightText]);
  const next = useMemo(() => nextVersions(dialect, leftText, preid), [dialect, leftText, preid]);
  const dialectLabel = VERSION_DIALECTS.find((item) => item.id === dialect)?.label ?? dialect;

  const changeDialect = (value: string) => {
    const nextDialect = value as VersionDialect;
    setDialect(nextDialect);
    // Swap an untouched example for one in the new syntax. Keep a typed range, so the user can see how it reads.
    if (isExample(range)) setRange(RANGE_EXAMPLES[nextDialect][0].range);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Version Range
          </CardTitle>
          <CardDescription>Check which versions a range allows. Each package manager reads ranges differently, so pick yours first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={dialect} onValueChange={changeDialect}>
            <TabsList aria-label="Package manager">
              {VERSION_DIALECTS.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="space-y-2">
            <Label htmlFor="semver-range">Range</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="semver-range"
                type="text"
                aria-label="Range"
                aria-invalid={!result.ok}
                aria-describedby="semver-explanation"
                spellCheck={false}
                autoComplete="off"
                placeholder="e.g., ^1.2 || ~2.0"
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="min-w-48 flex-1 font-mono"
              />
              <Select value="" onValueChange={setRange}>
                <SelectTrigger className="h-8 w-40 shrink-0" aria-label="Examples">
                  <SelectValue placeholder="Examples" />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_EXAMPLES[dialect].map((example) => (
                    <SelectItem key={example.range} value={example.range}>
                      {example.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div id="semver-explanation" className="space-y-2">
            {result.ok ? (
              <>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm" aria-label="Normalized range">
                    {result.explanation.normalized}
                  </code>
                  <CopyButton value={result.explanation.normalized} ariaLabel="Copy normalized range" iconOnly />
                </div>
                <div className="space-y-1">
                  {result.explanation.sentences.map((sentence, index) => (
                    <p key={`${index}-${sentence}`} className="text-base font-medium">
                      {index > 0 ? (
                        <>
                          <span className="text-muted-foreground">or </span>
                          {sentence[0].toLowerCase() + sentence.slice(1)}
                        </>
                      ) : (
                        sentence
                      )}
                    </p>
                  ))}
                </div>
                {result.explanation.notes.map((note) => (
                  <p key={note} className="text-xs text-muted-foreground">
                    {note}
                  </p>
                ))}
              </>
            ) : (
              <div className="workspace-notice rounded-md" data-tone="error" role="alert">
                {"error" in result && result.error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
          <CardDescription>Enter one version per line. Each one is checked against the range as you type.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Textarea
              aria-label="Versions"
              spellCheck={false}
              autoComplete="off"
              value={versions}
              onChange={(event) => setVersions(event.target.value)}
              className="min-h-48 font-mono"
              placeholder={"1.2.0\n1.4.2\n2.0.0"}
            />
            <div className="space-y-3">
              {result.checks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add versions to see which ones match.</p>
              ) : (
                <table className="w-full text-sm" aria-label="Version results">
                  <tbody>
                    {result.checks.map((check, index) => {
                      const status = check.status ? STATUS_TEXT[check.status] : undefined;
                      return (
                        <tr key={`${index}-${check.input}`} className="border-b border-border/50 align-top">
                          <th scope="row" className="py-1.5 pr-3 text-left font-mono font-normal">
                            {check.input}
                            {check.normalized && check.normalized !== check.input && check.normalized !== `${check.input}.0` && (
                              <span className="block text-xs text-muted-foreground">{check.normalized}</span>
                            )}
                          </th>
                          <td className={`py-1.5 ${check.error ? "text-destructive" : (status?.className ?? "text-muted-foreground")}`}>
                            {check.error ?? status?.label ?? "Fix the range first"}
                            {check.highest && <span className="ml-2 rounded bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">Highest</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {result.ok && result.checks.length > 0 && (
                <p className="text-sm" role="status">
                  {result.highest ? (
                    <>
                      Highest match: <code className="font-mono font-medium">{result.highest}</code>
                    </>
                  ) : (
                    (result.highestNote ?? "No version matches this range.")
                  )}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Compare Versions
          </CardTitle>
          <CardDescription>Order two versions by the {dialectLabel} rules and see the change between them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              aria-label="First version"
              aria-invalid={"side" in comparison && comparison.side === "left"}
              spellCheck={false}
              autoComplete="off"
              value={left}
              onChange={(event) => setLeft(event.target.value)}
              className="w-48 font-mono"
            />
            <span className="w-6 text-center font-mono text-lg font-semibold" aria-label="Order">
              {comparison.ok ? ORDER_TEXT[comparison.order] : "?"}
            </span>
            <Input
              type="text"
              aria-label="Second version"
              aria-invalid={"side" in comparison && comparison.side === "right"}
              spellCheck={false}
              autoComplete="off"
              value={right}
              onChange={(event) => setRight(event.target.value)}
              className="w-48 font-mono"
            />
          </div>
          {comparison.ok ? (
            <div className="space-y-1" role="status">
              <p className="text-base font-medium">
                {comparison.order === 0
                  ? `${comparison.left} and ${comparison.right} are the same version.`
                  : `${comparison.left} is ${comparison.order < 0 ? "older" : "newer"} than ${comparison.right}.`}
              </p>
              {comparison.bump && <p className="text-sm text-muted-foreground">Change between them: {comparison.bump}</p>}
              {comparison.note && <p className="text-xs text-muted-foreground">{comparison.note}</p>}
            </div>
          ) : (
            <div className="workspace-notice rounded-md" data-tone="error" role="alert">
              {"error" in comparison && comparison.error}
            </div>
          )}

          {next.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">Next versions after {left.trim()}</h3>
                {(dialect === "npm" || dialect === "cargo") && (
                  <Input
                    type="text"
                    aria-label="Pre-release id"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="rc"
                    value={preid}
                    onChange={(event) => setPreid(event.target.value)}
                    className="h-7 w-24 font-mono"
                  />
                )}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Next versions">
                {next.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <code className="ml-auto font-mono text-sm">{item.version}</code>
                    <CopyButton value={item.version} ariaLabel={`Copy ${item.label.toLowerCase()} version`} iconOnly />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
