import { describe, expect, it } from "vitest";
import {
  CurlParseError,
  curlToCode,
  describeBody,
  generateCode,
  isCmdSyntax,
  parseCurl,
  tokenize,
  tokenizeCmd,
  tokenizePosix,
} from "@/utils/curl-to-code";

describe("tokenizePosix", () => {
  it("handles single quotes, double quotes, and escapes", () => {
    expect(tokenizePosix(`curl 'a b' "c \\"d\\" \\$e \\x" f\\ g`).tokens).toEqual(["curl", "a b", 'c "d" $e \\x', "f g"]);
  });

  it("joins adjacent quoted parts into one word", () => {
    expect(tokenizePosix(`curl -H 'X-A: '"$HOME"'/x'`).tokens).toEqual(["curl", "-H", "X-A: $HOME/x"]);
  });

  it("decodes $'…' ANSI-C strings", () => {
    expect(tokenizePosix(String.raw`curl $'line1\nline2\t\x41é\'q\101'`).tokens).toEqual(["curl", "line1\nline2\tAé'qA"]);
  });

  it("joins backslash-newline continuations, including CRLF", () => {
    expect(tokenizePosix("curl \\\n  -s \\\r\n  https://x.test").tokens).toEqual(["curl", "-s", "https://x.test"]);
  });

  it("stops at a pipe and keeps the rest", () => {
    expect(tokenizePosix("curl https://x.test | jq .")).toEqual({ tokens: ["curl", "https://x.test"], rest: "| jq ." });
  });

  it("reports unterminated quotes with a position", () => {
    expect(() => tokenizePosix("curl 'abc")).toThrow(CurlParseError);
    expect(() => tokenizePosix("curl \\\n  -d \"abc")).toThrow(/Unterminated double quote \(line 2, column 6\)/);
    expect(() => tokenizePosix("curl $'abc")).toThrow(/Unterminated \$'…' string/);
  });
});

describe("tokenizeCmd", () => {
  const chromeCmd = [
    'curl ^"https://api.example.com/items?a=1^&b=2^" ^',
    '  -H ^"accept: application/json^" ^',
    '  --data-raw ^"^{^\\^"name^\\^":^\\^"x y^\\^"^}^"',
  ].join("\n");

  it("reads Chrome's Copy as cURL (cmd) output", () => {
    expect(isCmdSyntax(chromeCmd)).toBe(true);
    expect(tokenizeCmd(chromeCmd).tokens).toEqual([
      "curl",
      "https://api.example.com/items?a=1&b=2",
      "-H",
      "accept: application/json",
      "--data-raw",
      '{"name":"x y"}',
    ]);
    expect(tokenize(chromeCmd).tokens[1]).toBe("https://api.example.com/items?a=1&b=2");
  });

  it("does not treat POSIX commands as cmd", () => {
    expect(isCmdSyntax("curl 'https://x.test' \\\n -H 'a: b'")).toBe(false);
  });

  it("reports an unterminated quote", () => {
    expect(() => tokenizeCmd('curl ^"https://x.test ^\n -s')).toThrow(/Unterminated double quote/);
  });
});

describe("parseCurl flags", () => {
  it("reads the URL from a positional argument or --url, and adds a missing scheme", () => {
    expect(parseCurl("curl https://x.test/a").url).toBe("https://x.test/a");
    expect(parseCurl("curl --url https://x.test/b").url).toBe("https://x.test/b");
    const bare = parseCurl("curl example.com");
    expect(bare.url).toBe("http://example.com");
    expect(bare.notes.join(" ")).toMatch(/no scheme/);
  });

  it("reads -X, attached short values, and clusters", () => {
    const req = parseCurl("curl -XDELETE -sSL https://x.test");
    expect(req.method).toBe("DELETE");
    expect(req.followRedirects).toBe(true);
    expect(req.ignoredFlags).toEqual(["-s", "-S"]);
    expect(parseCurl("curl --request patch https://x.test").method).toBe("PATCH");
  });

  it("reads headers and skips removal headers", () => {
    const req = parseCurl(`curl https://x.test -H 'Accept: text/html' -H "X-Empty;" -H 'Host:'`);
    expect(req.headers).toEqual([
      ["Accept", "text/html"],
      ["X-Empty", ""],
    ]);
    expect(req.notes.join(" ")).toMatch(/removes a default curl header/);
  });

  it("joins several -d values with & and infers POST and the form Content-Type", () => {
    const req = parseCurl("curl https://x.test -d a=1 --data b=2 --data-raw '@c' --data-binary d=4");
    expect(req.method).toBe("POST");
    expect(req.body).toEqual({ kind: "urlencoded", text: "a=1&b=2&@c&d=4" });
    expect(req.headers).toContainEqual(["Content-Type", "application/x-www-form-urlencoded"]);
  });

  it("keeps a placeholder for @file data and notes it", () => {
    const req = parseCurl("curl https://x.test -d @body.json --data-binary @raw.bin");
    expect(req.body).toMatchObject({ text: "<contents of body.json>&<contents of raw.bin>" });
    expect(req.notes.filter((n) => /reading data from a file is not supported/.test(n))).toHaveLength(2);
  });

  it("encodes --data-urlencode values", () => {
    const req = parseCurl(`curl https://x.test --data-urlencode 'q=a b&c' --data-urlencode 'plain text' --data-urlencode '=x!y'`);
    expect(req.body).toMatchObject({ text: "q=a%20b%26c&plain%20text&x%21y" });
  });

  it("sets JSON headers for --json and pretty-prints the body", () => {
    const req = parseCurl(`curl https://x.test --json '{"a":1}'`);
    expect(req.method).toBe("POST");
    expect(req.headers).toEqual([
      ["Content-Type", "application/json"],
      ["Accept", "application/json"],
    ]);
    expect(req.body).toMatchObject({ kind: "json", value: { a: 1 } });
  });

  it("reads -F fields and file parts", () => {
    const req = parseCurl(`curl https://x.test -F name=Ann -F 'pic=@me.png;type=image/png' --form-string 'raw=@literal' -H 'Content-Type: multipart/form-data'`);
    expect(req.body).toEqual({
      kind: "multipart",
      fields: [
        { name: "name", value: "Ann" },
        { name: "pic", file: "me.png", contentType: "image/png", filename: undefined },
        { name: "raw", value: "@literal" },
      ],
    });
    expect(req.headers).toEqual([]);
    expect(describeBody(req.body)).toBe("Multipart form (3 fields)");
  });

  it("reads -u, -b, -A, and -e", () => {
    const req = parseCurl("curl https://x.test -u ann:s3cret -b 'a=1' --cookie 'b=2' -A 'Agent/1' -e 'https://ref.test;auto'");
    expect(req.auth).toEqual({ user: "ann", password: "s3cret" });
    expect(req.headers).toEqual([
      ["User-Agent", "Agent/1"],
      ["Referer", "https://ref.test"],
      ["Cookie", "a=1; b=2"],
    ]);
    expect(parseCurl("curl -b cookies.txt https://x.test").notes.join(" ")).toMatch(/cookies from a file/);
  });

  it("moves data into the query string with -G", () => {
    const req = parseCurl("curl -G https://x.test/s?x=0 -d q=cats -d page=2");
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://x.test/s?x=0&q=cats&page=2");
    expect(req.body).toBeNull();
  });

  it("reads -k, --compressed, -I, -m, and --http2", () => {
    const req = parseCurl("curl -k --compressed -I -m 2.5 --http2 https://x.test");
    expect(req).toMatchObject({ insecure: true, compressed: true, method: "HEAD", timeout: 2.5, http2: true });
  });

  it("lists ignored, unknown, and unsupported flags", () => {
    const req = parseCurl("curl -v -i -o out.txt --frobnicate -x http://proxy:8080 https://x.test");
    expect(req.ignoredFlags).toEqual(["-v", "-i", "-o"]);
    expect(req.unknownFlags).toEqual(["--frobnicate"]);
    expect(req.notes.join(" ")).toMatch(/Not converted: -x/);
    expect(req.url).toBe("https://x.test");
  });

  it("reports missing values, URLs, and non-curl commands", () => {
    expect(() => parseCurl("curl https://x.test -H")).toThrow(/-H needs a value/);
    expect(() => parseCurl("curl -s")).toThrow(/no URL/);
    expect(() => parseCurl("wget https://x.test")).toThrow(/must start with curl/);
    expect(() => parseCurl("   ")).toThrow(/Paste a curl command/);
  });

  it("strips a leading $ prompt", () => {
    expect(parseCurl("$ curl https://x.test").url).toBe("https://x.test");
  });
});

const JSON_POST = `curl -X POST https://api.example.com/v1/items -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"name":"x","ok":true,"n":null}' -m 10 -k -L`;
const FORM_UPLOAD = "curl -F name=Ann -F 'avatar=@photo.png;type=image/png' -u me:pw https://up.example.com";
const SIMPLE_GET = "curl -H 'Accept: text/plain' https://example.com/health";

describe("generateCode", () => {
  it("writes JavaScript fetch", () => {
    const post = curlToCode(JSON_POST, "javascript").code;
    expect(post).toContain('await fetch("https://api.example.com/v1/items", {');
    expect(post).toContain('method: "POST",');
    expect(post).toContain('Authorization: "Bearer abc123",');
    expect(post).toContain('body: JSON.stringify({\n    "name": "x",');
    expect(post).toContain("signal: AbortSignal.timeout(10000)");
    expect(post).toContain("browsers cannot skip TLS");
    const upload = curlToCode(FORM_UPLOAD, "javascript").code;
    expect(upload).toContain('form.append("avatar", new Blob([/* contents of photo.png */], { type: "image/png" }), "photo.png");');
    expect(upload).toContain('Authorization: "Basic " + btoa("me:pw")');
    expect(curlToCode(SIMPLE_GET, "javascript").code).not.toContain("method:");
  });

  it("writes Node fetch", () => {
    const upload = curlToCode(FORM_UPLOAD, "node").code;
    expect(upload).toContain('import { readFile } from "node:fs/promises";');
    expect(upload).toContain('await readFile("photo.png")');
    expect(curlToCode(JSON_POST, "node").code).toContain("NODE_TLS_REJECT_UNAUTHORIZED");
  });

  it("writes Python requests", () => {
    const post = curlToCode(JSON_POST, "python").code;
    expect(post).toContain("import requests");
    expect(post).toContain('payload = {\n    "name": "x",\n    "ok": True,\n    "n": None,\n}');
    expect(post).toContain("json=payload");
    expect(post).toContain("timeout=10");
    expect(post).toContain("verify=False");
    const upload = curlToCode(FORM_UPLOAD, "python").code;
    expect(upload).toContain('"avatar": ("photo.png", open("photo.png", "rb"), "image/png"),');
    expect(upload).toContain('auth=("me", "pw")');
    expect(curlToCode("curl -X PURGE https://x.test", "python").code).toContain('requests.request("PURGE", url)');
  });

  it("writes Go net/http", () => {
    const post = curlToCode(JSON_POST, "go").code;
    expect(post).toContain("package main");
    expect(post).toContain("http.NewRequest(http.MethodPost, \"https://api.example.com/v1/items\", body)");
    expect(post).toContain("body := strings.NewReader(`{\n  \"name\": \"x\",");
    expect(post).toContain("InsecureSkipVerify: true");
    expect(post).toContain("Timeout: 10 * time.Second,");
    expect(post).toContain('\t"crypto/tls"');
    const upload = curlToCode(FORM_UPLOAD, "go").code;
    expect(upload).toContain('form.CreateFormFile("avatar", "photo.png")');
    expect(upload).toContain('req.SetBasicAuth("me", "pw")');
    expect(upload).toContain("form.FormDataContentType()");
  });

  it("writes PHP curl", () => {
    const post = curlToCode(JSON_POST, "php").code;
    expect(post).toContain("curl_setopt($ch, CURLOPT_URL, 'https://api.example.com/v1/items');");
    expect(post).toContain("'Authorization: Bearer abc123',");
    expect(post).toContain("CURLOPT_POSTFIELDS, <<<'JSON'");
    expect(post).toContain("CURLOPT_FOLLOWLOCATION, true");
    expect(post).toContain("CURLOPT_SSL_VERIFYPEER, false");
    expect(post).not.toContain("CURLOPT_CUSTOMREQUEST");
    expect(curlToCode(FORM_UPLOAD, "php").code).toContain("'avatar' => new CURLFile('photo.png', 'image/png'),");
    expect(curlToCode("curl -X PUT -d 'it'\\''s' https://x.test", "php").code).toContain("CURLOPT_POSTFIELDS, 'it\\'s'");
  });

  it("writes Rust reqwest, blocking or async", () => {
    const blocking = curlToCode(JSON_POST, "rust").code;
    expect(blocking).toContain('features = ["blocking"]');
    expect(blocking).toContain("reqwest::blocking::Client::builder()");
    expect(blocking).toContain(".danger_accept_invalid_certs(true)");
    expect(blocking).toContain('.body(r#"{\n  "name": "x",');
    expect(blocking).toContain(".send()?;");
    const asyncCode = curlToCode(FORM_UPLOAD, "rust", { rustAsync: true }).code;
    expect(asyncCode).toContain("#[tokio::main]");
    expect(asyncCode).toContain('.file("avatar", "photo.png").await?');
    expect(asyncCode).toContain('.basic_auth("me", Some("pw"))');
    expect(asyncCode).toContain(".send().await?;");
  });

  it("writes HTTPie", () => {
    const post = curlToCode(JSON_POST, "httpie").code;
    expect(post).toContain("http --follow --verify=no --timeout=10 POST https://api.example.com/v1/items");
    expect(post).toContain("'Authorization:Bearer abc123'");
    expect(post).toContain("--raw '{");
    expect(curlToCode(FORM_UPLOAD, "httpie").code).toContain("http -a me:pw --multipart POST https://up.example.com");
    expect(curlToCode(SIMPLE_GET, "httpie").code).toBe("http GET https://example.com/health \\\n  Accept:text/plain");
  });

  it("keeps secrets as written", () => {
    for (const target of ["javascript", "python", "go", "php", "rust", "httpie"] as const) {
      expect(generateCode(parseCurl(JSON_POST), target)).toContain("abc123");
    }
  });
});
