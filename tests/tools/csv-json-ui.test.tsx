import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CsvToJsonConverter } from "@/components/tools/CsvToJsonConverter";
import { csvToObjects, detectDelimiter, jsonToCsv, parseCSV } from "@/utils/csv";

describe("CSV parsing and writing", () => {
  it("parses quoted newlines, delimiters and quotes", () => {
    expect(parseCSV('a,b\n"line1\nline2","x,""y"""\r\nc,d')).toEqual([["a", "b"], ["line1\nline2", 'x,"y"'], ["c", "d"]]);
  });
  it("quotes values with the active delimiter, quotes and newlines", () => {
    const csv = jsonToCsv([{ a: "x;y", b: 'say "hi"', c: "l1\nl2", d: "plain" }], { delimiter: ";" });
    expect(csv).toBe('a;b;c;d\n"x;y";"say ""hi""";"l1\nl2";plain');
    expect(parseCSV(csv, { delimiter: ";" })[1]).toEqual(["x;y", 'say "hi"', "l1\nl2", "plain"]);
  });
  it("does not quote commas when the delimiter is a semicolon", () => {
    expect(jsonToCsv([{ a: "1,5" }], { delimiter: ";" })).toBe("a\n1,5");
  });
  it("stringifies nested values", () => {
    expect(jsonToCsv([{ id: 1, tags: ["a", "b"], meta: { k: 1 } }])).toBe('id,tags,meta\n1,"[""a"",""b""]","{""k"":1}"');
  });
  it("uses the union of keys across rows", () => {
    expect(jsonToCsv([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }])).toBe("a,b,c\n1,,\n,2,\n3,,4");
  });
  it("accepts a single object, primitives and arrays of arrays", () => {
    expect(jsonToCsv({ a: 1 })).toBe("a\n1");
    expect(jsonToCsv([1, 2])).toBe("value\n1\n2");
    expect(jsonToCsv([[1, 2], [3, 4]])).toBe("column1,column2\n1,2\n3,4");
  });
  it("keeps edge spaces on a round trip", () => {
    const csv = jsonToCsv([{ a: "  pad  " }]);
    expect(parseCSV(csv, { trimValues: true })[1][0]).toBe("pad");
    expect(csv).toContain('"  pad  "');
  });
  it("does not convert zero-padded or hex strings to numbers", () => {
    expect(csvToObjects("a,b,c\n007,0x10,1.5", { typed: true })[0]).toEqual({ a: "007", b: "0x10", c: 1.5 });
  });
  it("names columns when there is no header", () => {
    expect(csvToObjects("1,2\n3,4", { hasHeader: false })).toEqual([{ column1: "1", column2: "2" }, { column1: "3", column2: "4" }]);
  });
  it("ignores delimiters inside quotes when detecting", () => {
    expect(detectDelimiter('"a,b,c";"d"')).toBe(";");
  });
});

describe("CsvToJsonConverter", () => {
  const out = () => (screen.getByLabelText(/Output$/) as HTMLTextAreaElement).value;
  it("auto-detects a semicolon delimiter", () => {
    render(<CsvToJsonConverter />);
    fireEvent.change(screen.getByLabelText("CSV Input"), { target: { value: "a;b\n1;2" } });
    fireEvent.click(screen.getByRole("button", { name: "Convert to JSON" }));
    expect(JSON.parse(out())).toEqual([{ a: "1", b: "2" }]);
  });
  it("converts JSON to CSV and uses the result when switching back", () => {
    render(<CsvToJsonConverter />);
    fireEvent.click(screen.getByRole("button", { name: "JSON to CSV" }));
    fireEvent.change(screen.getByLabelText("JSON Input"), { target: { value: '[{"n":"a,b","v":[1]}]' } });
    fireEvent.click(screen.getByRole("button", { name: "Convert to CSV" }));
    expect(out()).toBe('n,v\n"a,b",[1]');
    fireEvent.click(screen.getByRole("button", { name: "CSV to JSON" }));
    expect((screen.getByLabelText("CSV Input") as HTMLTextAreaElement).value).toBe('n,v\n"a,b",[1]');
  });
  it("shows no output for invalid JSON", () => {
    render(<CsvToJsonConverter />);
    fireEvent.click(screen.getByRole("button", { name: "JSON to CSV" }));
    fireEvent.change(screen.getByLabelText("JSON Input"), { target: { value: "{bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Convert to CSV" }));
    expect(screen.queryByLabelText("CSV Output")).toBeNull();
  });
});
