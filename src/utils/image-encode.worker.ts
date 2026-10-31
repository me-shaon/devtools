import { processPixels, type ProcessOptions } from "./image-process";

interface ProcessRequest {
  id: number;
  options: ProcessOptions;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<ProcessRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event: MessageEvent<ProcessRequest>) => {
  const { id, options, width, height, data } = event.data;
  try {
    const result = await processPixels({ data, width, height }, options);
    scope.postMessage({ id, result }, [result.bytes.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : "Encoding failed." });
  }
};
