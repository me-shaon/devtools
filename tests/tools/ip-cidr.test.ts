import { describe, expect, it } from "vitest";
import {
  binaryGroups,
  calculateCidr,
  checkContains,
  classifyRange,
  expandIPv6,
  formatCount,
  formatIPv4,
  formatIPv6,
  ipv4MappedForms,
  mergeCidrs,
  netmaskToPrefix,
  parseAddress,
  parseCidr,
  parseIPv6,
  parseRange,
  rangeToCidrs,
  reverseDnsName,
  reverseDnsZone,
  splitByCount,
  splitByPrefix,
  toHex,
  type CidrInfo,
} from "@/utils/ip-cidr";

const info = (text: string): CidrInfo => {
  const result = calculateCidr(text);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const error = (text: string) => {
  const result = calculateCidr(text);
  return result.ok ? null : result.error;
};

const v6 = (text: string) => {
  const result = parseIPv6(text);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const v4 = (value: bigint) => formatIPv4(value);
const f6 = (value: bigint) => formatIPv6(value);

describe("IPv4 parsing", () => {
  it("reads addresses, prefixes, and netmasks", () => {
    expect(parseCidr("10.0.0.0/8")).toEqual({ ok: true, value: { version: 4, value: 0x0a000000n, prefix: 8 } });
    expect(parseCidr(" 192.168.1.10 255.255.255.0 ")).toMatchObject({ ok: true, value: { prefix: 24 } });
    expect(parseCidr("192.168.1.10/255.255.255.128")).toMatchObject({ ok: true, value: { prefix: 25 } });
    expect(parseCidr("192.168.1.10 / 24")).toMatchObject({ ok: true, value: { prefix: 24 } });
    expect(parseCidr("8.8.8.8")).toMatchObject({ ok: true, value: { prefix: 32 } });
  });

  it("converts netmasks to prefix lengths", () => {
    expect(netmaskToPrefix("0.0.0.0")).toEqual({ ok: true, value: 0 });
    expect(netmaskToPrefix("255.255.255.255")).toEqual({ ok: true, value: 32 });
    expect(netmaskToPrefix("255.255.252.0")).toEqual({ ok: true, value: 22 });
    expect(netmaskToPrefix("255.0.255.0")).toMatchObject({ ok: false, error: expect.stringContaining("no gaps") });
  });

  it("explains what is wrong with a bad address", () => {
    expect(error("256.1.1.1")).toBe("The first part is 256. Each part must be from 0 to 255.");
    expect(error("1.2.3")).toContain("has 3");
    expect(error("1.2..4")).toContain("third part");
    expect(error("1.2.3.x")).toContain('("x") is not a number');
    expect(error("10.010.0.1")).toContain("leading zero");
    expect(error("10.0.0.0/33")).toBe("An IPv4 prefix is from 0 to 32. This one is 33.");
    expect(error("10.0.0.0/")).toContain("prefix length after the slash");
    expect(error("10.0.0.0/ab")).toContain("is not a number");
    expect(error("")).toBe("Enter an IP address or a CIDR block.");
    expect(error("cafe")).toContain("needs colons");
    expect(error("2001:db8::/255.255.0.0")).toContain("dotted netmasks");
  });
});

describe("IPv6 parsing", () => {
  it("reads full, compressed, and mixed forms", () => {
    expect(v6("::")).toBe(0n);
    expect(v6("::1")).toBe(1n);
    expect(v6("1::")).toBe(1n << 112n);
    expect(v6("2001:DB8:0:0:0:0:0:1")).toBe(v6("2001:db8::1"));
    expect(v6("::ffff:1.2.3.4")).toBe(0xffff01020304n);
    expect(v6("64:ff9b::192.0.2.33")).toBe(v6("64:ff9b::c000:221"));
    expect(v6("64:ff9b::1.2.3.4")).toBe(v6("64:ff9b::102:304"));
    expect(v6("::1.2.3.4")).toBe(0x01020304n);
    expect(v6("1:2:3:4:5:6:1.2.3.4")).toBe(v6("1:2:3:4:5:6:102:304"));
    expect(v6("[fe80::1]")).toBe(v6("fe80::1"));
    expect(v6("1:2:3:4:5:6:7::")).toBe(v6("1:2:3:4:5:6:7:0"));
  });

  it("explains what is wrong with a bad address", () => {
    const bad = (text: string) => {
      const result = parseIPv6(text);
      return result.ok ? null : result.error;
    };
    expect(bad("1::2::3")).toBe('An IPv6 address can have only one "::".');
    expect(bad("1:::2")).toContain("not three");
    expect(bad("12345::")).toContain("more than 4 hex digits");
    expect(bad("2001:db8::g")).toContain('"g"');
    expect(bad("1:2:3:4:5:6:7")).toContain("This one has 7");
    expect(bad("1:2:3:4:5:6:7:8:9")).toContain("This one has 9");
    expect(bad("1:2:3:4:5:6:7:8::")).toContain('"::" must replace at least one zero group');
    expect(bad(":1:2:3:4:5:6:7")).toContain("cannot start with a single");
    expect(bad("1:2:3:4:5:6:7:")).toContain("cannot end with a single");
    expect(bad("::1.2.3.4:5")).toContain("only be at the end");
    expect(bad("1.2.3.4::")).toContain("only be at the end");
    expect(bad("::1.2.3.4:1")).toContain("only be at the end");
    expect(bad("1:2:3:4:5:6:1.2.3.4::")).toContain("only be at the end");
    expect(bad("::ffff:1.2.3.256")).toContain("IPv4 part is not valid");
    expect(bad("fe80::1%eth0")).toContain("zone ID");
    expect(error("2001:db8::/129")).toBe("An IPv6 prefix is from 0 to 128. This one is 129.");
  });
});

describe("IPv6 text forms", () => {
  it("follows the RFC 5952 compression rules", () => {
    expect(f6(0n)).toBe("::");
    expect(f6(1n)).toBe("::1");
    expect(f6(v6("2001:0db8:0000:0000:0000:0000:0000:0001"))).toBe("2001:db8::1");
    // One zero group is not compressed.
    expect(f6(v6("2001:db8:0:1:1:1:1:1"))).toBe("2001:db8:0:1:1:1:1:1");
    // The longest run wins.
    expect(f6(v6("2001:0:0:1:0:0:0:1"))).toBe("2001:0:0:1::1");
    // On a tie, the first run wins.
    expect(f6(v6("2001:db8:0:0:1:0:0:1"))).toBe("2001:db8::1:0:0:1");
    expect(f6(v6("fe80:0:0:0:0:0:0:0"))).toBe("fe80::");
    expect(f6(v6("ABCD:EF01:2345:6789:ABCD:EF01:2345:6789"))).toBe("abcd:ef01:2345:6789:abcd:ef01:2345:6789");
  });

  it("writes IPv4-mapped addresses in mixed form", () => {
    expect(f6(v6("::ffff:c000:201"))).toBe("::ffff:192.0.2.1");
    expect(formatIPv6(v6("::ffff:c000:201"), false)).toBe("::ffff:c000:201");
    expect(ipv4MappedForms(0xc0000201n)).toEqual({ dotted: "::ffff:192.0.2.1", hex: "::ffff:c000:201" });
  });

  it("expands to all 8 groups", () => {
    expect(expandIPv6(v6("2001:db8::1"))).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(expandIPv6(0n)).toBe("0000:0000:0000:0000:0000:0000:0000:0000");
  });
});

describe("IPv4 blocks", () => {
  it("describes a /24 with the host bits set", () => {
    const result = info("192.168.1.10/24");
    expect(result.hostBitsSet).toBe(true);
    expect(v4(result.network)).toBe("192.168.1.0");
    expect(v4(result.broadcast!)).toBe("192.168.1.255");
    expect(v4(result.firstHost)).toBe("192.168.1.1");
    expect(v4(result.lastHost)).toBe("192.168.1.254");
    expect(v4(result.netmask)).toBe("255.255.255.0");
    expect(v4(result.wildcard)).toBe("0.0.0.255");
    expect(result.total).toBe(256n);
    expect(result.usable).toBe(254n);
    expect(result.type.label).toBe("Private");
    expect(result.ipv4Class).toBe("C");
  });

  it("handles /0", () => {
    const result = info("0.0.0.0/0");
    expect(result.total).toBe(4_294_967_296n);
    expect(result.usable).toBe(4_294_967_294n);
    expect(v4(result.netmask)).toBe("0.0.0.0");
    expect(v4(result.wildcard)).toBe("255.255.255.255");
    expect(result.type.label).toBe("Mixed");
  });

  it("uses both addresses of a /31 and has no broadcast (RFC 3021)", () => {
    const result = info("10.0.0.0/31");
    expect(result.broadcast).toBeNull();
    expect(v4(result.firstHost)).toBe("10.0.0.0");
    expect(v4(result.lastHost)).toBe("10.0.0.1");
    expect(result.usable).toBe(2n);
    expect(result.hostNote).toContain("RFC 3021");
  });

  it("treats a /32 as one host", () => {
    const result = info("8.8.8.8");
    expect(result.prefix).toBe(32);
    expect(result.broadcast).toBeNull();
    expect(result.firstHost).toBe(result.lastHost);
    expect(result.usable).toBe(1n);
    expect(result.hostBitsSet).toBe(false);
    expect(result.type.label).toBe("Public");
    expect(result.ipv4Class).toBe("A");
  });

  it("names special address space", () => {
    const label = (text: string) => info(text).type.label;
    expect(label("172.20.0.0/16")).toBe("Private");
    expect(label("172.32.0.0/16")).toBe("Public");
    expect(label("100.64.0.1")).toBe("Shared (CGNAT)");
    expect(label("127.0.0.1")).toBe("Loopback");
    expect(label("169.254.10.1")).toBe("Link-local");
    expect(label("224.0.0.251")).toBe("Multicast");
    expect(label("198.51.100.7")).toBe("Documentation");
    expect(label("0.0.0.0")).toBe("Unspecified");
    expect(label("255.255.255.255")).toBe("Limited broadcast");
    expect(label("240.0.0.1")).toBe("Reserved");
    expect(label("10.0.0.0/7")).toBe("Mixed");
  });
});

describe("IPv6 blocks", () => {
  it("describes a /64", () => {
    const result = info("2001:db8:abcd:12::1/64");
    expect(f6(result.network)).toBe("2001:db8:abcd:12::");
    expect(f6(result.last)).toBe("2001:db8:abcd:12:ffff:ffff:ffff:ffff");
    expect(f6(result.firstHost)).toBe("2001:db8:abcd:12::1");
    expect(f6(result.netmask)).toBe("ffff:ffff:ffff:ffff::");
    expect(f6(result.wildcard)).toBe("::ffff:ffff:ffff:ffff");
    expect(result.broadcast).toBeNull();
    expect(result.total).toBe(1n << 64n);
    expect(result.usable).toBe((1n << 64n) - 1n);
    expect(result.type.label).toBe("Documentation");
    expect(result.ipv4Class).toBeNull();
  });

  it("handles ::/0, /127, and /128", () => {
    expect(info("::/0").total).toBe(1n << 128n);
    const p2p = info("2001:db8::/127");
    expect(p2p.usable).toBe(2n);
    expect(p2p.firstHost).toBe(p2p.network);
    expect(p2p.hostNote).toContain("RFC 6164");
    const host = info("::1");
    expect(host.prefix).toBe(128);
    expect(host.usable).toBe(1n);
    expect(host.type.label).toBe("Loopback");
  });

  it("names special address space", () => {
    const label = (text: string) => info(text).type.label;
    expect(label("::")).toBe("Unspecified");
    expect(label("::ffff:1.2.3.4")).toBe("IPv4-mapped");
    expect(label("fd12:3456:789a::1")).toBe("Unique local");
    expect(label("fe80::1")).toBe("Link-local");
    expect(label("ff02::1")).toBe("Multicast");
    expect(label("2606:4700::1111")).toBe("Global unicast");
    expect(label("2001::/16")).toBe("Mixed");
    expect(label("4000::1")).toBe("Reserved");
    expect(classifyRange(0n, 0n, 6).label).toBe("Unspecified");
  });
});

describe("representations", () => {
  it("formats IPv4 as hex, binary groups, and reverse DNS", () => {
    expect(toHex(0x0a000001n, 4)).toBe("0x0A000001");
    expect(binaryGroups(0xc0a8010an, 4, 20)).toEqual([
      { network: "11000000", host: "" },
      { network: "10101000", host: "" },
      { network: "0000", host: "0001" },
      { network: "", host: "00001010" },
    ]);
    expect(reverseDnsName(0xc0000201n, 4)).toBe("1.2.0.192.in-addr.arpa");
    expect(reverseDnsZone(0x0a000000n, 8, 4)).toBe("10.in-addr.arpa");
    expect(reverseDnsZone(0xc0a80100n, 26, 4)).toBe("1.168.192.in-addr.arpa");
    expect(reverseDnsZone(0n, 0, 4)).toBe("in-addr.arpa");
  });

  it("formats IPv6 reverse DNS with nibbles", () => {
    expect(reverseDnsName(v6("2001:db8::1"), 6)).toBe("1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa");
    expect(reverseDnsZone(v6("2001:db8::"), 32, 6)).toBe("8.b.d.0.1.0.0.2.ip6.arpa");
  });

  it("shows large counts with a power of two", () => {
    expect(formatCount(254n)).toBe("254");
    expect(formatCount(4_294_967_296n)).toBe("4,294,967,296");
    expect(formatCount(1n << 64n)).toBe("18,446,744,073,709,551,616 (2^64)");
    expect(formatCount((1n << 64n) - 1n)).toBe("18,446,744,073,709,551,615 (2^64 - 1)");
  });
});

describe("contains", () => {
  const block = info("10.0.0.0/8");
  it("checks addresses, blocks, and ranges", () => {
    expect(checkContains(block, "10.20.30.40")).toEqual({ ok: true, value: "inside" });
    expect(checkContains(block, "10.1.0.0/16")).toEqual({ ok: true, value: "inside" });
    expect(checkContains(block, "11.0.0.1")).toEqual({ ok: true, value: "outside" });
    expect(checkContains(block, "8.0.0.0/6")).toEqual({ ok: true, value: "partial" });
    expect(checkContains(block, "9.255.255.255 - 10.0.0.1")).toEqual({ ok: true, value: "partial" });
  });

  it("rejects a different IP version", () => {
    expect(checkContains(block, "::1")).toMatchObject({ ok: false, error: expect.stringContaining("same version") });
  });

  it("rejects a range that runs backward", () => {
    expect(parseRange("10.0.0.9 - 10.0.0.1")).toMatchObject({ ok: false, error: "The start address is after the end address." });
    expect(parseRange("10.0.0.1 - ::1")).toMatchObject({ ok: false, error: expect.stringContaining("same IP version") });
  });
});

describe("subnet split", () => {
  it("splits by prefix", () => {
    const result = splitByPrefix(info("192.168.0.0/24"), 26);
    expect(result).toMatchObject({ ok: true, value: { count: 4n } });
    if (!result.ok) return;
    expect(result.value.subnets.map((subnet) => subnet.cidr)).toEqual(["192.168.0.0/26", "192.168.0.64/26", "192.168.0.128/26", "192.168.0.192/26"]);
  });

  it("rounds a count up to a power of two", () => {
    const result = splitByCount(info("10.0.0.0/16"), 5);
    expect(result).toMatchObject({ ok: true, value: { prefix: 19, count: 8n } });
    expect(splitByCount(info("10.0.0.0/16"), 1)).toMatchObject({ ok: true, value: { prefix: 16, count: 1n } });
  });

  it("caps the list but reports the full count", () => {
    const result = splitByPrefix(info("2001:db8::/32"), 64);
    expect(result).toMatchObject({ ok: true, value: { count: 1n << 32n } });
    if (!result.ok) return;
    expect(result.value.subnets).toHaveLength(256);
    expect(result.value.subnets[1].cidr).toBe("2001:db8:0:1::/64");
  });

  it("rejects prefixes that do not fit", () => {
    expect(splitByPrefix(info("10.0.0.0/16"), 8)).toMatchObject({ ok: false, error: expect.stringContaining("/16 or longer") });
    expect(splitByPrefix(info("10.0.0.0/16"), 33)).toMatchObject({ ok: false });
    expect(splitByCount(info("10.0.0.0/31"), 3)).toMatchObject({ ok: false, error: "A /31 can hold at most 2 subnets." });
    expect(splitByCount(info("10.0.0.0/24"), 0)).toMatchObject({ ok: false });
  });
});

describe("range to CIDR", () => {
  const blocks = (text: string) => {
    const range = parseRange(text);
    if (!range.ok) throw new Error(range.error);
    return rangeToCidrs(range.value);
  };

  it("finds the fewest blocks", () => {
    expect(blocks("10.0.0.5 - 10.0.0.20")).toEqual(["10.0.0.5/32", "10.0.0.6/31", "10.0.0.8/29", "10.0.0.16/30", "10.0.0.20/32"]);
    expect(blocks("192.168.0.0-192.168.1.255")).toEqual(["192.168.0.0/23"]);
    expect(blocks("0.0.0.0 - 255.255.255.255")).toEqual(["0.0.0.0/0"]);
    expect(blocks(":: - ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toEqual(["::/0"]);
    expect(blocks("2001:db8::1 - 2001:db8::2")).toEqual(["2001:db8::1/128", "2001:db8::2/128"]);
  });
});

describe("merge", () => {
  it("joins overlapping and adjacent blocks", () => {
    const result = mergeCidrs("10.0.1.0/24\n10.0.0.0/24\n10.0.0.128/25\n2001:db8::/33\n2001:db8:8000::/33\n192.168.1.1");
    expect(result.cidrs).toEqual(["10.0.0.0/23", "192.168.1.1/32", "2001:db8::/32"]);
    expect(result.errors).toEqual([]);
  });

  it("reports bad lines by number and skips comments", () => {
    const result = mergeCidrs("# office\n10.0.0.0/24\n300.0.0.0/8");
    expect(result.cidrs).toEqual(["10.0.0.0/24"]);
    expect(result.errors).toEqual([{ line: 3, text: "300.0.0.0/8", error: expect.stringContaining("300") }]);
  });

  it("names the real line when a line holds several items", () => {
    const result = mergeCidrs("10.0.0.0/8, 10.1.0.0/16, bad\n192.168.0.0/16\n\n300.0.0.1, 10.0.0.1");
    expect(result.cidrs).toEqual(["10.0.0.0/8", "192.168.0.0/16"]);
    expect(result.errors.map((item) => [item.line, item.text])).toEqual([
      [1, "bad"],
      [4, "300.0.0.1"],
    ]);
  });

  it("reads a host-bit address as its network", () => {
    expect(mergeCidrs("10.0.0.7/24").cidrs).toEqual(["10.0.0.0/24"]);
    expect(parseAddress("10.0.0.7")).toMatchObject({ ok: true, value: { version: 4 } });
  });
});
