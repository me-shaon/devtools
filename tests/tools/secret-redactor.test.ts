import { describe, expect, it } from "vitest";
import {
  findSecrets,
  luhnValid,
  redactText,
  restorePlaceholders,
  shannonEntropy,
  type DetectorId,
  type RedactOptions,
} from "@/utils/secret-redactor";

// Every fake secret here is obviously fake: repeated letters or the documented AWS example values.
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const GITHUB = `ghp_${"x".repeat(36)}`;
const OPENAI = `sk-proj-${"x".repeat(40)}`;
const ANTHROPIC = `sk-ant-api03-${"x".repeat(40)}`;
const GOOGLE = `AIza${"x".repeat(35)}`;
const STRIPE = `sk_test_${"x".repeat(24)}`;
const SLACK = `xoxb-${"0".repeat(10)}-${"x".repeat(12)}`;
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.ZmFrZXNpZ25hdHVyZWZha2U";

/** Run one detector alone and return the matched values. */
const only = (id: DetectorId, text: string, extra: RedactOptions = {}) => {
  const detectors = { [id]: true } as Partial<Record<DetectorId, boolean>>;
  for (const other of [
    "private-key", "aws-access-key", "aws-secret-key", "github-token", "anthropic-key", "openai-key", "google-api-key",
    "stripe-key", "slack-token", "slack-webhook", "jwt", "bearer-token", "connection-password", "secret-assignment",
    "email", "ip-address", "credit-card", "ssn", "phone", "high-entropy",
  ] as DetectorId[]) {
    if (other !== id) detectors[other] = false;
  }
  return findSecrets(text, { ...extra, detectors }).map((m) => m.value);
};

describe("luhnValid and shannonEntropy", () => {
  it("validates card checksums", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(luhnValid("41x1")).toBe(false);
  });

  it("measures entropy in bits per character", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("abcd")).toBe(2);
    expect(shannonEntropy("")).toBe(0);
  });
});

describe("detectors", () => {
  it("finds AWS access key IDs", () => {
    expect(only("aws-access-key", `key ${AWS_KEY} here`)).toEqual([AWS_KEY]);
    expect(only("aws-access-key", "AKIA1234")).toEqual([]);
  });

  it("finds AWS secret keys only in context", () => {
    expect(only("aws-secret-key", `aws_secret_access_key = ${AWS_SECRET}`)).toEqual([AWS_SECRET]);
    expect(only("aws-secret-key", `value = ${AWS_SECRET}`)).toEqual([]);
  });

  it("finds GitHub tokens", () => {
    expect(only("github-token", `token ${GITHUB}`)).toEqual([GITHUB]);
    expect(only("github-token", `github_pat_${"x".repeat(30)}`)).toHaveLength(1);
    expect(only("github-token", "ghp_short")).toEqual([]);
  });

  it("tells OpenAI and Anthropic keys apart", () => {
    expect(only("openai-key", OPENAI)).toEqual([OPENAI]);
    expect(only("openai-key", ANTHROPIC)).toEqual([]);
    expect(only("anthropic-key", ANTHROPIC)).toEqual([ANTHROPIC]);
    expect(only("openai-key", "sk-short")).toEqual([]);
  });

  it("finds Google, Stripe, and Slack keys", () => {
    expect(only("google-api-key", GOOGLE)).toEqual([GOOGLE]);
    expect(only("google-api-key", "AIzaShort")).toEqual([]);
    expect(only("stripe-key", STRIPE)).toEqual([STRIPE]);
    expect(only("stripe-key", `pk_test_${"x".repeat(24)}`)).toEqual([]);
    expect(only("slack-token", SLACK)).toEqual([SLACK]);
    expect(only("slack-token", "xoxz-0000000000")).toEqual([]);
    const hook = `https://hooks.slack.com/services/T${"0".repeat(8)}/B${"0".repeat(8)}/${"x".repeat(24)}`;
    expect(only("slack-webhook", `post to ${hook}`)).toEqual([hook]);
    expect(only("slack-webhook", "https://hooks.slack.com/")).toEqual([]);
  });

  it("finds private key blocks, including truncated ones", () => {
    const block = `-----BEGIN RSA PRIVATE KEY-----\n${"x".repeat(64)}\n-----END RSA PRIVATE KEY-----`;
    expect(only("private-key", `before\n${block}\nafter`)).toEqual([block]);
    expect(only("private-key", `-----BEGIN PRIVATE KEY-----\n${"x".repeat(20)}\n\nnext`)).toEqual([`-----BEGIN PRIVATE KEY-----\n${"x".repeat(20)}`]);
    expect(only("private-key", "-----BEGIN PUBLIC KEY-----\nxxxx\n-----END PUBLIC KEY-----")).toEqual([]);
  });

  it("finds JWTs", () => {
    expect(only("jwt", `token=${JWT};`)).toEqual([JWT]);
    expect(only("jwt", "eyJabc.notjwt")).toEqual([]);
  });

  it("finds Authorization header values", () => {
    expect(only("bearer-token", `Authorization: Bearer ${"x".repeat(32)}`)).toEqual(["x".repeat(32)]);
    expect(only("bearer-token", "Authorization: Basic dXNlcjpwYXNzd29yZA==")).toEqual(["dXNlcjpwYXNzd29yZA=="]);
    expect(only("bearer-token", "the bearer of bad news")).toEqual([]);
  });

  it("masks only the password of a connection string", () => {
    const result = redactText("postgres://admin:hunter2@db.example.com:5432/app", { style: "label" });
    expect(result.output).toBe("postgres://admin:[REDACTED:password]@db.example.com:5432/app");
    expect(only("connection-password", "https://example.com/path")).toEqual([]);
  });

  it("masks secret values in key=value, JSON, YAML, and .env text and keeps the key", () => {
    const text = [
      'password=hunter22 user=bob',
      '{"api_key": "abc123def"}',
      "client_secret: my yaml secret # comment",
      "DB_PASSWORD='quoted value'",
      "max_tokens: 4096",
      "token_url: https://example.com",
      "password: null",
      "author: Jane",
    ].join("\n");
    expect(only("secret-assignment", text)).toEqual(["hunter22", "abc123def", "my yaml secret", "quoted value"]);
    expect(redactText("password=hunter22 user=bob", { style: "label" }).output).toBe("password=[REDACTED:secret] user=bob");
  });

  it("finds emails", () => {
    expect(only("email", "mail jane.doe+test@example.co.uk now")).toEqual(["jane.doe+test@example.co.uk"]);
    expect(only("email", "user@localhost and @handle")).toEqual([]);
  });

  it("finds IP addresses and keeps private ones by default", () => {
    expect(only("ip-address", "from 8.8.8.8 and 10.0.0.1")).toEqual(["8.8.8.8"]);
    expect(only("ip-address", "from 8.8.8.8 and 10.0.0.1", { keepPrivateIps: false })).toEqual(["8.8.8.8", "10.0.0.1"]);
    expect(only("ip-address", "version 999.1.1.1 and 1.2.3")).toEqual([]);
    expect(only("ip-address", "v6 2001:db8::8a2e:370:7334 and ::1")).toEqual(["2001:db8::8a2e:370:7334"]);
    expect(only("ip-address", "at 12:30:45 std::vector Face::add")).toEqual([]);
  });

  it("finds card numbers only when the Luhn check passes", () => {
    expect(only("credit-card", "card 4111 1111 1111 1111 ok")).toEqual(["4111 1111 1111 1111"]);
    expect(only("credit-card", "card 4111 1111 1111 1112")).toEqual([]);
    expect(only("credit-card", "order 1234567890")).toEqual([]);
  });

  it("finds SSNs and phone numbers only when switched on", () => {
    expect(findSecrets("ssn 123-45-6789").length).toBe(0);
    expect(only("ssn", "ssn 123-45-6789")).toEqual(["123-45-6789"]);
    expect(only("ssn", "ssn 000-45-6789 and 123-456-789")).toEqual([]);
    expect(findSecrets("call +14155550123").length).toBe(0);
    expect(only("phone", "call +14155550123 or (415) 555-0123 or +44 20 7946 0958")).toEqual([
      "+14155550123",
      "(415) 555-0123",
      "+44 20 7946 0958",
    ]);
    expect(only("phone", "build 2024.1")).toEqual([]);
  });

  it("finds high-entropy strings only when switched on", () => {
    const random = "Q7f9Zk2LmP4xR8sT1vW6yB3n";
    expect(findSecrets(`id ${random}`).length).toBe(0);
    expect(only("high-entropy", `id ${random}`)).toEqual([random]);
    expect(only("high-entropy", "aaaaaaaaaaaaaaaaaaaaaaaa1")).toEqual([]);
  });
});

describe("redactText", () => {
  it("resolves overlaps so the most specific detector wins", () => {
    const result = redactText(`api_key = "${OPENAI}"\nAuthorization: Bearer ${JWT}`, { style: "label" });
    expect(result.output).toBe('api_key = "[REDACTED:openai-key]"\nAuthorization: Bearer [REDACTED:jwt]');
    expect(result.total).toBe(2);
  });

  it("does not report an email inside a connection string password", () => {
    const result = redactText("redis://:s3cret@cache.example.com", { style: "label" });
    expect(result.output).toBe("redis://:[REDACTED:password]@cache.example.com");
  });

  it("masks partially, keeping the first 4 and last 2 characters", () => {
    expect(redactText(GITHUB, { style: "partial" }).output).toBe("ghp_****xx");
    expect(redactText("password=short1", { style: "partial" }).output).toBe("password=********");
  });

  it("uses one placeholder per distinct value and restores them", () => {
    const text = `from a@example.com to b@example.com, cc a@example.com\nkey ${GITHUB}`;
    const result = redactText(text, { style: "placeholder" });
    expect(result.output).toBe("from <EMAIL_1> to <EMAIL_2>, cc <EMAIL_1>\nkey <GITHUB_TOKEN_1>");
    expect(result.mapping).toEqual([
      { placeholder: "<EMAIL_1>", original: "a@example.com", detector: "email" },
      { placeholder: "<EMAIL_2>", original: "b@example.com", detector: "email" },
      { placeholder: "<GITHUB_TOKEN_1>", original: GITHUB, detector: "github-token" },
    ]);
    expect(result.output).not.toContain("a@example.com");

    expect(restorePlaceholders(result.output, result.mapping).output).toBe(text);
    const reply = restorePlaceholders("Write to <EMAIL_2> and <EMAIL_9>.", result.mapping);
    expect(reply).toEqual({ output: "Write to b@example.com and <EMAIL_9>.", restored: 1, unknown: ["<EMAIL_9>"] });
  });

  it("reports findings with counts and first line numbers", () => {
    const result = redactText(`line one\nmail a@example.com\n${AWS_KEY}\nmail b@example.com`);
    expect(result.findings).toEqual([
      { detector: "email", label: "Email addresses", count: 2, firstLine: 2 },
      { detector: "aws-access-key", label: "AWS access key IDs", count: 1, firstLine: 3 },
    ]);
    expect(result.types).toBe(2);
  });

  it("leaves text without secrets unchanged", () => {
    const result = redactText("nothing to see here");
    expect(result.output).toBe("nothing to see here");
    expect(result.total).toBe(0);
  });

  it("handles 1 MB of input quickly", () => {
    const chunk = [
      `user=bob password=hunter22 ip=8.8.8.8 mail=jane@example.com ${AWS_KEY}`,
      `Authorization: Bearer ${"x".repeat(40)} card 4111111111111111`,
      "plain log line with words, numbers 12345 and paths /usr/local/bin",
      "a".repeat(200),
      " ".repeat(200) + "-",
      "1".repeat(200),
      "x:".repeat(100),
    ].join("\n");
    const text = chunk.repeat(Math.ceil(1_000_000 / chunk.length)).slice(0, 1_000_000);
    const all: RedactOptions = { detectors: { ssn: true, phone: true, "high-entropy": true }, style: "placeholder" };
    const started = performance.now();
    const result = redactText(text, all);
    const elapsed = performance.now() - started;
    expect(result.total).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(1500);
  });

  it("stays linear on hostile input", () => {
    const hostile = ["a".repeat(300_000), " ".repeat(300_000), "a=".repeat(100_000), ":".repeat(100_000)].join("");
    const started = performance.now();
    redactText(hostile, { detectors: { ssn: true, phone: true, "high-entropy": true } });
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
