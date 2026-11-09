import { afterEach, describe, expect, it, vi } from "vitest";

const EML = new TextEncoder().encode("From: a@x.com\r\nSubject: Hi\r\n\r\nbody");

/** A worker that answers each message on the next tick, or never when `silent` is set. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static silent = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: { id: number; bytes: Uint8Array }) {
    if (FakeWorker.silent) return;
    setTimeout(async () => {
      const { readEmailBytes } = await import("@/utils/email-reader");
      if (!this.terminated) this.onmessage?.({ data: { id: message.id, result: readEmailBytes(message.bytes) } } as MessageEvent);
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}

const loadRunner = async () => {
  vi.resetModules();
  return import("@/utils/email-runner");
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeWorker.instances = [];
  FakeWorker.silent = false;
});

describe("readEmail", () => {
  it("reads on the main thread without worker support", async () => {
    vi.stubGlobal("Worker", undefined);
    const { readEmail } = await loadRunner();
    const result = await readEmail(EML);
    expect(result).toMatchObject({ ok: true, email: { subject: "Hi" } });
    expect(await readEmail(new TextEncoder().encode("not an email"))).toMatchObject({ ok: false, error: expect.stringMatching(/does not look like an email/) });
  });

  it("reads in a worker, and a newer read replaces an older one", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { readEmail } = await loadRunner();
    const first = readEmail(EML);
    const second = readEmail(new TextEncoder().encode("From: b@x.com\r\nSubject: Second\r\n\r\nbody"));
    expect(await first).toBeNull();
    expect(await second).toMatchObject({ ok: true, email: { subject: "Second" } });
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("stops a read that takes too long", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.silent = true;
    const { readEmail, EMAIL_TIMEOUT_MS } = await loadRunner();
    const pending = readEmail(EML);
    vi.advanceTimersByTime(EMAIL_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ ok: false, error: expect.stringMatching(/took more than/) });
  });

  it("falls back to the main thread when the worker cannot start", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.silent = true;
    const { readEmail } = await loadRunner();
    const pending = readEmail(EML);
    FakeWorker.instances[0].onerror?.();
    expect(await pending).toMatchObject({ ok: true, email: { subject: "Hi" } });
  });
});
