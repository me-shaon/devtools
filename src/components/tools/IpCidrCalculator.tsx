import { useMemo, useState, type ReactNode } from "react";
import { Binary, Network, Split, SquareDashed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton } from "@/components/tools/CopyButton";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  MAX_SUBNETS,
  binaryGroups,
  binaryText,
  calculateCidr,
  checkContains,
  expandIPv6,
  formatAddress,
  formatCidr,
  formatCount,
  formatIPv4,
  ipv4MappedForms,
  isIPv4Mapped,
  mergeCidrs,
  parseRange,
  rangeToCidrs,
  reverseDnsName,
  reverseDnsZone,
  splitByCount,
  splitByPrefix,
  toHex,
  type CidrInfo,
  type ContainsResult,
} from "@/utils/ip-cidr";

const EXAMPLES = [
  { label: "Private /24", value: "192.168.1.10/24" },
  { label: "With a netmask", value: "172.16.5.4 255.255.240.0" },
  { label: "Point-to-point /31", value: "203.0.113.10/31" },
  { label: "CGNAT", value: "100.64.0.0/10" },
  { label: "IPv6 /64", value: "2001:db8:abcd:12::1/64" },
  { label: "IPv4-mapped IPv6", value: "::ffff:192.0.2.1" },
  { label: "Unique local", value: "fd00::/8" },
];

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which input forms can I use?",
    a: "Type an address, such as 10.1.2.3 or 2001:db8::1. Add a prefix length with a slash, such as 10.0.0.0/8. For IPv4, you can also add a dotted netmask after a space or a slash, such as 192.168.1.10 255.255.255.0. A bare address is a /32 or a /128.",
  },
  {
    q: "Why are two addresses not usable in most IPv4 blocks?",
    a: "The first address names the network, and the last address is the broadcast address. A /31 is different. RFC 3021 lets a point-to-point link use both of its addresses, with no broadcast. A /32 is one host.",
  },
  {
    q: "How are IPv6 hosts counted?",
    a: "IPv6 has no broadcast. The first address of a subnet is the Subnet-Router anycast address, so the tool does not count it as a host. A /127 point-to-point link uses both addresses (RFC 6164), and a /128 is one host.",
  },
  {
    q: "How does the tool write IPv6 addresses?",
    a: "It follows RFC 5952. Letters are lower case and leading zeros are removed. The longest run of two or more zero groups becomes \"::\". On a tie, the first run is compressed. An IPv4-mapped address ends in dotted form, such as ::ffff:192.0.2.1.",
  },
  {
    q: "Does the tool send my addresses anywhere?",
    a: "No. All calculations run on your device. The tool does not look up DNS or WHOIS data.",
  },
];

function ValueRow({ label, value, display }: { label: string; value: string; display?: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-muted p-2 font-mono text-sm" data-testid={`value-${label}`}>
          {display ?? value}
        </code>
        <CopyButton value={value} ariaLabel={`Copy ${label.toLowerCase()}`} iconOnly />
      </div>
    </div>
  );
}

/** Binary digits with the network bits in the primary color and the host bits muted. */
function BinaryBits({ info, value }: { info: CidrInfo; value: bigint }) {
  const separator = info.version === 4 ? "." : ":";
  return (
    <>
      {binaryGroups(value, info.version, info.prefix).map((group, index) => (
        <span key={index}>
          {index > 0 && <span className="text-muted-foreground">{separator}</span>}
          <span className="font-semibold text-primary">{group.network}</span>
          <span className="text-muted-foreground">{group.host}</span>
        </span>
      ))}
    </>
  );
}

const CONTAINS_TEXT: Record<ContainsResult, { text: string; className: string }> = {
  inside: { text: "Inside the block.", className: "text-success" },
  partial: { text: "Partly inside the block. Some addresses fall outside it.", className: "text-warning" },
  outside: { text: "Outside the block.", className: "text-muted-foreground" },
};

type SplitMode = "count" | "prefix";
type ListMode = "range" | "merge";

export function IpCidrCalculator() {
  const [input, setInput] = useState(EXAMPLES[0].value);
  const [containsInput, setContainsInput] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("count");
  const [splitValue, setSplitValue] = useState("4");
  const [listMode, setListMode] = useState<ListMode>("range");
  const [listInput, setListInput] = useState("10.0.0.5 - 10.0.0.20");

  const inputText = useDebouncedValue(input);
  const containsText = useDebouncedValue(containsInput);
  const listText = useDebouncedValue(listInput);

  const result = useMemo(() => calculateCidr(inputText), [inputText]);
  const info = result.ok ? result.value : null;

  const contains = useMemo(() => (info && containsText.trim() ? checkContains(info, containsText) : null), [info, containsText]);

  const split = useMemo(() => {
    if (!info) return null;
    if (!/^\d+$/.test(splitValue.trim())) return { ok: false as const, error: splitMode === "count" ? "Enter a whole number of subnets." : "Enter a prefix length, such as 26." };
    const value = Number(splitValue);
    return splitMode === "count" ? splitByCount(info, value) : splitByPrefix(info, value);
  }, [info, splitMode, splitValue]);

  const list = useMemo(() => {
    if (!listText.trim()) return null;
    if (listMode === "merge") return mergeCidrs(listText);
    const range = parseRange(listText);
    return range.ok ? { cidrs: rangeToCidrs(range.value), errors: [] } : { cidrs: [], errors: [{ line: 1, text: listText.trim(), error: range.error }] };
  }, [listMode, listText]);

  const show = (value: bigint) => (info ? formatAddress(value, info.version) : "");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            IP / CIDR Calculator
          </CardTitle>
          <CardDescription>Type an IPv4 or IPv6 address with a prefix or a netmask. The results update as you type.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ip-cidr-input">Address or CIDR block</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="ip-cidr-input"
                type="text"
                aria-invalid={!result.ok}
                spellCheck={false}
                autoComplete="off"
                placeholder="10.0.0.0/8, 2001:db8::/32, 192.168.1.10 255.255.255.0"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="min-w-48 flex-1 font-mono"
              />
              <Select value="" onValueChange={setInput}>
                <SelectTrigger className="h-8 w-44 shrink-0" aria-label="Examples">
                  <SelectValue placeholder="Examples" />
                </SelectTrigger>
                <SelectContent>
                  {EXAMPLES.map((example) => (
                    <SelectItem key={example.value} value={example.value}>
                      {example.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!result.ok && (
              <div className="workspace-notice rounded-md" data-tone="error" role="alert">
                {result.error}
              </div>
            )}
            {info?.hostBitsSet && (
              <p className="text-xs text-muted-foreground" role="status">
                {formatAddress(info.address, info.version)} is a host in the block {formatCidr(info.network, info.prefix, info.version)}.
              </p>
            )}
          </div>

          {info && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Address type">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">IPv{info.version}</span>
                <span className="rounded bg-muted px-2 py-0.5 font-medium">{info.type.label}</span>
                {info.ipv4Class && <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">Class {info.ipv4Class}</span>}
                <span className="text-muted-foreground">{info.type.detail}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ValueRow label="CIDR block" value={formatCidr(info.network, info.prefix, info.version)} />
                <ValueRow label="Network address" value={show(info.network)} />
                {info.version === 4 && <ValueRow label="Broadcast address" value={info.broadcast === null ? "" : show(info.broadcast)} display={info.broadcast === null ? "None" : undefined} />}
                {info.version === 6 && <ValueRow label="Last address" value={show(info.last)} />}
                <ValueRow label="First usable host" value={show(info.firstHost)} />
                <ValueRow label="Last usable host" value={show(info.lastHost)} />
                <ValueRow label="Netmask" value={show(info.netmask)} />
                <ValueRow label="Wildcard mask" value={show(info.wildcard)} />
                <ValueRow label="Prefix length" value={`/${info.prefix}`} />
                <ValueRow label="Total addresses" value={info.total.toString()} display={formatCount(info.total)} />
                <ValueRow label="Usable hosts" value={info.usable.toString()} display={formatCount(info.usable)} />
              </div>
              <p className="text-xs text-muted-foreground">{info.hostNote}</p>
            </>
          )}
        </CardContent>
      </Card>

      {info && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Binary className="h-5 w-5" />
              Representations
            </CardTitle>
            <CardDescription>The entered address in other forms. In the binary form, the network bits are in bold.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {info.version === 6 && (
                <>
                  <ValueRow label="Compressed" value={formatAddress(info.address, 6)} />
                  <ValueRow label="Expanded" value={expandIPv6(info.address)} />
                  {isIPv4Mapped(info.address) && <ValueRow label="Embedded IPv4" value={formatIPv4(info.address & 0xffffffffn)} />}
                </>
              )}
              <ValueRow label="Decimal" value={info.address.toString()} />
              <ValueRow label="Hex" value={toHex(info.address, info.version)} />
              {info.version === 4 && (
                <>
                  <ValueRow label="IPv4-mapped IPv6" value={ipv4MappedForms(info.address).dotted} />
                  <ValueRow label="IPv4-mapped IPv6 (hex)" value={ipv4MappedForms(info.address).hex} />
                </>
              )}
              <ValueRow label="Reverse DNS name" value={reverseDnsName(info.address, info.version)} />
              <ValueRow label="Reverse DNS zone" value={reverseDnsZone(info.network, info.prefix, info.version)} />
              <div className="md:col-span-2">
                <ValueRow label="Binary" value={binaryText(info.address, info.version)} display={<BinaryBits info={info} value={info.address} />} />
              </div>
              <div className="md:col-span-2">
                <ValueRow label="Netmask binary" value={binaryText(info.netmask, info.version)} display={<BinaryBits info={info} value={info.netmask} />} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {info && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SquareDashed className="h-5 w-5" />
              Contains Check
            </CardTitle>
            <CardDescription>Check if an address, a CIDR block, or a range is inside {formatCidr(info.network, info.prefix, info.version)}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              type="text"
              aria-label="Address or range to check"
              aria-invalid={contains ? !contains.ok : undefined}
              spellCheck={false}
              autoComplete="off"
              placeholder={info.version === 4 ? "10.1.2.3, 10.1.0.0/16, 10.0.0.5 - 10.0.0.20" : "2001:db8::1, 2001:db8:1::/48"}
              value={containsInput}
              onChange={(event) => setContainsInput(event.target.value)}
              className="font-mono"
            />
            {contains &&
              (contains.ok ? (
                <p className={`text-base font-medium ${CONTAINS_TEXT[contains.value].className}`} role="status">
                  {CONTAINS_TEXT[contains.value].text}
                </p>
              ) : (
                <p className="text-xs text-destructive" role="alert">
                  {contains.error}
                </p>
              ))}
          </CardContent>
        </Card>
      )}

      {info && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Split className="h-5 w-5" />
                Subnet Split
              </CardTitle>
              <CardDescription>Split the block into equal subnets.</CardDescription>
            </div>
            <div className="layout-switch" role="group" aria-label="Split by">
              <button type="button" aria-pressed={splitMode === "count"} onClick={() => setSplitMode("count")}>
                Number of subnets
              </button>
              <button type="button" aria-pressed={splitMode === "prefix"} onClick={() => setSplitMode("prefix")}>
                Subnet prefix
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="ip-cidr-split">{splitMode === "count" ? "Subnets" : "Prefix length"}</Label>
              <Input
                id="ip-cidr-split"
                type="text"
                inputMode="numeric"
                aria-invalid={split ? !split.ok : undefined}
                spellCheck={false}
                autoComplete="off"
                value={splitValue}
                onChange={(event) => setSplitValue(event.target.value)}
                className="h-8 w-24 font-mono"
              />
              {split?.ok && (
                <CopyButton value={split.value.subnets.map((subnet) => subnet.cidr).join("\n")} label={split.value.count > BigInt(MAX_SUBNETS) ? `Copy first ${MAX_SUBNETS}` : "Copy all"} />
              )}
            </div>
            {split &&
              (split.ok ? (
                <>
                  <p className="text-sm text-muted-foreground" role="status">
                    {formatCount(split.value.count)} subnets of /{split.value.prefix}, with {formatCount(1n << BigInt(info.bits - split.value.prefix))} addresses each.
                    {split.value.count > BigInt(MAX_SUBNETS) && ` The list shows the first ${MAX_SUBNETS}.`}
                  </p>
                  <div className="max-h-80 overflow-auto rounded-md border border-border/50">
                    <table className="w-full text-sm" aria-label="Subnets">
                      <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 font-medium">Subnet</th>
                          <th className="px-3 py-1.5 font-medium">Range</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {split.value.subnets.map((subnet) => (
                          <tr key={subnet.cidr} className="border-t border-border/50">
                            <td className="px-3 py-1 font-mono">{subnet.cidr}</td>
                            <td className="break-all px-3 py-1 font-mono text-muted-foreground">
                              {show(subnet.network)} - {show(subnet.last)}
                            </td>
                            <td className="px-1">
                              <CopyButton value={subnet.cidr} ariaLabel={`Copy ${subnet.cidr}`} iconOnly />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-xs text-destructive" role="alert">
                  {split.error}
                </p>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Range and Merge</CardTitle>
            <CardDescription>
              {listMode === "range" ? "Turn a range of addresses into the fewest CIDR blocks." : "Merge a list of blocks into the fewest blocks. Enter one block, address, or range per line."}
            </CardDescription>
          </div>
          <div className="layout-switch" role="group" aria-label="List mode">
            <button type="button" aria-pressed={listMode === "range"} onClick={() => setListMode("range")}>
              Range to CIDR
            </button>
            <button type="button" aria-pressed={listMode === "merge"} onClick={() => setListMode("merge")}>
              Merge CIDRs
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {listMode === "range" ? (
              <Input
                type="text"
                aria-label="Address range"
                spellCheck={false}
                autoComplete="off"
                placeholder="10.0.0.5 - 10.0.0.20"
                value={listInput}
                onChange={(event) => setListInput(event.target.value)}
                className="font-mono"
              />
            ) : (
              <Textarea
                aria-label="Blocks to merge"
                spellCheck={false}
                autoComplete="off"
                placeholder={"10.0.0.0/24\n10.0.1.0/24\n2001:db8::/33"}
                value={listInput}
                onChange={(event) => setListInput(event.target.value)}
                className="min-h-40 font-mono"
              />
            )}
            <div className="space-y-2">
              {list && list.cidrs.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground" role="status">
                      {list.cidrs.length === 1 ? "1 block" : `${list.cidrs.length} blocks`}
                    </span>
                    <CopyButton value={list.cidrs.join("\n")} label="Copy all" />
                  </div>
                  <ul className="max-h-64 space-y-1 overflow-auto font-mono text-sm" aria-label="CIDR blocks">
                    {list.cidrs.map((cidr) => (
                      <li key={cidr} className="rounded bg-muted px-2 py-1">
                        {cidr}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {list?.errors.map((item, index) => (
                <p key={`${index}-${item.line}-${item.text}`} className="text-xs text-destructive" role="alert">
                  {listMode === "merge" ? `Line ${item.line}: ` : ""}
                  {item.error}
                </p>
              ))}
              {!list && <p className="text-sm text-muted-foreground">{listMode === "range" ? "Enter a start and an end address." : "Enter blocks to merge."}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
