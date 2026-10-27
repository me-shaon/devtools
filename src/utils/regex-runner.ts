import { runRegex, type RegexRequest, type RegexResult } from "./regex";

/** A run that takes longer than this is stopped, so a runaway pattern cannot freeze the app. */
export const REGEX_TIMEOUT_MS = 2000;

export const TIMEOUT_ERROR = `The pattern ran for more than ${REGEX_TIMEOUT_MS / 1000} seconds and was stopped. Nested quantifiers such as (a+)+ can backtrack without end. Make the pattern more specific.`;

interface ActiveRun {
  id: number;
  request: RegexRequest;
  finish: (result: RegexResult | null) => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 0;
let active: ActiveRun | null = null;

const stopWorker = () => {
  worker?.terminate();
  worker = null;
};

const getWorker = () => {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./regex.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id: number; result: RegexResult }>) => {
        if (active?.id === event.data.id) active.finish(event.data.result);
      };
      worker.onerror = () => {
        // The worker cannot start here, so this run and later runs use the main thread.
        workerFailed = true;
        stopWorker();
        active?.finish(runRegex(active.request));
      };
    } catch {
      workerFailed = true;
      return null;
    }
  }
  return worker;
};

/**
 * Runs the regex in a worker and stops it after REGEX_TIMEOUT_MS. A new run cancels the
 * run before it, which then resolves to null. Without worker support, it runs on the main thread.
 */
export function runRegexInWorker(request: RegexRequest): Promise<RegexResult | null> {
  if (active) {
    // The worker is still busy with input the user has already changed.
    stopWorker();
    active.finish(null);
  }
  const target = getWorker();
  if (!target) return Promise.resolve(runRegex(request));

  const id = ++nextId;
  return new Promise((resolve) => {
    const finish = (result: RegexResult | null) => {
      clearTimeout(timer);
      if (active?.id === id) active = null;
      resolve(result);
    };
    const timer = setTimeout(() => {
      stopWorker();
      finish({ ok: false, error: TIMEOUT_ERROR });
    }, REGEX_TIMEOUT_MS);
    active = { id, request, finish };
    target.postMessage({ id, request });
  });
}
