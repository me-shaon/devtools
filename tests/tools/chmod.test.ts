import { describe, expect, it } from "vitest";
import {
  applyExpression,
  bitFor,
  chmodCommands,
  explainMode,
  formatAssignment,
  formatLs,
  formatOctal,
  formatSymbolic,
  parseModeInput,
  parseOctal,
  parseSymbolic,
  parseUmask,
  quotePath,
  umaskDefaults,
} from "@/utils/chmod";

/** Applies an expression and returns the octal result, or the error. */
const apply = (mode: number, expression: string, isDirectory = false) => {
  const result = applyExpression(mode, expression, isDirectory);
  return result.ok ? formatOctal(result.mode) : `error: ${result.error}`;
};

describe("parseOctal", () => {
  it("reads 3 and 4 digit modes, a leading zero, and 0o", () => {
    expect(parseOctal("755")).toEqual({ ok: true, mode: 0o755 });
    expect(parseOctal("0755")).toEqual({ ok: true, mode: 0o755 });
    expect(parseOctal("4755")).toEqual({ ok: true, mode: 0o4755 });
    expect(parseOctal("0o644")).toEqual({ ok: true, mode: 0o644 });
    expect(parseOctal("00644")).toEqual({ ok: true, mode: 0o644 });
    expect(parseOctal(" 7 ")).toEqual({ ok: true, mode: 0o7 });
    expect(parseOctal("0")).toEqual({ ok: true, mode: 0 });
  });

  it("rejects digits above 7, other characters, and too many digits", () => {
    expect(parseOctal("758")).toEqual({ ok: false, error: 'Octal digits go from 0 to 7. "8" is not an octal digit.' });
    expect(parseOctal("7a5")).toMatchObject({ ok: false, error: expect.stringContaining('"a" is not an octal digit') });
    expect(parseOctal("17555")).toMatchObject({ ok: false, error: expect.stringContaining("at most 4 digits") });
    expect(parseOctal("")).toMatchObject({ ok: false });
  });
});

describe("formatOctal and formatSymbolic", () => {
  it("adds a fourth digit only for special bits", () => {
    expect(formatOctal(0o755)).toBe("755");
    expect(formatOctal(0o7)).toBe("007");
    expect(formatOctal(0o1777)).toBe("1777");
  });

  it("shows s, S, t, and T for the special bits", () => {
    expect(formatSymbolic(0o755)).toBe("rwxr-xr-x");
    expect(formatSymbolic(0o4755)).toBe("rwsr-xr-x");
    expect(formatSymbolic(0o4644)).toBe("rwSr--r--");
    expect(formatSymbolic(0o2755)).toBe("rwxr-sr-x");
    expect(formatSymbolic(0o2745)).toBe("rwxr-Sr-x");
    expect(formatSymbolic(0o1777)).toBe("rwxrwxrwt");
    expect(formatSymbolic(0o1776)).toBe("rwxrwxrwT");
    expect(formatSymbolic(0)).toBe("---------");
    expect(formatLs(0o1777, true)).toBe("drwxrwxrwt");
    expect(formatLs(0o644, false)).toBe("-rw-r--r--");
  });

  it("writes the assignment form for chmod", () => {
    expect(formatAssignment(0o755)).toBe("u=rwx,g=rx,o=rx");
    expect(formatAssignment(0o640)).toBe("u=rw,g=r,o=");
    expect(formatAssignment(0o6755)).toBe("u=rwxs,g=rxs,o=rx");
    expect(formatAssignment(0o1777)).toBe("u=rwx,g=rwx,o=rwxt");
  });
});

describe("parseSymbolic", () => {
  it("reads 9 characters and the ls -l form", () => {
    expect(parseSymbolic("rwxr-xr-x")).toEqual({ ok: true, mode: 0o755, fileType: undefined });
    expect(parseSymbolic("-rwsr-xr-x")).toEqual({ ok: true, mode: 0o4755, fileType: "file" });
    expect(parseSymbolic("drwxrwxrwt")).toEqual({ ok: true, mode: 0o1777, fileType: "directory" });
    expect(parseSymbolic("drwxr-xr-x.")).toEqual({ ok: true, mode: 0o755, fileType: "directory" });
    expect(parseSymbolic("-rw-r--r--@")).toMatchObject({ ok: true, mode: 0o644 });
    expect(parseSymbolic("lrwxrwxrwx")).toMatchObject({ ok: true, mode: 0o777, fileType: "symbolic link" });
  });

  it("reads capital S and T as a special bit without execute", () => {
    expect(parseSymbolic("rwSr-Sr-T")).toMatchObject({ ok: true, mode: 0o7644 });
    expect(parseSymbolic("rwsr-sr-t")).toMatchObject({ ok: true, mode: 0o7755 });
  });

  it("names the bad character and the wrong length", () => {
    expect(parseSymbolic("rwxr-xr-")).toMatchObject({ ok: false, error: expect.stringContaining("This one has 8") });
    expect(parseSymbolic("rwxr-xr-xx")).toMatchObject({ ok: false, error: expect.stringContaining('"r" is not a file type') });
    expect(parseSymbolic("rwxr-xr-s")).toMatchObject({ ok: false, error: expect.stringContaining('Character 9 ("s") is not valid. Others execute uses') });
    expect(parseSymbolic("rwtr-xr-x")).toMatchObject({ ok: false, error: expect.stringContaining("Character 3") });
    expect(parseSymbolic("wrxr-xr-x")).toMatchObject({ ok: false, error: expect.stringContaining("Character 1") });
  });
});

describe("applyExpression", () => {
  it("adds, removes, and sets bits for each class", () => {
    expect(apply(0o644, "u+x")).toBe("744");
    expect(apply(0o777, "go-w")).toBe("755");
    expect(apply(0o755, "a=r")).toBe("444");
    expect(apply(0o000, "u=rwx,g=rx,o=")).toBe("750");
    expect(apply(0o644, "ug+rw-x")).toBe("664");
    expect(apply(0o755, "o=")).toBe("750");
    expect(apply(0o755, "u+")).toBe("755");
  });

  it("treats a missing class as a", () => {
    expect(apply(0o644, "+x")).toBe("755");
    expect(apply(0o777, "-w")).toBe("555");
    expect(apply(0o777, "=r")).toBe("444");
  });

  it("adds X only for a directory or a mode with an execute bit", () => {
    expect(apply(0o644, "a+X")).toBe("644");
    expect(apply(0o644, "a+X", true)).toBe("755");
    expect(apply(0o744, "go+X")).toBe("755");
    expect(apply(0o600, "u=rwX,go=rX")).toBe("644");
    expect(apply(0o700, "u=rwX,go=rX")).toBe("755");
  });

  it("sets s only for u and g, and t only for o", () => {
    expect(apply(0o755, "u+s")).toBe("4755");
    expect(apply(0o755, "g+s")).toBe("2755");
    expect(apply(0o755, "o+s")).toBe("755");
    expect(apply(0o777, "+t")).toBe("1777");
    expect(apply(0o777, "u+t")).toBe("777");
    expect(apply(0o6755, "a-s")).toBe("755");
    expect(apply(0o4755, "u=rwx")).toBe("755");
  });

  it("copies the bits of another class", () => {
    expect(apply(0o740, "g=u")).toBe("770");
    expect(apply(0o750, "o=g")).toBe("755");
    expect(apply(0o700, "go+u")).toBe("777");
  });

  it("explains invalid expressions", () => {
    expect(apply(0o755, "x+u")).toContain('"x+u" is not valid. Start each part with u, g, o, or a');
    expect(apply(0o755, "u+z")).toContain('"z" in "u+z" is not a permission');
    expect(apply(0o755, "u+x,")).toContain('"" is not valid');
    expect(apply(0o755, "")).toContain("Enter an expression");
  });
});

describe("parseModeInput", () => {
  it("reads octal, symbolic, ls -l, and bare expressions", () => {
    expect(parseModeInput("0755", 0, false)).toEqual({ ok: true, mode: 0o755, kind: "octal" });
    expect(parseModeInput("-rwxr-xr-x", 0, false)).toEqual({ ok: true, mode: 0o755, kind: "symbolic", fileType: "file" });
    expect(parseModeInput("u+x", 0o644, false)).toEqual({ ok: true, mode: 0o744, kind: "expression" });
    expect(parseModeInput("-w", 0o777, false)).toEqual({ ok: true, mode: 0o555, kind: "expression" });
  });

  it("reads a chmod command with flags and a path", () => {
    expect(parseModeInput("chmod 755 deploy.sh", 0, false)).toEqual({ ok: true, mode: 0o755, kind: "octal", path: "deploy.sh", recursive: false });
    expect(parseModeInput("sudo chmod -R 2775 /srv/shared", 0, true)).toEqual({ ok: true, mode: 0o2775, kind: "octal", path: "/srv/shared", recursive: true });
    expect(parseModeInput("chmod go-w notes.txt", 0o666, false)).toMatchObject({ ok: true, mode: 0o644, kind: "expression" });
    expect(parseModeInput("chmod", 0, false)).toMatchObject({ ok: false });
  });

  it("reads GNU long options and combined short flags", () => {
    expect(parseModeInput("chmod --recursive 755 dir", 0, true)).toEqual({ ok: true, mode: 0o755, kind: "octal", path: "dir", recursive: true });
    expect(parseModeInput("chmod -vR 750 dir", 0, true)).toMatchObject({ ok: true, mode: 0o750, recursive: true });
    expect(parseModeInput("chmod --verbose --changes --silent --quiet 644 a.txt", 0, false)).toMatchObject({ ok: true, mode: 0o644, recursive: false });
    expect(parseModeInput("chmod --no-preserve-root --preserve-root -- 700 x", 0, false)).toMatchObject({ ok: true, mode: 0o700, path: "x" });
    expect(parseModeInput("chmod --reference=other.txt file", 0, false)).toMatchObject({ ok: false, error: expect.stringContaining("--reference copies the mode of another file") });
    expect(parseModeInput("chmod --frobnicate 755 file", 0, false)).toEqual({ ok: false, error: "The chmod option --frobnicate is not supported." });
    // -w is a mode, not a flag.
    expect(parseModeInput("chmod -w file", 0o777, false)).toMatchObject({ ok: true, mode: 0o555, kind: "expression", path: "file" });
  });

  it("returns clear errors", () => {
    expect(parseModeInput("8", 0, false)).toMatchObject({ ok: false, error: expect.stringContaining('"8" is not an octal digit') });
    expect(parseModeInput("rwx", 0, false)).toMatchObject({ ok: false, error: expect.stringContaining("9 characters") });
    expect(parseModeInput("chmod 79 file", 0, false)).toMatchObject({ ok: false, error: expect.stringContaining('"9"') });
  });
});

describe("commands", () => {
  it("builds octal and symbolic commands and quotes paths", () => {
    expect(chmodCommands(0o755, "file", false)).toEqual({ octal: "chmod 755 file", symbolic: "chmod u=rwx,g=rx,o=rx file" });
    expect(chmodCommands(0o1777, "/tmp/shared", true).octal).toBe("chmod -R 1777 /tmp/shared");
    expect(chmodCommands(0o600, "", false).octal).toBe("chmod 600 file");
    expect(quotePath("my file")).toBe("'my file'");
    expect(quotePath("it's")).toBe("'it'\\''s'");
    expect(quotePath("~/.ssh/id_ed25519")).toBe("'~/.ssh/id_ed25519'");
  });
});

describe("explainMode", () => {
  it("describes each class in plain English", () => {
    expect(explainMode(0o750, false)).toEqual(["Owner can read, write, and run.", "Group can read and run.", "Others has no access."]);
    expect(explainMode(0o644, false).slice(0, 2)).toEqual(["Owner can read and write.", "Group can read."]);
  });

  it("uses directory words and warns about read without execute", () => {
    const sentences = explainMode(0o744, true);
    expect(sentences[0]).toBe("Owner can list the files, add, remove, and rename files, and enter.");
    expect(sentences).toContain("Without execute, group and others can see the file names but cannot open the files.");
  });

  it("explains the special bits for files and directories", () => {
    expect(explainMode(0o4755, false)).toContain("Setuid: the program runs as the owner of the file, not as the user who starts it.");
    expect(explainMode(0o4644, false).some((sentence) => sentence.includes("capital S"))).toBe(true);
    expect(explainMode(0o2775, true)).toContain("Setgid: new files in the directory get the group of the directory.");
    expect(explainMode(0o1777, true).some((sentence) => sentence.startsWith("Sticky: only the owner of a file"))).toBe(true);
    expect(explainMode(0o1755, false)).toContain("Sticky: modern systems ignore this bit on files.");
  });
});

describe("umask", () => {
  it("computes the default file and directory modes", () => {
    expect(umaskDefaults(0o022)).toEqual({ file: 0o644, directory: 0o755 });
    expect(umaskDefaults(0o077)).toEqual({ file: 0o600, directory: 0o700 });
    expect(umaskDefaults(0o027)).toEqual({ file: 0o640, directory: 0o750 });
    expect(umaskDefaults(0o002)).toEqual({ file: 0o664, directory: 0o775 });
  });

  it("validates the umask", () => {
    expect(parseUmask("0022")).toEqual({ ok: true, mode: 0o022 });
    expect(parseUmask("028")).toMatchObject({ ok: false, error: expect.stringContaining('"8"') });
    expect(parseUmask("")).toMatchObject({ ok: false, error: "Enter a umask, such as 022." });
    expect(parseUmask("1022")).toMatchObject({ ok: false, error: expect.stringContaining("only the permission bits") });
  });
});

describe("bitFor", () => {
  it("maps a class and permission to its bit", () => {
    expect(bitFor("u", "r")).toBe(0o400);
    expect(bitFor("g", "w")).toBe(0o020);
    expect(bitFor("o", "x")).toBe(0o001);
  });
});
