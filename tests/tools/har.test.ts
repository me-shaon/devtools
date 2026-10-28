import { describe, expect, it } from "vitest";
import {
  filterRows,
  HarError,
  methodsOf,
  parseHar,
  queryParams,
  REDACTED,
  requestBody,
  resourceTypeOf,
  responseBody,
  responseBodyText,
  sanitizeHar,
  shellQuote,
  sortRows,
  timingBreakdown,
  toCurl,
  type Har,
  type HarEntry,
} from "@/utils/har";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const entry = (overrides: Partial<HarEntry> & { request?: Partial<HarEntry["request"]>; response?: Partial<HarEntry["response"]> }): HarEntry => ({
  startedDateTime: "2026-01-10T10:00:00.000Z",
  time: 100,
  ...overrides,
  request: { method: "GET", url: "https://example.com/", httpVersion: "HTTP/2", headers: [], cookies: [], queryString: [], headersSize: -1, bodySize: 0, ...overrides.request },
  response: { status: 200, statusText: "OK", headers: [], cookies: [], content: { size: 0, mimeType: "text/html" }, headersSize: -1, bodySize: 0, ...overrides.response },
  timings: overrides.timings ?? { blocked: 1, dns: -1, connect: -1, ssl: -1, send: 1, wait: 80, receive: 18 },
});

const fixture = (): Har => ({
  log: {
    version: "1.2",
    creator: { name: "WebInspector", version: "537.36" },
    pages: [{ id: "page_1", title: "https://app.example.com/", startedDateTime: "2026-01-10T10:00:00.000Z", pageTimings: { onContentLoad: 300, onLoad: 450 } }],
    entries: [
      entry({
        pageref: "page_1",
        _resourceType: "document",
        request: { url: "https://app.example.com/", headers: [{ name: "Cookie", value: "sid=abc123" }, { name: "Accept-Encoding", value: "gzip, br" }], cookies: [{ name: "sid", value: "abc123" }] },
        response: { content: { size: 120, mimeType: "text/html; charset=utf-8", text: "<!doctype html><title>App</title>" }, _transferSize: 820, headers: [{ name: "Set-Cookie", value: "sid=abc123; HttpOnly" }] },
      }),
      entry({
        startedDateTime: "2026-01-10T10:00:00.200Z",
        time: 250,
        _resourceType: "fetch",
        request: {
          method: "POST",
          url: "https://api.example.com/v1/login?next=%2Fhome&token=qs-secret",
          headers: [
            { name: ":authority", value: "api.example.com" },
            { name: "Authorization", value: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl" },
            { name: "Content-Type", value: "application/json" },
            { name: "Content-Length", value: "40" },
            { name: "X-API-Key", value: "key-123" },
          ],
          queryString: [{ name: "next", value: "/home" }, { name: "token", value: "qs-secret" }],
          postData: { mimeType: "application/json", text: '{"user":"ann","note":"it\'s me"}' },
        },
        response: {
          status: 201,
          statusText: "Created",
          content: { size: 26, mimeType: "application/json", text: btoa('{"ok":true,"id":7}'), encoding: "base64" },
          bodySize: 26,
          headersSize: 100,
        },
      }),
      entry({
        startedDateTime: "2026-01-10T10:00:00.300Z",
        time: 50,
        request: { url: "https://cdn.example.com/logo.png" },
        response: { content: { size: 68, mimeType: "image/png", text: PNG_BASE64, encoding: "base64" }, _transferSize: 300 },
      }),
      entry({
        startedDateTime: "2026-01-10T10:00:00.400Z",
        time: 30,
        _resourceType: "xhr",
        request: { method: "DELETE", url: "https://api.example.com/v1/items/9" },
        response: { status: 404, statusText: "Not Found", content: { size: 0, mimeType: "application/json" } },
      }),
      entry({
        startedDateTime: "2026-01-10T10:00:00.500Z",
        time: 0,
        request: { url: "https://blocked.example.com/ads.js" },
        response: { status: 0, statusText: "", _error: "net::ERR_BLOCKED_BY_CLIENT", content: { size: 0, mimeType: "" } },
        timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 0, wait: 0, receive: 0 },
      }),
    ],
  },
});

const parsed = () => parseHar(JSON.stringify(fixture()));

describe("parseHar", () => {
  it("normalizes each entry into a row", () => {
    const { rows } = parsed();
    expect(rows).toHaveLength(5);
    expect(rows[1]).toMatchObject({ method: "POST", host: "api.example.com", path: "/v1/login?next=%2Fhome&token=qs-secret", status: 201, statusClass: "2xx", type: "xhr", mimeType: "application/json", transferSize: 126, contentSize: 26, time: 250 });
    expect(rows[0]).toMatchObject({ type: "doc", mimeType: "text/html", transferSize: 820 });
    expect(rows[2].type).toBe("img");
    expect(rows[3].statusClass).toBe("4xx");
    expect(rows[4].statusClass).toBe("failed");
  });

  it("summarizes the archive", () => {
    const { summary } = parsed();
    expect(summary).toMatchObject({ count: 5, transferred: 820 + 126 + 300, span: 500, errors: 2 });
    expect(summary.pages).toEqual([{ id: "page_1", title: "https://app.example.com/", onLoad: 450 }]);
  });

  it("explains invalid JSON and JSON that is not a HAR file", () => {
    expect(() => parseHar("{oops")).toThrow(/not valid JSON/);
    expect(() => parseHar("[]")).toThrow(/not a HAR file/);
    expect(() => parseHar('{"name":"x"}')).toThrow(/log object is missing/);
    expect(() => parseHar('{"log":{"version":"1.2"}}')).toThrow(/log\.entries array is missing/);
    expect(() => parseHar("  ")).toThrow(HarError);
  });

  it("accepts a byte order mark", () => {
    expect(parseHar(`\uFEFF${JSON.stringify(fixture())}`).rows).toHaveLength(5);
  });
});

describe("resourceTypeOf", () => {
  it("uses Chrome's resource type, then the MIME type", () => {
    expect(resourceTypeOf("text/plain", "script")).toBe("js");
    expect(resourceTypeOf("", "websocket")).toBe("other");
    expect(resourceTypeOf("image/svg+xml")).toBe("img");
    expect(resourceTypeOf("font/woff2")).toBe("font");
    expect(resourceTypeOf("text/css")).toBe("css");
    expect(resourceTypeOf("application/javascript")).toBe("js");
    expect(resourceTypeOf("application/json")).toBe("xhr");
    expect(resourceTypeOf("application/octet-stream")).toBe("other");
  });
});

describe("filterRows and sortRows", () => {
  it("filters by text, method, status class, and type", () => {
    const { rows } = parsed();
    expect(filterRows(rows, { text: "LOGIN" }).map((r) => r.index)).toEqual([1]);
    expect(filterRows(rows, { method: "DELETE" }).map((r) => r.index)).toEqual([3]);
    expect(filterRows(rows, { status: "failed" }).map((r) => r.index)).toEqual([4]);
    expect(filterRows(rows, { type: "xhr" }).map((r) => r.index)).toEqual([1, 3]);
    expect(filterRows(rows, { type: "xhr", status: "2xx" }).map((r) => r.index)).toEqual([1]);
    expect(filterRows(rows, {})).toBe(rows);
  });

  it("sorts by a column and keeps HAR order on ties", () => {
    const { rows } = parsed();
    expect(sortRows(rows, "time", "desc").map((r) => r.index)).toEqual([1, 0, 2, 3, 4]);
    expect(sortRows(rows, "status", "asc").map((r) => r.index)).toEqual([4, 0, 2, 1, 3]);
    expect(sortRows(rows, "method", "asc").map((r) => r.method)).toEqual(["DELETE", "GET", "GET", "GET", "POST"]);
  });

  it("lists the methods", () => {
    expect(methodsOf(parsed().rows)).toEqual(["DELETE", "GET", "POST"]);
  });
});

describe("detail helpers", () => {
  it("reads query parameters from the HAR or the URL", () => {
    const { rows } = parsed();
    expect(queryParams(rows[1].entry)).toEqual([{ name: "next", value: "/home" }, { name: "token", value: "qs-secret" }]);
    const noList = entry({ request: { url: "https://x.test/?a=1&b=two" } });
    expect(queryParams(noList)).toEqual([{ name: "a", value: "1" }, { name: "b", value: "two" }]);
  });

  it("pretty-prints JSON request bodies and lists form fields", () => {
    const json = requestBody(parsed().rows[1].entry);
    expect(json).toMatchObject({ kind: "text", json: true });
    expect(json.kind === "text" && json.text).toContain('\n  "user": "ann"');
    const form = requestBody(entry({ request: { method: "POST", postData: { mimeType: "application/x-www-form-urlencoded", text: "a=1&b=hello+world" } } }));
    expect(form).toEqual({ kind: "form", mimeType: "application/x-www-form-urlencoded", params: [{ name: "a", value: "1" }, { name: "b", value: "hello world" }] });
    expect(requestBody(parsed().rows[0].entry)).toEqual({ kind: "none" });
  });

  it("decodes Base64 response bodies and shows images", () => {
    const { rows } = parsed();
    const json = responseBody(rows[1].entry);
    expect(json).toMatchObject({ kind: "text", json: true });
    expect(responseBodyText(rows[1].entry)).toBe('{\n  "ok": true,\n  "id": 7\n}');
    expect(responseBody(rows[2].entry)).toMatchObject({ kind: "image", dataUri: `data:image/png;base64,${PNG_BASE64}` });
    expect(responseBody(rows[0].entry)).toMatchObject({ kind: "text", json: false, text: "<!doctype html><title>App</title>" });
    expect(responseBody(rows[3].entry)).toEqual({ kind: "none" });
    const binary = entry({ response: { content: { size: 3, mimeType: "application/octet-stream", text: btoa("\x00\x01\x02"), encoding: "base64" } } });
    expect(responseBody(binary)).toEqual({ kind: "binary", mimeType: "application/octet-stream", size: 3 });
  });

  it("marks -1 timings as not applicable", () => {
    const phases = timingBreakdown(parsed().rows[0].entry.timings);
    expect(phases.map((p) => p.ms)).toEqual([1, null, null, null, 1, 80, 18]);
  });
});

describe("toCurl", () => {
  it("quotes for the shell", () => {
    expect(shellQuote("simple/path-1")).toBe("simple/path-1");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote("a b")).toBe("'a b'");
  });

  it("builds a POST with headers and a body, and skips pseudo and length headers", () => {
    const curl = toCurl(parsed().rows[1].entry);
    expect(curl).toBe(
      [
        "curl 'https://api.example.com/v1/login?next=%2Fhome&token=qs-secret'",
        "-H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'",
        "-H 'Content-Type: application/json'",
        "-H 'X-API-Key: key-123'",
        `--data-raw '{"user":"ann","note":"it'\\''s me"}'`,
      ].join(" \\\n  "),
    );
  });

  it("adds -X for methods curl does not infer and --compressed for compressed responses", () => {
    const { rows } = parsed();
    expect(toCurl(rows[3].entry)).toBe("curl https://api.example.com/v1/items/9 \\\n  -X DELETE");
    expect(toCurl(rows[0].entry)).toContain("--compressed");
    expect(toCurl(rows[0].entry)).not.toContain("-X");
    expect(toCurl(entry({ request: { method: "HEAD" } }))).toContain("--head");
    expect(toCurl(entry({ request: { cookies: [{ name: "a", value: "1" }] } }))).toContain("-b a=1");
  });
});

describe("sanitizeHar", () => {
  it("redacts credential headers, cookies, and secret query values without changing the original", () => {
    const har = fixture();
    const { har: clean, redacted } = sanitizeHar(har);
    const [doc, login] = clean.log.entries;
    expect(doc.request.headers?.find((h) => h.name === "Cookie")?.value).toBe(REDACTED);
    expect(doc.request.headers?.find((h) => h.name === "Accept-Encoding")?.value).toBe("gzip, br");
    expect(doc.request.cookies?.[0]).toEqual({ name: "sid", value: REDACTED });
    expect(doc.response.headers?.[0].value).toBe(REDACTED);
    expect(login.request.headers?.find((h) => h.name === "Authorization")?.value).toBe(REDACTED);
    expect(login.request.headers?.find((h) => h.name === "X-API-Key")?.value).toBe(REDACTED);
    expect(login.request.headers?.find((h) => h.name === "Content-Type")?.value).toBe("application/json");
    expect(login.request.queryString).toEqual([{ name: "next", value: "/home" }, { name: "token", value: REDACTED }]);
    expect(login.request.url).not.toContain("qs-secret");
    expect(login.request.url).toContain("next=%2Fhome");
    expect(redacted).toBe(6);
    expect(har.log.entries[1].request.headers?.[1].value).toMatch(/^Bearer /);
  });

  it("finds secrets in bodies with the secret redactor", () => {
    const har = fixture();
    har.log.entries[1].request.postData!.text = '{"password":"hunter2hunter2","user":"ann"}';
    const { har: clean } = sanitizeHar(har);
    expect(clean.log.entries[1].request.postData?.text).not.toContain("hunter2hunter2");
    expect(clean.log.entries[1].request.postData?.text).toContain("ann");
  });

  it("removes response bodies when asked", () => {
    const { har: clean } = sanitizeHar(fixture(), { removeResponseBodies: true });
    for (const e of clean.log.entries) {
      expect(e.response.content?.text).toBeUndefined();
      expect(e.response.content?.encoding).toBeUndefined();
    }
    expect(parseHar(JSON.stringify(clean)).rows).toHaveLength(5);
  });

  it("keeps CORS headers that only name other headers", () => {
    const har = fixture();
    har.log.entries[0].response.headers = [{ name: "Access-Control-Allow-Credentials", value: "true" }];
    expect(sanitizeHar(har).har.log.entries[0].response.headers?.[0].value).toBe("true");
  });
});

describe("review regressions", () => {
  it("reads entries that have only a request without throwing", () => {
    const har = { log: { entries: [{ request: { method: "GET", url: "https://x.test/?a=1" } }] } };
    const [row] = parseHar(JSON.stringify(har)).rows;
    expect(responseBody(row.entry)).toEqual({ kind: "none" });
    expect(responseBodyText(row.entry)).toBe("");
    expect(requestBody(row.entry)).toEqual({ kind: "none" });
    expect(queryParams(row.entry)).toEqual([{ name: "a", value: "1" }]);
    expect(toCurl(row.entry)).toBe("curl 'https://x.test/?a=1'");
    expect(timingBreakdown(row.entry.timings).every((p) => p.ms === null)).toBe(true);
    expect(() => sanitizeHar(har as unknown as Har)).not.toThrow();
  });

  it("keeps null and other non-object entries when it sanitizes", () => {
    const har = fixture();
    (har.log.entries as unknown[]).push(null, 7, { request: null, response: null });
    const { har: clean } = sanitizeHar(har);
    expect(clean.log.entries.slice(5)).toEqual([null, 7, { request: null, response: null }]);
    expect(clean.log.entries[0].request.cookies?.[0].value).toBe(REDACTED);
  });

  it("redacts tokens in Location and Referer URLs, redirectURL, and page titles", () => {
    const har = fixture();
    har.log.pages![0].title = "https://app.example.com/home?access_token=page-secret";
    const [doc] = har.log.entries;
    doc.request.headers = [{ name: "Referer", value: "https://app.example.com/?session=ref-secret&tab=2" }];
    doc.response.headers = [
      { name: "location", value: "https://app.example.com/cb?code=abc&access_token=xyz&state=ok" },
      { name: "Content-Location", value: "/callback?token=rel-secret" },
      { name: "Content-Type", value: "text/html" },
    ];
    doc.response.redirectURL = "https://app.example.com/cb?code=abc";
    const { har: clean } = sanitizeHar(har);
    const text = JSON.stringify(clean);
    for (const secret of ["page-secret", "ref-secret", "code=abc", "xyz", "rel-secret"]) expect(text).not.toContain(secret);
    const [cleanDoc] = clean.log.entries;
    expect(cleanDoc.response.headers?.[0].value).toContain("state=ok");
    expect(cleanDoc.response.headers?.[1].value).toBe("/callback?token=%5BREDACTED%5D");
    expect(cleanDoc.response.headers?.[2].value).toBe("text/html");
    expect(cleanDoc.request.headers?.[0].value).toContain("tab=2");
  });
});
