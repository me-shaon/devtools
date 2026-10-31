/**
 * Runs Code Playground JavaScript away from the app. The code runs in a Worker inside a
 * sandboxed frame without `allow-same-origin`, so it cannot reach the app, its storage, or
 * the Tauri bridge. A Content-Security-Policy blocks every network load, and the Worker keeps
 * a runaway loop off the app's thread.
 */

/** A run that does not finish in this time is stopped. Logs from timers show until then. */
export const RUN_TIMEOUT_MS = 5000;

export const TIMEOUT_ERROR = `The code ran for more than ${RUN_TIMEOUT_MS / 1000} seconds and was stopped. Look for a loop that never ends.`;

export const START_ERROR = "The code could not start because this window cannot run a sandboxed worker.";

/** A message from the runner frame to the app. */
export type RunnerMessage =
  | { type: "ready" }
  | { type: "log"; text: string }
  | { type: "result"; text: string | null }
  | { type: "error"; message: string }
  | { type: "unsupported" };

export interface RunHandlers {
  onLog(text: string): void;
  /** The code returned. The text is null when it returned undefined. */
  onResult(text: string | null): void;
  onError(message: string): void;
}

interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  addEventListener?(type: "unhandledrejection", listener: (event: { reason: unknown; preventDefault(): void }) => void): void;
}

/**
 * The Worker body. It is serialized into the runner frame, so it must not use anything
 * from the module scope. The code gets its own `console`, so logs from async code still arrive.
 */
export function workerMain(scope: WorkerScope) {
  const format = (value: unknown) => {
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };
  const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

  const log = (...args: unknown[]) => scope.postMessage({ type: "log", text: args.map(format).join(" ") });
  const sandboxConsole = { log, info: log, warn: log, error: log, debug: log };

  scope.addEventListener?.("unhandledrejection", (event) => {
    event.preventDefault();
    scope.postMessage({ type: "error", message: errorMessage(event.reason) });
  });

  scope.onmessage = async (event) => {
    scope.onmessage = null;
    const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (console: unknown) => Promise<unknown>;
    try {
      const result = await new AsyncFunction("console", String(event.data))(sandboxConsole);
      scope.postMessage({ type: "result", text: result === undefined ? null : format(result) });
    } catch (error) {
      scope.postMessage({ type: "error", message: errorMessage(error) });
    }
  };
}

/** The policy for the runner frame. The Worker inherits it, so `fetch` and other network loads fail. */
export function runnerCsp(): string {
  return ["default-src 'none'", "script-src 'unsafe-inline' 'unsafe-eval' blob:", "worker-src blob:"].join("; ");
}

/** The runner frame starts the Worker with the first code the app sends and passes its messages on. */
export function buildRunnerDocument(): string {
  // Escaping "<" keeps a "</script>" inside the source from closing the script element
  const source = JSON.stringify(`(${workerMain.toString()})(self);`).replace(/</g, "\\u003c");
  const script = `(() => {
  const send = (message) => parent.postMessage(message, "*");
  let started = false;
  addEventListener("message", (event) => {
    if (event.source !== parent || started || typeof event.data !== "string") return;
    started = true;
    let worker;
    let alive = false;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([${source}], { type: "text/javascript" })));
    } catch {
      send({ type: "unsupported" });
      return;
    }
    worker.onmessage = (message) => {
      alive = true;
      send(message.data);
    };
    // A Worker that cannot load reports an error before it sends anything
    worker.onerror = (error) => {
      error.preventDefault();
      send(alive ? { type: "error", message: error.message || "The code failed." } : { type: "unsupported" });
    };
    worker.postMessage(event.data);
  });
  send({ type: "ready" });
})();`;
  return `<!doctype html>
<html><head><meta http-equiv="Content-Security-Policy" content="${runnerCsp()}"><meta charset="utf-8"></head>
<body><script>${script}</script></body></html>`;
}

/** The sandbox tokens for the runner frame. `allow-same-origin` is never included. */
export const RUNNER_SANDBOX = "allow-scripts";

/**
 * Runs the code in a new hidden frame and returns a function that stops it. The run stops
 * after RUN_TIMEOUT_MS. It reports TIMEOUT_ERROR if the code has not returned by then.
 */
export function startRun(code: string, handlers: RunHandlers): () => void {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", RUNNER_SANDBOX);
  frame.setAttribute("srcdoc", buildRunnerDocument());
  frame.title = "Code runner";
  frame.hidden = true;

  let finished = false;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    frame.remove();
  };

  const timer = setTimeout(() => {
    if (!finished) handlers.onError(TIMEOUT_ERROR);
    stop();
  }, RUN_TIMEOUT_MS);

  const onMessage = (event: MessageEvent) => {
    if (event.source === null || event.source !== frame.contentWindow) return;
    const message = event.data as RunnerMessage | null;
    switch (message?.type) {
      case "ready":
        frame.contentWindow?.postMessage(code, "*");
        break;
      case "log":
        handlers.onLog(String(message.text));
        break;
      case "result":
        finished = true;
        handlers.onResult(typeof message.text === "string" ? message.text : null);
        break;
      case "error":
        finished = true;
        handlers.onError(String(message.message));
        break;
      case "unsupported":
        finished = true;
        handlers.onError(START_ERROR);
        stop();
        break;
    }
  };

  window.addEventListener("message", onMessage);
  document.body.append(frame);
  return stop;
}
