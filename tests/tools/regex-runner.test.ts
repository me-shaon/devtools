import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegexRequest } from "@/utils/regex";

// A worker that only answers when the test tells it to, like one stuck on a slow pattern.
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  posted: { id: number; request: RegexRequest }[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: { id: number; request: RegexRequest }) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  answer(result: unknown) {
    const { id } = this.posted[this.posted.length - 1];
    this.onmessage?.({ data: { id, result } } as MessageEvent);
  }
}

const request: RegexRequest = { pattern: "a", flags: "g", text: "a" };

describe("runRegexInWorker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the worker's result", async () => {
    const { runRegexInWorker } = await import("@/utils/regex-runner");
    const pending = runRegexInWorker(request);
    FakeWorker.instances[0].answer({ ok: true, matches: [], truncated: false });
    await expect(pending).resolves.toEqual({ ok: true, matches: [], truncated: false });
  });

  it("stops a run that takes too long and starts a new worker next time", async () => {
    const { runRegexInWorker, REGEX_TIMEOUT_MS, TIMEOUT_ERROR } = await import("@/utils/regex-runner");
    const pending = runRegexInWorker(request);
    vi.advanceTimersByTime(REGEX_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false, error: TIMEOUT_ERROR });
    expect(FakeWorker.instances[0].terminated).toBe(true);

    runRegexInWorker(request);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("cancels a busy run when a new run starts", async () => {
    const { runRegexInWorker } = await import("@/utils/regex-runner");
    const first = runRegexInWorker(request);
    const second = runRegexInWorker({ ...request, text: "aa" });
    await expect(first).resolves.toBeNull();
    expect(FakeWorker.instances[0].terminated).toBe(true);
    FakeWorker.instances[1].answer({ ok: true, matches: [], truncated: false });
    await expect(second).resolves.toMatchObject({ ok: true });
  });

  it("runs on the main thread when the worker fails", async () => {
    const { runRegexInWorker } = await import("@/utils/regex-runner");
    const pending = runRegexInWorker(request);
    FakeWorker.instances[0].onerror?.();
    await expect(pending).resolves.toMatchObject({ ok: true, matches: [{ value: "a" }] });
  });
});
