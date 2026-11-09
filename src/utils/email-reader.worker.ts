import { readEmailBytes } from "./email-reader";

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ id: number; bytes: Uint8Array }>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, bytes } = event.data;
  scope.postMessage({ id, result: readEmailBytes(bytes) });
};
