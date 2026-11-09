import { readEmailBytes, type EmailReadResult } from "./email-reader";

/** A message that takes longer than this to read is stopped, so the tool cannot wait without end. */
export const EMAIL_TIMEOUT_MS = 30_000;

export const TIMEOUT_ERROR = `Reading the message took more than ${EMAIL_TIMEOUT_MS / 1000} seconds and was stopped.`;

interface ActiveRead {
  id: number;
  bytes: Uint8Array;
  finish: (result: EmailReadResult | null) => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 0;
let active: ActiveRead | null = null;

const stopWorker = () => {
  worker?.terminate();
  worker = null;
};

const getWorker = () => {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./email-reader.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id: number; result: EmailReadResult }>) => {
        if (active?.id === event.data.id) active.finish(event.data.result);
      };
      worker.onerror = () => {
        // The worker cannot start here, so this read and later reads use the main thread.
        workerFailed = true;
        stopWorker();
        active?.finish(readEmailBytes(active.bytes));
      };
    } catch {
      workerFailed = true;
      return null;
    }
  }
  return worker;
};

/**
 * Reads a message in a worker, so a large file does not freeze the app. A new read cancels the
 * read before it, which then resolves to null. Without worker support, it reads on the main thread.
 */
export function readEmail(bytes: Uint8Array): Promise<EmailReadResult | null> {
  if (active) {
    // The worker is still busy with a message the user has already replaced.
    stopWorker();
    active.finish(null);
  }
  const target = getWorker();
  if (!target) return Promise.resolve(readEmailBytes(bytes));

  const id = ++nextId;
  return new Promise((resolve) => {
    const finish = (result: EmailReadResult | null) => {
      clearTimeout(timer);
      if (active?.id === id) active = null;
      resolve(result);
    };
    const timer = setTimeout(() => {
      stopWorker();
      finish({ ok: false, error: TIMEOUT_ERROR });
    }, EMAIL_TIMEOUT_MS);
    active = { id, bytes, finish };
    target.postMessage({ id, bytes });
  });
}
