import { useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { FileUp } from "lucide-react";
import {
  CRC_PRESETS,
  crc,
  decodeHex,
  luhnCheckDigit,
  luhnValid,
  type CrcPreset,
} from "@/utils/checksum";
import { blobSource } from "@/utils/byte-source";
import { CopyButton } from "./CopyButton";
import {
  CodeTextarea,
  EditorPane,
  PaneEmpty,
  ToolWorkspace,
} from "./ToolWorkspace";
export function Checksum() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("crc");
  const [format, setFormat] = useState("text");
  const [preset, setPreset] = useState<CrcPreset>("CRC-32/ISO-HDLC");
  const [file, setFile] = useState<{
    name: string;
    bytes: Uint8Array;
  } | null>(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const text = useDebouncedValue(input);
  // Decode the bytes apart from the CRC, so a preset change does not encode the text again.
  const bytes = useMemo(() => {
    if (mode !== "crc") return null;
    if (file) return file.bytes;
    try {
      if (text.length > 1000000)
        throw new Error("Text input is limited to 1 million characters.");
      return format === "hex" ? decodeHex(text) : new TextEncoder().encode(text);
    } catch (e) {
      return e as Error;
    }
  }, [mode, file, text, format]);
  const { output, error } = useMemo(() => {
    let output = "",
      error = "";
    try {
      if (bytes instanceof Error) throw bytes;
      if (bytes) output = crc(bytes, preset);
      else if (text)
        output =
          mode === "validate"
            ? luhnValid(text)
              ? "Valid Luhn checksum"
              : "Invalid Luhn checksum"
            : `${text}${luhnCheckDigit(text)}`;
    } catch (e) {
      error = (e as Error).message;
    }
    return { output, error };
  }, [bytes, text, mode, preset]);
  const p = CRC_PRESETS[preset];
  return (
    <ToolWorkspace
      wrapToolbar
      id="checksum"
      toolbar={
        <>
          <label>
            Operation{" "}
            <select
              className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
              aria-label="Checksum operation"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setFileError("");
              }}
            >
              <option value="crc">CRC</option>
              <option value="validate">Validate Luhn</option>
              <option value="generate">Append Luhn check digit</option>
            </select>
          </label>
          {mode === "crc" && (
            <>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
                aria-label="CRC preset"
                value={preset}
                onChange={(e) => setPreset(e.target.value as CrcPreset)}
              >
                {Object.keys(CRC_PRESETS).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
                aria-label="Input format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="text">UTF-8 text</option>
                <option value="hex">Hex bytes</option>
              </select>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                tabIndex={-1}
                aria-label="Checksum file"
                onChange={async (e) => {
                  const next = e.target.files?.[0];
                  // Clear the input so choosing the same file again fires a change.
                  e.target.value = "";
                  if (!next) return;
                  const id = ++request.current;
                  setBusy(true);
                  setFileError("");
                  setFile(null);
                  try {
                    if (next.size > 8 * 1024 * 1024)
                      throw new Error("Files are limited to 8 MiB.");
                    const bytes = await blobSource(next).read(0, next.size);
                    if (id === request.current)
                      setFile({ name: next.name, bytes });
                  } catch (e) {
                    if (id === request.current)
                      setFileError((e as Error).message);
                  } finally {
                    if (id === request.current) setBusy(false);
                  }
                }}
              />
              <button
                type="button"
                className="toolbar-text-button"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp size={14} aria-hidden="true" />
                Open file
              </button>
            </>
          )}
        </>
      }
      notice={
        (error || fileError) && (
          <div className="workspace-notice" data-tone="error" role="alert">
            {error || fileError}
          </div>
        )
      }
      first={
        <EditorPane
          title="Input"
          htmlFor="checksum-input"
          actions={
            file && (
              <button
                className="toolbar-text-button"
                onClick={() => {
                  request.current++;
                  setFile(null);
                  setFileError("");
                  setBusy(false);
                }}
              >
                Clear file
              </button>
            )
          }
        >
          {mode === "crc" && file ? (
            <p className="p-4">
              {file.name} · {file.bytes.length.toLocaleString()} bytes
            </p>
          ) : (
            <CodeTextarea
              id="checksum-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === "crc"
                  ? "Enter text or hex bytes"
                  : "Enter digits, preserving leading zeroes"
              }
            />
          )}
        </EditorPane>
      }
      second={
        <EditorPane
          title="Result"
          actions={
            <CopyButton value={busy || error || fileError ? "" : output} />
          }
        >
          {busy ? (
            <PaneEmpty title="Reading file" />
          ) : error || fileError ? (
            <PaneEmpty title="Check your input" />
          ) : (
            <pre className="p-4 whitespace-pre-wrap break-all font-mono">
              {output}
            </pre>
          )}
        </EditorPane>
      }
      help={
        <details className="p-3 text-sm">
          <summary className="cursor-pointer">
            CRC parameters and limits
          </summary>
          <p className="pt-2 break-all">
            Polynomial 0x{p.polynomial.toString(16)}; initial value 0x
            {p.init.toString(16)}; final XOR 0x{p.xor.toString(16)};
            input/output reflected: {String(p.reflected)}. Files: up to 8 MiB.
            Text: up to 1 million characters.
          </p>
        </details>
      }
      status={
        <span>
          {mode === "crc"
            ? `${preset} · ${p.width} bits`
            : "Luhn checks structure, not whether an account exists"}
        </span>
      }
    />
  );
}
