import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CsvToJsonConverter } from "@/components/tools/CsvToJsonConverter";
import { csvToObjects, jsonToCsv, withBom } from "@/utils/csv";

const saveFile = vi.fn(async (_data: Blob, _name: string) => true);
vi.mock("@/lib/desktop", () => ({ saveFile: (data: Blob, name: string) => saveFile(data, name) }));

describe("flattening JSON to CSV", () => {
  it("writes nested objects as dot keys and arrays as index keys", () => {
    const data = [{ id: 1, user: { name: "Ann", address: { city: "Oslo" } }, tags: ["a", "b"] }];
    expect(jsonToCsv(data, { flatten: true })).toBe("id,user.name,user.address.city,tags.0,tags.1\n1,Ann,Oslo,a,b");
  });
  it("flattens arrays of objects and leaves gaps for shorter arrays", () => {
    const data = [{ items: [{ sku: "x" }, { sku: "y" }] }, { items: [{ sku: "z" }] }];
    expect(jsonToCsv(data, { flatten: true })).toBe("items.0.sku,items.1.sku\nx,y\nz,");
  });
  it("keeps empty objects and arrays as JSON text", () => {
    expect(jsonToCsv([{ a: {}, b: [], c: null }], { flatten: true })).toBe("a,b,c\n{},[],");
  });
  it("still writes JSON text when flattening is off", () => {
    expect(jsonToCsv([{ a: { b: 1 } }])).toBe('a\n"{""b"":1}"');
  });
  it("adds a UTF-8 byte order mark once", () => {
    expect(withBom("a,b")).toBe("﻿a,b");
    expect(withBom("﻿a,b")).toBe("﻿a,b");
  });
});

describe("nesting CSV to JSON", () => {
  it("turns dot keys into objects and index keys into arrays", () => {
    const csv = "id,user.name,user.address.city,tags.0,tags.1\n1,Ann,Oslo,a,b\n2,Bo,Rome,c,";
    expect(csvToObjects(csv, { nest: true })).toEqual([
      { id: "1", user: { name: "Ann", address: { city: "Oslo" } }, tags: ["a", "b"] },
      { id: "2", user: { name: "Bo", address: { city: "Rome" } }, tags: ["c"] },
    ]);
  });
  it("round trips flattened JSON with type detection", () => {
    const data = [{ id: 7, ok: true, note: null, user: { tags: ["x", "y"], score: 1.5 } }];
    expect(csvToObjects(jsonToCsv(data, { flatten: true }), { nest: true, typed: true })).toEqual([
      { id: 7, ok: true, note: "", user: { tags: ["x", "y"], score: 1.5 } },
    ]);
  });
  it("leaves dot keys flat when nesting is off", () => {
    expect(csvToObjects("a.b\n1")).toEqual([{ "a.b": "1" }]);
  });
});

describe("type detection", () => {
  it("detects numbers, booleans, null and JSON cells", () => {
    const csv = 'n,t,f,z,arr,obj,text\n42,true,FALSE,null,"[1,2]","{""k"":1}",[note]';
    expect(csvToObjects(csv, { typed: true })[0]).toEqual({
      n: 42, t: true, f: false, z: null, arr: [1, 2], obj: { k: 1 }, text: "[note]",
    });
  });
  it("keeps integers that lose precision as text", () => {
    expect(csvToObjects("id\n12345678901234567890", { typed: true })[0]).toEqual({ id: "12345678901234567890" });
  });
});

describe("CsvToJsonConverter nesting and saving", () => {
  const out = async () => ((await screen.findByLabelText(/output$/)) as HTMLTextAreaElement).value;

  it("flattens nested JSON by default", async () => {
    render(<CsvToJsonConverter />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON to CSV" }));
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: '[{"a":{"b":1}}]' } });
    await waitFor(async () => expect(await out()).toBe("a.b\n1"));
    fireEvent.click(screen.getByRole("switch", { name: "Flatten nested objects" }));
    await waitFor(async () => expect(await out()).toBe('a\n"{""b"":1}"'));
  });

  it("nests dot keys when the option is on", async () => {
    render(<CsvToJsonConverter />);
    fireEvent.change(screen.getByLabelText("CSV input"), { target: { value: "a.b\n1" } });
    await waitFor(async () => expect(JSON.parse(await out())).toEqual([{ "a.b": "1" }]));
    fireEvent.click(screen.getByRole("switch", { name: "Nest dot keys" }));
    await waitFor(async () => expect(JSON.parse(await out())).toEqual([{ a: { b: "1" } }]));
  });

  it("saves CSV with a byte order mark when the option is on", async () => {
    render(<CsvToJsonConverter />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON to CSV" }));
    fireEvent.change(screen.getByLabelText("JSON input"), { target: { value: '[{"city":"Zürich"}]' } });
    await waitFor(async () => expect(await out()).toBe("city\nZürich"));
    fireEvent.click(screen.getByRole("switch", { name: "Add BOM for Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "Save CSV" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    const [blob, name] = saveFile.mock.calls[0];
    expect(name).toBe("data.csv");
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const bytes = new Uint8Array(buffer);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
