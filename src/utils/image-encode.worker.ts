import { encodeWithWasm, type WasmFormat } from "./wasm-encoders";

interface EncodeRequest {
  id: number;
  format: WasmFormat;
  quality: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  const { id, format, quality, width, height, data } = event.data;
  try {
    const bytes = await encodeWithWasm(format, { data, width, height }, quality);
    scope.postMessage({ id, bytes }, [bytes.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : "Encoding failed." });
  }
};
