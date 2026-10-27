import { runRegex, type RegexRequest } from "./regex";

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ id: number; request: RegexRequest }>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, request } = event.data;
  scope.postMessage({ id, result: runRegex(request) });
};
