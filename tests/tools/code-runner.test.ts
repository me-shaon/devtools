import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRunnerDocument,
  RUN_TIMEOUT_MS,
  runnerCsp,
  START_ERROR,
  startRun,
  TIMEOUT_ERROR,
  workerMain,
  type RunnerMessage,
} from "@/utils/code-runner";

/** Runs the code through the Worker body and collects its messages until it returns or throws. */
const runInWorker = (code: string) =>
  new Promise<RunnerMessage[]>((resolve) => {
    const messages: RunnerMessage[] = [];
    const scope = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (message: RunnerMessage) => {
        messages.push(message);
        if (message.type !== "log") resolve(messages);
      },
    };
    workerMain(scope);
    scope.onmessage?.({ data: code });
  });

const runnerFrame = () => document.querySelector<HTMLIFrameElement>('iframe[title="Code runner"]');

const fromFrame = (data: RunnerMessage) =>
  window.dispatchEvent(new MessageEvent("message", { data, source: runnerFrame()!.contentWindow }));

const handlers = () => ({ onLog: vi.fn(), onResult: vi.fn(), onError: vi.fn() });

describe("workerMain", () => {
  it("formats logged values and reports the return value", async () => {
    expect(await runInWorker('console.log("a", 1, { b: [2] }); console.warn(null); return 42;')).toEqual([
      { type: "log", text: 'a 1 {\n  "b": [\n    2\n  ]\n}' },
      { type: "log", text: "null" },
      { type: "result", text: "42" },
    ]);
  });

  it("awaits top-level await and reports undefined as no result", async () => {
    expect(await runInWorker('const v = await Promise.resolve("x"); console.log(v);')).toEqual([
      { type: "log", text: "x" },
      { type: "result", text: null },
    ]);
  });

  it("reports thrown errors and syntax errors", async () => {
    expect(await runInWorker("missing();")).toEqual([{ type: "error", message: "missing is not defined" }]);
    expect((await runInWorker("let = ;"))[0].type).toBe("error");
    expect(await runInWorker('throw "plain"')).toEqual([{ type: "error", message: "plain" }]);
  });

  it("falls back to String for values JSON cannot encode", async () => {
    const [log] = await runInWorker("const a = {}; a.self = a; console.log(a);");
    expect(log).toEqual({ type: "log", text: "[object Object]" });
  });
});

describe("buildRunnerDocument", () => {
  it("puts a policy that blocks the network ahead of the script", () => {
    const html = buildRunnerDocument();
    expect(runnerCsp()).toContain("default-src 'none'");
    expect(runnerCsp()).not.toContain("connect-src");
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script>"));
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe("startRun", () => {
  afterEach(() => vi.useRealTimers());

  it("runs in a sandboxed frame without same-origin access", () => {
    const stop = startRun("1", handlers());
    expect(runnerFrame()?.getAttribute("sandbox")).toBe("allow-scripts");
    stop();
    expect(runnerFrame()).toBeNull();
  });

  it("sends the code when the frame is ready and passes messages on", () => {
    const h = handlers();
    const stop = startRun("console.log(1)", h);
    const post = vi.spyOn(runnerFrame()!.contentWindow!, "postMessage");

    fromFrame({ type: "ready" });
    expect(post).toHaveBeenCalledWith("console.log(1)", "*");

    fromFrame({ type: "log", text: "1" });
    fromFrame({ type: "result", text: null });
    expect(h.onLog).toHaveBeenCalledWith("1");
    expect(h.onResult).toHaveBeenCalledWith(null);
    stop();
  });

  it("ignores messages from other windows", () => {
    const h = handlers();
    const stop = startRun("1", h);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "log", text: "x" }, source: window }));
    expect(h.onLog).not.toHaveBeenCalled();
    stop();
  });

  it("stops a run that does not finish in time", () => {
    vi.useFakeTimers();
    const h = handlers();
    startRun("while (true) {}", h);
    vi.advanceTimersByTime(RUN_TIMEOUT_MS);
    expect(h.onError).toHaveBeenCalledWith(TIMEOUT_ERROR);
    expect(runnerFrame()).toBeNull();
  });

  it("keeps the result of a finished run when the time runs out", () => {
    vi.useFakeTimers();
    const h = handlers();
    startRun("setInterval(() => {}, 10)", h);
    fromFrame({ type: "result", text: null });
    vi.advanceTimersByTime(RUN_TIMEOUT_MS);
    expect(h.onError).not.toHaveBeenCalled();
    expect(runnerFrame()).toBeNull();
  });

  it("reports a frame that cannot start a worker", () => {
    const h = handlers();
    startRun("1", h);
    fromFrame({ type: "unsupported" });
    expect(h.onError).toHaveBeenCalledWith(START_ERROR);
    expect(runnerFrame()).toBeNull();
  });
});
