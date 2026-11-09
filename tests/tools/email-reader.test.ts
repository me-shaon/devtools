import { describe, expect, it } from "vitest";
import {
  decodeEncodedWords,
  formatAddress,
  hasRemoteContent,
  inlineCidImages,
  isMsgFile,
  parseAddressList,
  parseEmail,
  parseEmailDate,
  parseParameterised,
  safeFileName,
} from "@/utils/email-reader";

const enc = (text: string) => new TextEncoder().encode(text);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// ---------------------------------------------------------------------------
// A tiny OLE writer, only for tests. Every stream goes in regular sectors (mini cutoff 0).
// ---------------------------------------------------------------------------

interface Entry {
  name: string;
  type: 1 | 2 | 5;
  data?: Uint8Array;
  children?: Entry[];
}

const stream = (name: string, data: Uint8Array): Entry => ({ name, type: 2, data });
const utf16 = (text: string) => {
  const out = new Uint8Array(text.length * 2 + 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return out;
};
const str = (id: string, text: string) => stream(`__substg1.0_${id}001F`, utf16(text));
const bin = (id: string, data: Uint8Array) => stream(`__substg1.0_${id}0102`, data);

const prop = (tag: number, write: (v: DataView) => void) => {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, tag, true);
  write(new DataView(out.buffer, 8, 8));
  return out;
};
const props = (header: number, entries: Uint8Array[]) => {
  const out = new Uint8Array(header + entries.length * 16);
  entries.forEach((e, i) => out.set(e, header + i * 16));
  return stream("__properties_version1.0", out);
};
const longProp = (tag: number, value: number) => prop(tag, (v) => v.setUint32(0, value, true));
const timeProp = (tag: number, date: Date) =>
  prop(tag, (v) => {
    const ticks = (BigInt(date.getTime()) + 11644473600000n) * 10000n;
    v.setUint32(0, Number(ticks & 0xffffffffn), true);
    v.setUint32(4, Number(ticks >> 32n), true);
  });

function buildOle(root: Entry[]): Uint8Array {
  const SECTOR = 512;
  const flat: { entry: Entry; left: number; right: number; child: number }[] = [{ entry: { name: "Root Entry", type: 5 }, left: -1, right: -1, child: -1 }];
  const add = (children: Entry[]): number => {
    const ids = children.map((entry) => {
      flat.push({ entry, left: -1, right: -1, child: -1 });
      return flat.length - 1;
    });
    ids.forEach((id, i) => {
      if (i + 1 < ids.length) flat[id].right = ids[i + 1];
    });
    ids.forEach((id, i) => {
      if (children[i].children) flat[id].child = add(children[i].children!);
    });
    return ids[0] ?? -1;
  };
  flat[0].child = add(root);

  const dirSectors = Math.ceil(flat.length / 4);
  let next = 1 + dirSectors; // sector 0 is the FAT
  const starts: number[] = flat.map(() => 0xfffffffe);
  const fat: number[] = [0xfffffffd];
  for (let i = 0; i < dirSectors; i++) fat.push(i + 1 < dirSectors ? 2 + i : 0xfffffffe);
  const dataSectors: Uint8Array[] = [];
  flat.forEach(({ entry }, i) => {
    if (entry.type !== 2 || !entry.data?.length) return;
    const count = Math.ceil(entry.data.length / SECTOR);
    starts[i] = next;
    for (let s = 0; s < count; s++) {
      fat.push(s + 1 < count ? next + s + 1 : 0xfffffffe);
      const chunk = new Uint8Array(SECTOR);
      chunk.set(entry.data.subarray(s * SECTOR, (s + 1) * SECTOR));
      dataSectors.push(chunk);
    }
    next += count;
  });
  if (fat.length > 128) throw new Error("Test file too large for one FAT sector.");

  const file = new Uint8Array(SECTOR * (1 + 1 + dirSectors + dataSectors.length));
  const hv = new DataView(file.buffer);
  file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  hv.setUint16(0x18, 0x3e, true);
  hv.setUint16(0x1a, 3, true);
  hv.setUint16(0x1c, 0xfffe, true);
  hv.setUint16(0x1e, 9, true);
  hv.setUint16(0x20, 6, true);
  hv.setUint32(0x2c, 1, true);
  hv.setUint32(0x30, 1, true);
  hv.setUint32(0x38, 0, true);
  hv.setUint32(0x3c, 0xfffffffe, true);
  hv.setUint32(0x44, 0xfffffffe, true);
  for (let i = 0; i < 109; i++) hv.setUint32(0x4c + i * 4, i === 0 ? 0 : 0xffffffff, true);

  const fatView = new DataView(file.buffer, SECTOR, SECTOR);
  for (let i = 0; i < 128; i++) fatView.setUint32(i * 4, fat[i] ?? 0xffffffff, true);

  const dir = new DataView(file.buffer, SECTOR * 2, dirSectors * SECTOR);
  for (let i = 0; i < dirSectors * 4; i++) {
    const o = i * 128;
    const item = flat[i];
    if (!item) {
      dir.setUint32(o + 68, 0xffffffff, true);
      dir.setUint32(o + 72, 0xffffffff, true);
      dir.setUint32(o + 76, 0xffffffff, true);
      continue;
    }
    const name = item.entry.name;
    for (let c = 0; c < name.length; c++) dir.setUint16(o + c * 2, name.charCodeAt(c), true);
    dir.setUint16(o + 64, name.length * 2 + 2, true);
    dir.setUint8(o + 66, item.entry.type);
    dir.setUint32(o + 68, item.left >>> 0, true);
    dir.setUint32(o + 72, item.right >>> 0, true);
    dir.setUint32(o + 76, item.child >>> 0, true);
    dir.setUint32(o + 116, starts[i], true);
    dir.setUint32(o + 120, item.entry.data?.length ?? 0, true);
  }
  dataSectors.forEach((s, i) => file.set(s, SECTOR * (2 + dirSectors + i)));
  return file;
}

// ---------------------------------------------------------------------------

describe("header decoding", () => {
  it("decodes RFC 2047 encoded words in B and Q form", () => {
    expect(decodeEncodedWords("=?UTF-8?B?SGVsbG8g8J+Zgg==?=")).toBe("Hello 🙂");
    expect(decodeEncodedWords("=?iso-8859-1?Q?Caf=E9_au_lait?=")).toBe("Café au lait");
  });

  it("joins adjacent encoded words without the space between them", () => {
    expect(decodeEncodedWords("=?UTF-8?Q?foo?= =?UTF-8?Q?bar?=")).toBe("foobar");
  });

  it("parses parameters, quoting, and RFC 2231 continuations", () => {
    const parsed = parseParameterised('Text/HTML; charset="utf-8"; name*0="long "; name*1="name.txt"');
    expect(parsed.value).toBe("text/html");
    expect(parsed.params.charset).toBe("utf-8");
    expect(parsed.params.name).toBe("long name.txt");
    expect(parseParameterised("attachment; filename*=utf-8''%E2%82%AC.txt").params.filename).toBe("€.txt");
  });
});

describe("addresses and dates", () => {
  it("parses names, quoted commas, bare addresses, and groups", () => {
    const list = parseAddressList('"Lovelace, Ada" <ada@example.com>, bob@example.com, Team: carol@example.com, "Dan" <dan@example.com>;');
    expect(list.map(formatAddress)).toEqual([
      "Lovelace, Ada <ada@example.com>",
      "bob@example.com",
      "carol@example.com",
      "Dan <dan@example.com>",
    ]);
  });

  it("decodes encoded display names", () => {
    expect(parseAddressList("=?UTF-8?B?w4lsw6g=?= <e@example.com>")[0]).toEqual({ name: "Élè", address: "e@example.com" });
  });

  it("parses a Date header and rejects junk", () => {
    expect(parseEmailDate("Tue, 10 Mar 2026 09:30:00 +0000 (UTC)")?.toISOString()).toBe("2026-03-10T09:30:00.000Z");
    expect(parseEmailDate("not a date")).toBeNull();
    expect(parseEmailDate("")).toBeNull();
  });
});

describe("parseEmail for .eml", () => {
  it("reads a simple text message", () => {
    const email = parseEmail(enc("From: Ada <ada@example.com>\r\nTo: bob@example.com\r\nSubject: Hi\r\nDate: Tue, 10 Mar 2026 09:30:00 +0000\r\nMessage-ID: <abc@example.com>\r\n\r\nHello Bob\r\n"));
    expect(email.format).toBe("eml");
    expect(email.subject).toBe("Hi");
    expect(email.from).toEqual([{ name: "Ada", address: "ada@example.com" }]);
    expect(email.to[0].address).toBe("bob@example.com");
    expect(email.messageId).toBe("abc@example.com");
    expect(email.text.trim()).toBe("Hello Bob");
    expect(email.html).toBe("");
    expect(email.attachments).toEqual([]);
  });

  it("unfolds long headers", () => {
    const email = parseEmail(enc("From: a@example.com\r\nSubject: one\r\n two\r\n\tthree\r\n\r\nbody"));
    expect(email.subject).toBe("one two three");
  });

  it("decodes quoted-printable and base64 bodies with their charsets", () => {
    const qp = parseEmail(enc("From: a@example.com\r\nContent-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nCaf=E9 soft=\r\nbreak"));
    expect(qp.text).toBe("Café softbreak");
    const text = b64(enc("Привет"));
    const base = parseEmail(enc(`From: a@example.com\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${text}`));
    expect(base.text).toBe("Привет");
  });

  it("reads multipart/alternative with an attachment", () => {
    const eml = [
      "From: a@example.com",
      "Subject: Report",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="outer"',
      "",
      "--outer",
      'Content-Type: multipart/alternative; boundary="inner"',
      "",
      "--inner",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Plain body",
      "--inner",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>HTML <b>body</b></p>",
      "--inner--",
      "--outer",
      'Content-Type: application/pdf; name="report.pdf"',
      'Content-Disposition: attachment; filename="report.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(enc("%PDF-1.4 hello")),
      "--outer--",
      "",
    ].join("\r\n");
    const email = parseEmail(enc(eml));
    expect(email.text).toBe("Plain body");
    expect(email.html).toBe("<p>HTML <b>body</b></p>");
    expect(email.attachments).toHaveLength(1);
    const [pdf] = email.attachments;
    expect(pdf.name).toBe("report.pdf");
    expect(pdf.mimeType).toBe("application/pdf");
    expect(pdf.size).toBe(14);
    expect(new TextDecoder().decode(pdf.bytes)).toBe("%PDF-1.4 hello");
    expect(pdf.inline).toBe(false);
  });

  it("marks cid images inline and swaps them for data URLs", () => {
    const eml = [
      "From: a@example.com",
      'Content-Type: multipart/related; boundary="b"',
      "",
      "--b",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<img src="cid:logo@x"><img src="https://tracker.example/p.gif">',
      "--b",
      "Content-Type: image/png",
      "Content-ID: <logo@x>",
      "Content-Disposition: inline",
      "Content-Transfer-Encoding: base64",
      "",
      b64(Uint8Array.of(137, 80, 78, 71)),
      "--b--",
      "",
    ].join("\r\n");
    const email = parseEmail(enc(eml));
    expect(email.attachments[0].inline).toBe(true);
    const html = inlineCidImages(email.html, email.attachments);
    expect(html).toContain("data:image/png;base64,iVBORw==");
    expect(html).not.toContain("cid:logo");
    expect(hasRemoteContent(html)).toBe(true);
    expect(hasRemoteContent('<img src="data:image/png;base64,AA==">')).toBe(false);
  });

  it("keeps an attached message as an attachment", () => {
    const eml = [
      "From: a@example.com",
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain",
      "",
      "See attached",
      "--b",
      "Content-Type: message/rfc822",
      "",
      "From: z@example.com",
      "Subject: Forwarded",
      "",
      "inner",
      "--b--",
      "",
    ].join("\r\n");
    const email = parseEmail(enc(eml));
    expect(email.attachments.map((a) => a.name)).toEqual(["Forwarded.eml"]);
  });

  it("rejects files that are not email", () => {
    expect(() => parseEmail(enc("just some text with no headers"))).toThrow(/does not look like an email/);
    expect(() => parseEmail(new Uint8Array())).toThrow(/empty/);
  });

  it("skips an mbox From_ line", () => {
    expect(parseEmail(enc("From a@example.com Tue Mar 10 09:30:00 2026\nFrom: a@example.com\nSubject: Boxed\n\nx")).subject).toBe("Boxed");
  });
});

describe("parseEmail for .msg", () => {
  const sent = new Date("2026-03-10T09:30:00.000Z");
  const msg = () =>
    buildOle([
      str("0037", "Quarterly plan"),
      str("0C1A", "Ada Lovelace"),
      str("5D01", "ada@example.com"),
      str("1000", "Plain body"),
      bin("1013", enc("<p>HTML body</p>")),
      str("007D", "Message-ID: <m1@example.com>\r\nReply-To: reply@example.com"),
      props(32, [timeProp(0x00390040, sent), longProp(0x3fde0003, 65001)]),
      { name: "__recip_version1.0_#00000000", type: 1, children: [str("3001", "Bob"), str("39FE", "bob@example.com"), props(8, [longProp(0x0c150003, 1)])] },
      { name: "__recip_version1.0_#00000001", type: 1, children: [str("3001", "Carol"), str("39FE", "carol@example.com"), props(8, [longProp(0x0c150003, 2)])] },
      { name: "__recip_version1.0_#00000002", type: 1, children: [str("3001", "Dan"), str("39FE", "dan@example.com"), props(8, [longProp(0x0c150003, 3)])] },
      {
        name: "__attach_version1.0_#00000000",
        type: 1,
        children: [str("3707", "notes.txt"), str("370E", "text/plain"), bin("3701", enc("attachment data")), props(8, [longProp(0x37050003, 1)])],
      },
    ]);

  it("detects the format from the bytes", () => {
    expect(isMsgFile(msg())).toBe(true);
    expect(isMsgFile(enc("From: a@example.com"))).toBe(false);
  });

  it("reads subject, sender, recipients, date, and bodies", () => {
    const email = parseEmail(msg());
    expect(email.format).toBe("msg");
    expect(email.subject).toBe("Quarterly plan");
    expect(email.from).toEqual([{ name: "Ada Lovelace", address: "ada@example.com" }]);
    expect(email.to).toEqual([{ name: "Bob", address: "bob@example.com" }]);
    expect(email.cc).toEqual([{ name: "Carol", address: "carol@example.com" }]);
    expect(email.bcc).toEqual([{ name: "Dan", address: "dan@example.com" }]);
    expect(email.date?.toISOString()).toBe(sent.toISOString());
    expect(email.text).toBe("Plain body");
    expect(email.html).toBe("<p>HTML body</p>");
    expect(email.messageId).toBe("m1@example.com");
    expect(email.replyTo[0].address).toBe("reply@example.com");
  });

  it("reads attachments", () => {
    const [file] = parseEmail(msg()).attachments;
    expect(file.name).toBe("notes.txt");
    expect(file.mimeType).toBe("text/plain");
    expect(new TextDecoder().decode(file.bytes)).toBe("attachment data");
  });

  it("falls back to the display recipient lists", () => {
    const email = parseEmail(buildOle([str("0037", "x"), str("0E04", "Bob; Eve"), props(32, [])]));
    expect(email.to.map((a) => a.name)).toEqual(["Bob", "Eve"]);
  });

  it("notes a message that only has an RTF body", () => {
    const email = parseEmail(buildOle([str("0037", "x"), bin("1009", Uint8Array.of(1, 2, 3)), props(32, [])]));
    expect(email.warnings.join(" ")).toMatch(/RTF/);
  });

  it("rejects a damaged compound file", () => {
    const bytes = msg();
    bytes.fill(0, 1024, 1536); // the directory sector
    expect(() => parseEmail(bytes)).toThrow();
  });
});

describe("safeFileName", () => {
  it("removes path parts and reserved characters", () => {
    expect(safeFileName("../../etc/pass:wd")).toBe("_.._etc_pass_wd");
    expect(safeFileName("   ")).toBe("attachment");
    expect(safeFileName(".hidden")).toBe("hidden");
  });
});

describe("review fixes", () => {
  const eml = (lines: string[]) => enc(lines.join("\r\n"));

  it("decodes long runs of hostile header and HTML text quickly", () => {
    const started = performance.now();
    decodeEncodedWords(`=?a${"*".repeat(50_000)}`);
    hasRemoteContent(`<img src=${" ".repeat(50_000)}x>`);
    hasRemoteContent(`<p style="background:url(${" ".repeat(50_000)}">`);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("still finds remote content after spaces and quotes", () => {
    expect(hasRemoteContent('<img src = " https://x.example/p.gif">')).toBe(true);
    expect(hasRemoteContent("<div style=\"background: url( 'http://x.example/a.png')\">")).toBe(true);
    expect(hasRemoteContent('<img src="data:image/png;base64,AAAA">')).toBe(false);
  });

  it("decodes a character that is split across two encoded words", () => {
    expect(decodeEncodedWords("=?UTF-8?B?Y2Fmww==?= =?UTF-8?B?qQ==?=")).toBe("café");
    expect(decodeEncodedWords("=?UTF-8?Q?caf=C3?= =?UTF-8?Q?=A9?= ok")).toBe("café ok");
    expect(decodeEncodedWords("=?UTF-8?B?w6k=?= =?ISO-8859-1?Q?=E9?=")).toBe("éé");
  });

  it("prefers filename* over filename in either order", () => {
    expect(parseParameterised(`attachment; filename*=UTF-8''%E2%82%AC.pdf; filename="EUR.pdf"`).params.filename).toBe("€.pdf");
    expect(parseParameterised(`attachment; filename="EUR.pdf"; filename*=UTF-8''%E2%82%AC.pdf`).params.filename).toBe("€.pdf");
  });

  it("drops the group name before an angle address", () => {
    expect(parseAddressList("Team: Ada <ada@x.com>, Bob <bob@x.com>;")).toEqual([
      { name: "Ada", address: "ada@x.com" },
      { name: "Bob", address: "bob@x.com" },
    ]);
    expect(parseAddressList("Undisclosed recipients:;")).toEqual([]);
  });

  it("does not split a part on a longer boundary that starts with the outer one", () => {
    const email = parseEmail(
      eml([
        "From: a@x.com",
        'Content-Type: multipart/mixed; boundary="abc"',
        "",
        "--abc",
        'Content-Type: multipart/alternative; boundary="abc-alt"',
        "",
        "--abc-alt",
        "Content-Type: text/plain",
        "",
        "plain",
        "--abc-alt",
        "Content-Type: text/html",
        "",
        "<p>html</p>",
        "--abc-alt--",
        "--abc--",
        "",
      ]),
    );
    expect(email.text).toBe("plain");
    expect(email.html).toBe("<p>html</p>");
  });

  it("saves a base64 forwarded message decoded, named after its subject", () => {
    const inner = "From: c@x.com\r\nSubject: Inner\r\n\r\nbody";
    const email = parseEmail(
      eml([
        "From: a@x.com",
        'Content-Type: multipart/mixed; boundary="b"',
        "",
        "--b",
        "Content-Type: message/rfc822",
        "Content-Transfer-Encoding: base64",
        "",
        b64(enc(inner)),
        "--b--",
        "",
      ]),
    );
    expect(email.attachments[0].name).toBe("Inner.eml");
    expect(new TextDecoder().decode(email.attachments[0].bytes)).toBe(inner);
  });

  it("lists an inline image that the HTML does not show, and hides one that it shows", () => {
    const image = (id: string, name: string) => [
      "--b",
      `Content-Type: image/png; name=${name}`,
      `Content-Disposition: inline; filename=${name}`,
      `Content-ID: <${id}>`,
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
    ];
    const textOnly = parseEmail(eml(["From: a@x.com", 'Content-Type: multipart/mixed; boundary="b"', "", "--b", "Content-Type: text/plain", "", "hi", ...image("x1", "IMG_1.png"), "--b--", ""]));
    expect(textOnly.attachments.map((a) => [a.name, a.inline])).toEqual([["IMG_1.png", false]]);
    const withHtml = parseEmail(
      eml(["From: a@x.com", 'Content-Type: multipart/related; boundary="b"', "", "--b", "Content-Type: text/html", "", '<img src="cid:x1">', ...image("x1", "a.png"), ...image("x2", "b.png"), "--b--", ""]),
    );
    expect(withHtml.attachments.map((a) => [a.name, a.inline])).toEqual([
      ["a.png", true],
      ["b.png", false],
    ]);
  });

  it("ignores a UTF-8 byte order mark and reads 8bit text without a charset", () => {
    const bom = parseEmail(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc("From: a@x.com\r\nSubject: s\r\n\r\nbody")]));
    expect(bom.from).toEqual([{ name: "", address: "a@x.com" }]);
    const latin = parseEmail(Uint8Array.from([...enc("From: a@x.com\r\nContent-Type: text/plain\r\n\r\ncaf"), 0xe9]));
    expect(latin.text).toBe("café");
    expect(parseEmail(enc("From: a@x.com\r\nContent-Type: text/plain\r\n\r\ncafé")).text).toBe("café");
  });

  it("removes direction and invisible characters from file names and caps their length", () => {
    expect(safeFileName("report‮fdp.exe")).toBe("reportfdp.exe");
    expect(safeFileName("a​⁦b\u007f.txt")).toBe("ab_.txt");
    const long = safeFileName(`${"x".repeat(300)}.pdf`);
    expect(long).toHaveLength(200);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe(".msg review fixes", () => {
  const ansi = (id: string, bytes: Uint8Array) => stream(`__substg1.0_${id}001E`, bytes);

  it("stops at a DIFAT sector that points to itself", () => {
    const base = buildOle([str("0037", "x"), props(32, [])]);
    const bytes = new Uint8Array(base.length + 512);
    bytes.set(base);
    const loop = bytes.length / 512 - 2;
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 4, loop, true);
    view.setUint32(0x44, loop, true);
    view.setUint32(0x48, 0xffffffff, true);
    const started = performance.now();
    expect(parseEmail(bytes).subject).toBe("x");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("reads a stream size larger than the file without a large allocation", () => {
    const bytes = buildOle([str("0037", "x"), props(32, [])]);
    new DataView(bytes.buffer).setUint32(1024 + 120, 0xffffffff, true);
    expect(parseEmail(bytes).subject).toBe("x");
  });

  it("decodes ANSI strings with the message code page", () => {
    const subject = Uint8Array.of(0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2);
    expect(parseEmail(buildOle([ansi("0037", subject), props(32, [longProp(0x3ffd0003, 1251)])])).subject).toBe("Привет");
  });

  it("falls back to the internet message id property", () => {
    expect(parseEmail(buildOle([str("0037", "x"), str("1035", "<m@x.com>"), props(32, [])])).messageId).toBe("m@x.com");
  });

  it("counts an OLE object apart from an embedded message", () => {
    const email = parseEmail(
      buildOle([str("0037", "x"), props(32, []), { name: "__attach_version1.0_#00000000", type: 1, children: [str("3707", "doc"), props(8, [longProp(0x37050003, 6)])] }]),
    );
    expect(email.warnings.join(" ")).toMatch(/1 embedded object was not listed/);
  });

  it("notes an RTF body that has formatting when the message also has text", () => {
    const email = parseEmail(buildOle([str("0037", "x"), str("1000", "plain"), bin("1009", Uint8Array.of(1, 2, 3)), props(32, [])]));
    expect(email.warnings.join(" ")).toMatch(/without formatting/);
  });
});
