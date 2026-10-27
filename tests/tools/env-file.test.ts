import { describe, expect, it } from "vitest";
import { envKey, formatEnv, parseEnv } from "@/utils/env-file";
import { ConversionError } from "@/utils/conversion-error";

describe("parseEnv", () => {
  it("reads plain values, comments, blank lines, and export", () => {
    const text = "# app\nPORT=3000\n\nexport NODE_ENV=production\n  HOST = localhost  \n";
    expect(parseEnv(text)).toEqual({ PORT: "3000", NODE_ENV: "production", HOST: "localhost" });
  });

  it("strips an inline comment from an unquoted value but keeps a # inside a word", () => {
    expect(parseEnv("A=one # note\nB=color#fff")).toEqual({ A: "one", B: "color#fff" });
  });

  it("keeps single-quoted values literal", () => {
    expect(parseEnv("A='x # y \\n $HOME'")).toEqual({ A: "x # y \\n $HOME" });
  });

  it("unescapes double-quoted values", () => {
    expect(parseEnv('A="line1\\nline2\\t\\"q\\" \\\\"')).toEqual({ A: 'line1\nline2\t"q" \\' });
  });

  it("reads multi-line quoted values", () => {
    const text = 'KEY="-----BEGIN-----\nabc\n-----END-----"\nNEXT=1\nB=\'a\nb\'';
    expect(parseEnv(text)).toEqual({ KEY: "-----BEGIN-----\nabc\n-----END-----", NEXT: "1", B: "a\nb" });
  });

  it("allows a comment after a quoted value", () => {
    expect(parseEnv('A="x" # note')).toEqual({ A: "x" });
  });

  it("keeps ${VAR} references as text and lets the last duplicate win", () => {
    expect(parseEnv("URL=${HOST}:80\nURL=again")).toEqual({ URL: "again" });
    expect(parseEnv("URL=${HOST}:80")).toEqual({ URL: "${HOST}:80" });
  });

  it("accepts Windows line endings and empty values", () => {
    expect(parseEnv("A=1\r\nB=\r\n")).toEqual({ A: "1", B: "" });
  });

  it("reports a line without = with its line number", () => {
    try {
      parseEnv("A=1\nnot a pair");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConversionError);
      expect((error as ConversionError).line).toBe(2);
      expect((error as Error).message).toMatch(/^Line 2, column 1: /);
    }
  });

  it("reports a quote that has no end", () => {
    expect(() => parseEnv('A=1\nB="open\nC=2')).toThrow(/^Line 2, column 3: .*closing quote/);
  });

  it("reports text after a closing quote", () => {
    expect(() => parseEnv('A="x" y')).toThrow(/^Line 1/);
  });

  it("stores a __proto__ key as data", () => {
    const parsed = parseEnv("__proto__=x");
    expect(Object.keys(parsed)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });
});

describe("formatEnv", () => {
  it("quotes only values that need it", () => {
    expect(formatEnv([["A", "plain-value_1.2"], ["B", ""], ["C", "has space"], ["D", "it's\nhere"], ["E", "$HOME"]])).toBe(
      "A=plain-value_1.2\nB=\nC='has space'\nD=\"it's\\nhere\"\nE='$HOME'\n",
    );
  });

  it("round trips through parseEnv", () => {
    const values = { A: 'a "b" \\ c', B: "x\ny", C: "it's" };
    expect(parseEnv(formatEnv(Object.entries(values)))).toEqual(values);
  });
});

describe("envKey", () => {
  it("joins a path in UPPER_SNAKE with the chosen separator", () => {
    expect(envKey(["database", "maxPoolSize"], "__")).toBe("DATABASE__MAX_POOL_SIZE");
    expect(envKey(["servers", 0, "host-name"], "_")).toBe("SERVERS_0_HOST_NAME");
    expect(envKey(["API_KEY"], "__")).toBe("API_KEY");
  });
});
