import { describe, expect, it } from "vitest";
import {
  analyzeHeaders,
  authSummary,
  formatDelay,
  parseAuthenticationResults,
  parseDkimSignature,
  parseReceived,
  parseReceivedSpf,
  resultTone,
} from "@/utils/email-headers";

const HEADERS = [
  "Delivered-To: bob@example.org",
  "Received: by 2002:a05:6402:1234 with SMTP id abc123;",
  "        Tue, 10 Mar 2026 09:31:10 -0700 (PDT)",
  "Received: from mail.sender.example (mail.sender.example [203.0.113.5])",
  "        by mx.google.com with ESMTPS id x12si345 for <bob@example.org>",
  "        (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);",
  "        Tue, 10 Mar 2026 09:31:05 -0700 (PDT)",
  "Received: from [10.0.0.7] (unknown [198.51.100.20])",
  "        by mail.sender.example (Postfix) with ESMTPSA id 4F1C2;",
  "        Tue, 10 Mar 2026 16:30:02 +0000 (UTC)",
  "Authentication-Results: mx.google.com;",
  "       dkim=pass header.i=@sender.example header.s=s1 header.b=AbCd;",
  "       spf=pass (google.com: domain of ada@sender.example designates 203.0.113.5 as permitted sender) smtp.mailfrom=ada@sender.example;",
  "       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=sender.example",
  "Received-SPF: pass (google.com: domain of ada@sender.example designates 203.0.113.5 as permitted sender) client-ip=203.0.113.5;",
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=sender.example; s=s1;",
  "        h=from:to:subject; bh=abc=; b=AbCd",
  "Return-Path: <ada@sender.example>",
  "From: =?UTF-8?B?QWRhIEzDtnZlbGFjZQ==?= <ada@sender.example>",
  "Reply-To: ada@other.example",
  "To: bob@example.org",
  "Subject: Quarterly plan",
  "Date: Tue, 10 Mar 2026 16:30:00 +0000",
  "Message-ID: <plan-1@sender.example>",
  "",
  "Body text that must be ignored.",
  "Received: from fake.example by fake.example; Tue, 10 Mar 2026 16:00:00 +0000",
].join("\r\n");

describe("parseReceived", () => {
  it("reads the from host, IP, by host, protocol, and date", () => {
    const hop = parseReceived(
      "from mail.sender.example (mail.sender.example [203.0.113.5]) by mx.google.com with ESMTPS id x12 for <bob@example.org> (version=TLS1_3); Tue, 10 Mar 2026 09:31:05 -0700 (PDT)",
    );
    expect(hop).toMatchObject({ from: "mail.sender.example", ip: "203.0.113.5", by: "mx.google.com", protocol: "ESMTPS" });
    expect(hop.date?.toISOString()).toBe("2026-03-10T16:31:05.000Z");
  });

  it("reads IPv6 literals and a header with no from clause", () => {
    expect(parseReceived("from host (host [IPv6:2001:db8::1]) by mx.example with SMTP; Tue, 10 Mar 2026 16:00:00 +0000").ip).toBe("2001:db8::1");
    expect(parseReceived("by 2002:a05:6402:1234 with SMTP id abc; Tue, 10 Mar 2026 16:00:00 +0000")).toMatchObject({ from: "", ip: "", by: "2002:a05:6402:1234", protocol: "SMTP" });
  });

  it("ignores keywords inside comments", () => {
    const hop = parseReceived("from a.example (helo by b.example with x) by c.example with LMTP; Tue, 10 Mar 2026 16:00:00 +0000");
    expect(hop).toMatchObject({ from: "a.example", by: "c.example", protocol: "LMTP" });
  });

  it("has no date when the header has no semicolon", () => {
    expect(parseReceived("from a by b").date).toBeNull();
  });
});

describe("parseAuthenticationResults", () => {
  it("reads the server, each method, its properties, and its comment", () => {
    const report = parseAuthenticationResults(
      'mx.google.com; dkim=pass header.i=@a.example header.s="s1"; spf=softfail (domain of x does not designate) smtp.mailfrom=x@a.example; dmarc=fail (p=QUARANTINE) header.from=a.example',
    );
    expect(report.server).toBe("mx.google.com");
    expect(report.results.map((r) => [r.method, r.result])).toEqual([["dkim", "pass"], ["spf", "softfail"], ["dmarc", "fail"]]);
    expect(report.results[0].props).toEqual({ "header.i": "@a.example", "header.s": "s1" });
    expect(report.results[1].comment).toBe("domain of x does not designate");
    expect(report.results[2].props["header.from"]).toBe("a.example");
  });

  it("skips the instance tag of ARC results and a bare none", () => {
    const arc = parseAuthenticationResults("i=1; mx.microsoft.com 1; spf=pass smtp.mailfrom=a.example", "ARC-Authentication-Results");
    expect(arc.server).toBe("mx.microsoft.com");
    expect(arc.results).toHaveLength(1);
    expect(parseAuthenticationResults("mx.example; none").results).toEqual([]);
  });
});

describe("parseReceivedSpf and parseDkimSignature", () => {
  it("reads the Received-SPF result and tags", () => {
    const report = parseReceivedSpf("fail (mx.example: domain does not designate 1.2.3.4) receiver=mx.example; client-ip=1.2.3.4; envelope-from=\"a@b.example\"");
    expect(report).toMatchObject({ server: "mx.example", source: "Received-SPF" });
    expect(report.results[0]).toMatchObject({ method: "spf", result: "fail", props: { "client-ip": "1.2.3.4", "envelope-from": "a@b.example" } });
  });

  it("reads the domain, selector, and algorithm of a DKIM signature", () => {
    expect(parseDkimSignature("v=1; a=rsa-sha256; d=Sender.Example; s=s1;\r\n h=from; b=abc")).toEqual({ domain: "sender.example", selector: "s1", algorithm: "rsa-sha256" });
  });
});

describe("analyzeHeaders", () => {
  const analysis = analyzeHeaders(HEADERS);

  it("lists hops in delivery order with the delay of each hop, and ignores the body", () => {
    expect(analysis.hops.map((hop) => hop.by)).toEqual(["mail.sender.example", "mx.google.com", "2002:a05:6402:1234"]);
    expect(analysis.hops.map((hop) => hop.delay)).toEqual([2_000, 63_000, 5_000]);
    expect(analysis.hops[0].ip).toBe("198.51.100.20");
    expect(analysis.totalDelay).toBe(70_000);
  });

  it("reads the summary fields and decodes encoded words", () => {
    expect(analysis).toMatchObject({
      from: "Ada Lövelace <ada@sender.example>",
      to: "bob@example.org",
      subject: "Quarterly plan",
      messageId: "<plan-1@sender.example>",
      returnPath: "<ada@sender.example>",
    });
    expect(analysis.date?.toISOString()).toBe("2026-03-10T16:30:00.000Z");
  });

  it("uses Authentication-Results and skips Received-SPF when SPF is already there", () => {
    expect(analysis.auth.map((report) => report.source)).toEqual(["Authentication-Results"]);
    expect(authSummary(analysis.auth, "spf")?.result).toBe("pass");
    expect(authSummary(analysis.auth, "dmarc")?.props["header.from"]).toBe("sender.example");
    expect(authSummary(analysis.auth, "arc")).toBeNull();
    expect(analysis.dkimSignatures).toEqual([{ domain: "sender.example", selector: "s1", algorithm: "rsa-sha256" }]);
  });

  it("warns when replies go to another domain", () => {
    expect(analysis.warnings).toEqual(["Replies go to other.example, not to the sender domain sender.example."]);
  });

  it("falls back to ARC results and Received-SPF", () => {
    const result = analyzeHeaders(
      ["ARC-Authentication-Results: i=1; mx.example; dkim=fail header.d=a.example", "Received-SPF: neutral receiver=mx.example; client-ip=1.2.3.4", "Subject: x"].join("\n"),
    );
    expect(result.auth.map((report) => report.source)).toEqual(["ARC-Authentication-Results", "Received-SPF"]);
    expect(authSummary(result.auth, "spf")?.result).toBe("neutral");
  });

  it("warns about a clock that goes backwards", () => {
    const result = analyzeHeaders(
      [
        "Received: from b by c; Tue, 10 Mar 2026 16:00:00 +0000",
        "Received: from a by b; Tue, 10 Mar 2026 16:00:30 +0000",
        "Subject: x",
      ].join("\n"),
    );
    expect(result.hops.map((hop) => hop.delay)).toEqual([null, -30_000]);
    expect(result.totalDelay).toBe(-30_000);
    expect(result.warnings[0]).toMatch(/clock/);
  });

  it("rejects text without email headers", () => {
    expect(() => analyzeHeaders("hello world")).toThrow(/No email headers/);
    expect(() => analyzeHeaders("Foo: bar")).toThrow(/No email headers/);
  });
});

describe("formatDelay and resultTone", () => {
  it("formats delays", () => {
    expect(formatDelay(400)).toBe("<1 s");
    expect(formatDelay(3_000)).toBe("3 s");
    expect(formatDelay(125_000)).toBe("2 min 5 s");
    expect(formatDelay(120_000)).toBe("2 min");
    expect(formatDelay(3_840_000)).toBe("1 h 4 min");
    expect(formatDelay(90_000_000)).toBe("1 d 1 h");
    expect(formatDelay(-30_000)).toBe("-30 s");
  });

  it("groups results by tone", () => {
    expect(resultTone("pass")).toBe("pass");
    expect(resultTone("softfail")).toBe("fail");
    expect(resultTone("none")).toBe("neutral");
  });
});
